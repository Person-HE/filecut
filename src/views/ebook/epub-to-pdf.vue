<script setup>
/**
 * EPUB转PDF - 用 epub.js 渲染每章，转PDF
 * 用 pdf-lib 生成PDF，注意大文件分批处理
 */
import { ref, computed } from 'vue'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, replaceExt } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')
const fontSize = ref(14)
const pageWidth = ref(595)   // A4 width in points (72dpi)
const pageHeight = ref(842)  // A4 height
const margin = ref(50)
const chapterRange = ref('all') // all / first-N

async function loadEpubJs() {
  if (window.ePub) return window.ePub
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('epub.js 加载失败'))
    document.head.appendChild(s)
  })
  return window.ePub
}

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  error.value = ''
}

async function process() {
  if (!file.value) { showError('请先选择EPUB'); return }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressMsg.value = '加载 epub.js...'

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    await loadEpubJs()
    const epubjs = window.ePub

    progressMsg.value = '打开 EPUB...'
    const buf = await readFileAsArrayBuffer(file.value)
    const book = epubjs(buf)

    const spine = await book.loaded.spine
    let items = spine.items.slice()
    // 限制范围
    if (chapterRange.value !== 'all') {
      const n = parseInt(chapterRange.value) || 1
      items = items.slice(0, Math.max(1, n))
    }
    const totalChapters = items.length

    // 创建 PDF
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    // Helvetica 不支持中文，我们用 Times-Roman 兜底
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)

    let chapterIdx = 0
    for (const item of items) {
      chapterIdx++
      progressMsg.value = `渲染章节 ${chapterIdx}/${totalChapters}`
      progress.value = Math.round((chapterIdx - 1) / totalChapters * 80)

      // 加载章节
      const doc = await item.load(book.load.bind(book))
      const text = extractTextFromChapter(doc)

      // 添加章节标题
      const titlePage = pdfDoc.addPage([pageWidth.value, pageHeight.value])
      titlePage.drawText(`Chapter ${chapterIdx}`, {
        x: margin.value,
        y: pageHeight.value - margin.value - 30,
        size: 20,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.1)
      })

      // 分页文本
      const lines = wrapText(text, font, fontSize.value, pageWidth.value - 2 * margin.value)
      const linesPerPage = Math.floor((pageHeight.value - 2 * margin.value) / (fontSize.value * 1.4))

      for (let i = 0; i < lines.length; i += linesPerPage) {
        const page = pdfDoc.addPage([pageWidth.value, pageHeight.value])
        const pageLines = lines.slice(i, i + linesPerPage)
        pageLines.forEach((line, j) => {
          try {
            page.drawText(line, {
              x: margin.value,
              y: pageHeight.value - margin.value - (j + 1) * fontSize.value * 1.4,
              size: fontSize.value,
              font: font,
              color: rgb(0, 0, 0)
            })
          } catch (e) {
            // 跳过无法编码的字符
          }
        })
      }
    }

    progressMsg.value = '生成 PDF...'
    progress.value = 90

    const pdfBytes = await pdfDoc.save()
    if (!pdfBytes || pdfBytes.length === 0) throw new Error('PDF 为空')
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const outName = replaceExt(file.value.name, '.pdf')
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    progress.value = 100
    progressMsg.value = '完成'

    try { book.destroy() } catch (e) {}
  }, 'EPUB转PDF失败')

  processing.value = false
}

function extractTextFromChapter(doc) {
  // doc 是 Document 对象 (DOM)
  if (!doc) return ''
  const body = doc.body || doc.documentElement
  if (!body) return ''
  // 提取文本，保留段落
  const walk = (node, depth = 0) => {
    let text = ''
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) { // Text
        text += child.textContent
      } else if (child.nodeType === 1) { // Element
        const tag = child.tagName.toLowerCase()
        if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tag)) {
          text += '\n' + walk(child, depth + 1) + '\n'
        } else {
          text += walk(child, depth + 1)
        }
      }
    })
    return text
  }
  let text = walk(body)
  // 清理多余空行
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

function wrapText(text, font, size, maxWidth) {
  const lines = []
  const paragraphs = text.split('\n')
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('')
      continue
    }
    // 中文按字符宽度切分，英文按词
    const chars = Array.from(para)
    let current = ''
    for (const ch of chars) {
      const tryLine = current + ch
      try {
        const w = font.widthOfTextAtSize(tryLine, size)
        if (w > maxWidth && current) {
          lines.push(current)
          current = ch
        } else {
          current = tryLine
        }
      } catch (e) {
        // 字符不能编码，跳过
        current = current + '?'
      }
    }
    if (current) lines.push(current)
  }
  return lines
}
</script>

<template>
  <ToolLayout title="EPUB转PDF" desc="将EPUB电子书渲染为PDF，支持分章处理" icon="⇒">
    <FileDrop accept=".epub,application/epub+zip"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传 .epub 文件" icon="⇒" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ file.name }}</strong>
          <span class="file-meta"> · {{ formatBytes(file.size) }}</span>
        </div>
      </div>
    </div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">转换选项</h3>
      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">字号 (pt)</label>
          <select v-model.number="fontSize" class="nb-select">
            <option :value="10">10 - 小</option>
            <option :value="12">12 - 较小</option>
            <option :value="14">14 - 标准</option>
            <option :value="16">16 - 较大</option>
            <option :value="18">18 - 大</option>
          </select>
        </div>
        <div>
          <label class="nb-label">页面尺寸</label>
          <select v-model.number="pageWidth" class="nb-select" @change="pageHeight = pageWidth === 595 ? 842 : (pageWidth === 612 ? 792 : 1000)">
            <option :value="595">A4 (595×842)</option>
            <option :value="612">Letter (612×792)</option>
            <option :value="420">A5 (420×595)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">章节范围</label>
          <select v-model="chapterRange" class="nb-select">
            <option value="all">全部章节</option>
            <option value="5">前 5 章</option>
            <option value="10">前 10 章</option>
            <option value="20">前 20 章</option>
          </select>
        </div>
      </div>
      <div class="nb-alert info mt-16">
        ⚠ 注意：EPUB转PDF为文本提取方式，复杂排版/图片可能丢失。中文可能因字体限制显示为方框，建议英文EPUB使用。
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>⇒ 转 PDF</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-label">{{ progress }}% - {{ progressMsg }}</div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
</style>

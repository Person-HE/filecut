<script setup>
/**
 * PPT 转 Markdown
 * - 解析每页文字，识别标题、列表
 * - 输出Markdown文件
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { replaceExt } from '../../utils/download.js'
import JSZip from 'jszip'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const markdownPreview = ref('')
const objectUrls = ref([])

// 选项
const includeImages = ref(false)  // 是否包含图片链接（图片单独导出）
const slideAsH1 = ref(true)        // 每页用一级标题
const includeSlideNotes = ref(false)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  markdownPreview.value = ''
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  markdownPreview.value = ''
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

async function parsePptxToMarkdown(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)[1])
      const nb = parseInt(b.match(/slide(\d+)\.xml/)[1])
      return na - nb
    })

  if (!slideFiles.length) throw new Error('未找到任何幻灯片，可能不是有效的 .pptx 文件')

  // 解析备注
  async function getNotes(slideNum) {
    if (!includeSlideNotes.value) return ''
    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`
    const notesXml = await zip.file(notesPath)?.async('string') || ''
    if (!notesXml) return ''
    const parser = new DOMParser()
    const doc = parser.parseFromString(notesXml, 'text/xml')
    const textNodes = doc.getElementsByTagName('a:t')
    const notes = []
    for (let i = 0; i < textNodes.length; i++) {
      const t = textNodes[i].textContent
      if (t && t.trim() && !/^\d+$/.test(t.trim())) notes.push(t.trim())
    }
    return notes.join(' ')
  }

  const md = []
  md.push(`# ${replaceExt(file.value.name, '')}\n`)
  md.push(`> 共 ${slideFiles.length} 页幻灯片\n`)

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i]
    const slideXml = await zip.file(slidePath).async('string')
    const slideNum = slidePath.match(/slide(\d+)\.xml/)[1]

    const parser = new DOMParser()
    const doc = parser.parseFromString(slideXml, 'text/xml')

    // 提取所有文字段
    const spEls = Array.from(doc.getElementsByTagName('p:sp'))
    const textBlocks = []
    for (const sp of spEls) {
      const texts = Array.from(sp.getElementsByTagName('a:t')).map(t => t.textContent).filter(t => t && t.trim())
      if (texts.length) {
        // 判断是否是标题
        const isTitle = sp.getElementsByTagName('p:ph').length > 0 &&
          Array.from(sp.getElementsByTagName('p:ph')).some(ph => {
            const type = ph.getAttribute('type')
            return type === 'title' || type === 'ctrTitle'
          })
        textBlocks.push({ isTitle, texts })
      }
    }

    // 一级标题：第N页
    if (slideAsH1.value) {
      md.push(`\n## 第 ${i+1} 页\n`)
    } else {
      md.push(`\n---\n\n## 第 ${i+1} 页\n`)
    }

    // 标题作为H2，正文作为列表
    let hasTitle = false
    let hasContent = false
    for (const block of textBlocks) {
      if (block.isTitle && !hasTitle) {
        md.push(`\n### ${block.texts.join(' ')}\n`)
        hasTitle = true
      } else {
        for (const t of block.texts) {
          md.push(`- ${t}`)
          hasContent = true
        }
      }
    }

    if (!hasTitle && !hasContent) {
      md.push(`\n*(空白幻灯片)*\n`)
    }

    // 备注
    const notes = await getNotes(slideNum)
    if (notes) {
      md.push(`\n**备注：** ${notes}\n`)
    }
  }

  return md.join('\n')
}

async function process() {
  if (!file.value) {
    showError('请先选择文件')
    return
  }
  if (file.value.size === 0) {
    error.value = '文件为空'
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  cleanupUrls()

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const md = await parsePptxToMarkdown(buf)

    if (!md || !md.trim()) throw new Error('PPT内容为空')

    markdownPreview.value = md

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    if (!blob.size) throw new Error('生成Markdown失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '.md')
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, 'PPT转Markdown失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="PPT转Markdown" desc="将PPT幻灯片内容转为Markdown文档" icon="M">
    <FileDrop accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              :multiple="false" hint="仅支持 .pptx 格式"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">输出选项</h3>
      <div class="mt-16" style="display:flex; flex-direction:column; gap:8px;">
        <label class="opt-row">
          <input type="checkbox" v-model="slideAsH1" />
          <span>每页作为一级标题（## 第N页）</span>
        </label>
        <label class="opt-row">
          <input type="checkbox" v-model="includeSlideNotes" />
          <span>包含演讲者备注</span>
        </label>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="markdownPreview" class="nb-card mt-16">
      <h3 class="nb-h3">Markdown 预览</h3>
      <pre class="md-preview">{{ markdownPreview.length > 8000 ? markdownPreview.slice(0, 8000) + '\n\n... (仅显示前8000字符)' : markdownPreview }}</pre>
    </div>

    <ResultViewer :files="result" :text="markdownPreview" />
  </ToolLayout>
</template>

<style scoped>
.opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 13px;
  cursor: pointer;
  padding: 6px;
  border: 2px solid transparent;
}
.opt-row:hover { background: var(--paper-darker); }
.md-preview {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  border: 3px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 12px;
}
</style>

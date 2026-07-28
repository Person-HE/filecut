<script setup>
/**
 * PDF转Markdown - 提取文本，识别标题层级、列表、加粗、表格
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf } from '../../utils/pdfjs.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false
  password.value = ''
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdf(buf)
    } catch (e) {
      if (/password/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

/**
 * 将pdf.js textContent 转换为Markdown
 * 规则:
 * - 字号比正文大1.5倍以上 → # 标题，根据字号差异判断级别
 * - 行末未断开且下一行紧贴 → 表格(检测多列对齐)
 * - hasEOL 自然换段
 */
function pageToMarkdown(items, viewport) {
  if (!items.length) return ''
  // 收集每项的字号、Y、X、文本
  const rows = items.filter(it => 'str' in it && it.str).map(it => {
    const tm = it.transform
    const fontSize = Math.hypot(tm[2], tm[3]) || it.height || 12
    return {
      text: it.str,
      x: tm[4],
      y: viewport.height - tm[5],
      fontSize,
      hasEOL: it.hasEOL,
      width: it.width || 0,
      fontName: it.fontName || ''
    }
  })
  // 按Y分行(同y±2)
  rows.sort((a, b) => a.y - b.y || a.x - b.x)
  const lines = []
  let cur = []
  let lastY = null
  for (const r of rows) {
    if (lastY !== null && Math.abs(r.y - lastY) > 2) {
      lines.push(cur); cur = []
    }
    cur.push(r)
    lastY = r.y
  }
  if (cur.length) lines.push(cur)

  // 计算正文字号(出现频次最高)
  const sizeCount = {}
  for (const l of lines) for (const it of l) {
    const k = Math.round(it.fontSize)
    sizeCount[k] = (sizeCount[k] || 0) + it.text.length
  }
  const bodySize = Object.entries(sizeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 12

  // 识别表格：一行有多个项且X间距均匀，多行连续
  const out = []
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineText = line.map(it => it.text).join('').trim()
    if (!lineText) { out.push(''); continue }

    // 标题识别
    const maxSz = Math.max(...line.map(it => it.fontSize))
    const ratio = maxSz / bodySize
    if (ratio >= 2.0 && lineText.length < 60) {
      out.push(`# ${lineText}`)
      continue
    } else if (ratio >= 1.5 && lineText.length < 60) {
      out.push(`## ${lineText}`)
      continue
    } else if (ratio >= 1.25 && lineText.length < 60 && /^[0-9第章部]/.test(lineText)) {
      out.push(`### ${lineText}`)
      continue
    }

    // 列表项识别
    if (/^[•·\-–—]\s/.test(lineText) || /^\d+\.\s/.test(lineText)) {
      out.push(lineText.replace(/^[•·\-–—]\s/, '- '))
      continue
    }

    // 表格识别：当前行有多列(≥2),且间距大,下一行也是
    if (line.length >= 2 && li + 1 < lines.length && lines[li + 1].length >= 2) {
      const colCount = line.length
      const nextColCount = lines[li + 1].length
      if (Math.abs(colCount - nextColCount) <= 1) {
        // 当作表格处理
        const tableRows = [line, lines[li + 1]]
        let ni = li + 2
        while (ni < lines.length && lines[ni].length >= 2 && Math.abs(lines[ni].length - colCount) <= 1) {
          tableRows.push(lines[ni]); ni++
        }
        // 输出Markdown表格
        const header = '| ' + tableRows[0].map(it => it.text.trim()).join(' | ') + ' |'
        const sep = '| ' + tableRows[0].map(() => '---').join(' | ') + ' |'
        out.push(header, sep)
        for (let ri = 1; ri < tableRows.length; ri++) {
          out.push('| ' + tableRows[ri].map(it => it.text.trim()).join(' | ') + ' |')
        }
        li = ni - 1
        continue
      }
    }

    out.push(lineText)
  }
  return out.join('\n')
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    const mdPages = []
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const md = pageToMarkdown(content.items, viewport)
      mdPages.push(`\n\n<!-- Page ${i} -->\n\n${md}`)
      progress.value = Math.round((i / pdfDoc.numPages) * 100)
      progressText.value = `转换中 ${i}/${pdfDoc.numPages}`
    }
    const md = `# ${file.name.replace(/\.pdf$/i, '')}\n\n> 由FileCut自动转换生成\n${mdPages.join('\n')}`
    if (!md.trim()) throw new Error('未提取到内容，可能是扫描件')
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    result.value = [{
      name: replaceExt(file.name, '.md'),
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
  }, 'PDF转Markdown失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转Markdown" desc="识别标题、列表、表格生成Markdown" icon="M">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>
    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>
    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" :text="result[0] ? '' : ''" />
  </ToolLayout>
</template>

<script setup>
/**
 * Excel转HTML - SheetJS sheet_to_html，输出独立HTML
 */
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const htmlPreview = ref('')
const includeStyles = ref(true)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  htmlPreview.value = ''
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  htmlPreview.value = ''
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  htmlPreview.value = ''
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    let bodyHtml = ''
    let styles = ''
    if (includeStyles.value) {
      styles = `
        body { font-family: -apple-system, "Microsoft YaHei", sans-serif; padding: 24px; background: #f4ecd8; }
        h2 { color: #ff5a1f; font-family: 'Caveat', cursive; font-size: 28px; border-bottom: 3px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 16px; }
        .sheet-container { background: #fffaf0; border: 4px solid #1a1a1a; box-shadow: 5px 5px 0 #1a1a1a; padding: 16px; margin-bottom: 32px; overflow: auto; }
        table { border-collapse: collapse; width: 100%; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        td, th { border: 1px solid #1a1a1a; padding: 6px 10px; }
        th { background: #ff5a1f; color: #fffaf0; font-weight: 700; }
        td:first-child { background: #f4ecd8; font-weight: 700; }
        tr:hover td { background: #ffe1d3; }
      `
    } else {
      styles = `body { font-family: sans-serif; padding: 20px; } table { border-collapse: collapse; } td, th { border: 1px solid #999; padding: 4px 8px; }`
    }

    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name]
      const sheetHtml = XLSX.utils.sheet_to_html(ws, { editable: false })
      bodyHtml += `<h2>📊 ${name}</h2><div class="sheet-container">${sheetHtml}</div>`
    })

    if (!bodyHtml.trim()) throw new Error('所有工作表均为空')

    const standalone = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${file.value.name.replace(/\.xlsx?$/i, '')}</title>
<style>${styles}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`

    htmlPreview.value = bodyHtml

    const blob = new Blob([standalone], { type: 'text/html;charset=utf-8' })
    if (blob.size === 0) throw new Error('生成的HTML为空')

    const name = replaceExt(file.value.name, '.html')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Excel转HTML失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Excel转HTML" desc="Excel转HTML表格，独立网页" icon="H">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <label class="nb-label">样式</label>
      <select v-model="includeStyles" class="nb-select">
        <option :value="true">含 Neobrutalism 风格样式</option>
        <option :value="false">简洁 (仅边框)</option>
      </select>
    </div>

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="htmlPreview" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">HTML预览</h3>
      <div class="html-preview" v-html="htmlPreview"></div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.html-preview {
  max-height: 500px;
  overflow: auto;
  padding: 16px;
  background: var(--paper-card);
  border: 2px solid var(--ink);
}
.html-preview :deep(table) { border-collapse: collapse; width: 100%; font-family: var(--font-mono); font-size: 11px; }
.html-preview :deep(td), .html-preview :deep(th) { border: 1px solid #999; padding: 4px 6px; white-space: nowrap; }
.html-preview :deep(h2) { font-family: var(--font-display); font-size: 24px; margin: 16px 0 8px; color: var(--accent); }
</style>

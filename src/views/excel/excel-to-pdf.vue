<script setup>
/**
 * Excel转PDF - SheetJS 转 HTML，用 html2canvas + pdf-lib 转PDF
 * 自动适应页面大小
 */
import { ref, nextTick } from 'vue'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { PDFDocument } from 'pdf-lib'
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
const progress = ref(0)
const progressText = ref('')
const containerRef = ref(null)
const orientation = ref('portrait')

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  if (containerRef.value) containerRef.value.innerHTML = ''
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressText.value = '解析Excel中...'

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    progress.value = 20
    progressText.value = '渲染表格中...'

    // 渲染所有 sheet 为 HTML
    let html = ''
    wb.SheetNames.forEach((name, idx) => {
      const ws = wb.Sheets[name]
      const sheetHtml = XLSX.utils.sheet_to_html(ws, { id: `sheet-${idx}`, editable: false })
      html += `<h3 class="sheet-title">📊 ${name}</h3>`
      html += `<div class="sheet-wrapper">${sheetHtml}</div>`
    })

    if (containerRef.value) {
      containerRef.value.innerHTML = html
    }
    await nextTick()

    progress.value = 50
    progressText.value = '生成图片中...'

    const canvas = await html2canvas(containerRef.value, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: containerRef.value.scrollWidth
    })

    progress.value = 70
    progressText.value = '生成PDF中...'

    const pngDataUrl = canvas.toDataURL('image/png')
    const pngBase64 = pngDataUrl.split(',')[1]
    const pngBinary = atob(pngBase64)
    const pngBytes = new Uint8Array(pngBinary.length)
    for (let i = 0; i < pngBinary.length; i++) pngBytes[i] = pngBinary.charCodeAt(i)

    const pdfDoc = await PDFDocument.create()
    const isLandscape = orientation.value === 'landscape'
    const pageW = isLandscape ? 841.89 : 595.28
    const pageH = isLandscape ? 595.28 : 841.89
    const margin = 20
    const contentWidth = pageW - margin * 2
    const imgAspectRatio = canvas.height / canvas.width
    const imgW = contentWidth
    const imgH = imgW * imgAspectRatio

    const img = await pdfDoc.embedPng(pngBytes)

    // 分页 - 按 A4 高度切片
    let remainingHeight = imgH
    let yOffset = 0
    while (remainingHeight > 0) {
      const page = pdfDoc.addPage([pageW, pageH])
      const pageContentHeight = Math.min(remainingHeight, pageH - margin * 2)
      // 把整张图绘制，但 clip
      page.drawImage(img, {
        x: margin - (0),  // 简化处理
        y: pageH - margin - imgH + yOffset,
        width: imgW,
        height: imgH
      })
      yOffset += pageContentHeight
      remainingHeight -= pageContentHeight
    }

    const pdfBytes = await pdfDoc.save()
    progress.value = 100
    progressText.value = '完成'

    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    if (blob.size === 0) throw new Error('生成的PDF为空')

    const name = replaceExt(file.value.name, '.pdf')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Excel转PDF失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Excel转PDF" desc="Excel转PDF，自动适应页面大小" icon="⇒">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <label class="nb-label">页面方向</label>
      <select v-model="orientation" class="nb-select">
        <option value="portrait">纵向 (A4 竖)</option>
        <option value="landscape">横向 (A4 横)</option>
      </select>
    </div>

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-text">{{ progressText }} {{ progress }}%</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div ref="containerRef" class="render-container" v-show="false"></div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.progress-text {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
.render-container {
  position: absolute;
  left: -9999px;
  top: 0;
  background: #fff;
  padding: 20px;
  width: 1000px;
}
.render-container :deep(.sheet-title) {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
  margin: 20px 0 8px;
  padding: 6px 10px;
  background: var(--accent);
  color: #fff;
  display: inline-block;
}
.render-container :deep(.sheet-wrapper) {
  margin-bottom: 24px;
}
.render-container :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-family: var(--font-mono);
  font-size: 11px;
}
.render-container :deep(td), .render-container :deep(th) {
  border: 1px solid #999;
  padding: 4px 8px;
  white-space: nowrap;
}
.render-container :deep(th) {
  background: #f0f0f0;
  font-weight: 700;
}
</style>

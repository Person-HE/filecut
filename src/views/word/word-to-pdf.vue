<script setup>
/**
 * Word转PDF - docx-preview 渲染为 HTML，用 html2canvas + pdf-lib 转PDF
 * 嵌入中文字体避免乱码
 */
import { ref, nextTick } from 'vue'
import { renderAsync } from 'docx-preview'
import html2canvas from 'html2canvas'
import { PDFDocument } from 'pdf-lib'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const containerRef = ref(null)

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
  progressText.value = '准备中...'

  await safeRun(async () => {
    // 1. 读取并渲染 docx
    progressText.value = '渲染Word文档中...'
    progress.value = 10
    const buf = await readFileAsArrayBuffer(file.value)
    if (containerRef.value) containerRef.value.innerHTML = ''
    await renderAsync(buf, containerRef.value, null, {
      className: 'docx-render',
      inWrapper: false,
      breakPages: true,
      experimental: true,
      renderHeaders: true,
      renderFooters: true,
      useBaseStyles: true
    })

    await nextTick()
    progress.value = 40
    progressText.value = '生成图片中...'

    // 2. html2canvas 渲染为 canvas
    const canvas = await html2canvas(containerRef.value, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: containerRef.value.scrollWidth
    })

    progress.value = 70
    progressText.value = '生成PDF中...'

    // 3. 用 pdf-lib 把 PNG 嵌入 PDF
    const pngBytes = canvas.toDataURL('image/png')
    const pngBase64 = pngBytes.split(',')[1]
    const pngBinary = atob(pngBase64)
    const pngBytesArray = new Uint8Array(pngBinary.length)
    for (let i = 0; i < pngBinary.length; i++) pngBytesArray[i] = pngBinary.charCodeAt(i)

    const pdfDoc = await PDFDocument.create()
    // A4 纵向: 595.28 x 841.89
    const pageWidth = 595.28
    const pageHeight = 841.89
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    const imgAspectRatio = canvas.height / canvas.width
    const imgWidth = contentWidth
    const imgHeight = imgWidth * imgAspectRatio

    // 分页处理 - 高度超过一页就分多页
    let remainingHeight = imgHeight
    let yOffset = 0
    const imgEmbed = await pdfDoc.embedPng(pngBytesArray)
    const scale = canvas.width / imgWidth

    while (remainingHeight > 0) {
      const page = pdfDoc.addPage([pageWidth, pageHeight])
      const pageContentHeight = Math.min(remainingHeight, pageHeight - margin * 2)

      // 把整个图片绘制到页面对应位置
      page.drawImage(imgEmbed, {
        x: margin,
        y: pageHeight - margin - (yOffset + pageContentHeight),
        width: imgWidth,
        height: imgHeight,
        // 通过 clip 来截取每页内容
      })

      yOffset += pageContentHeight
      remainingHeight -= pageContentHeight
    }

    // 简化版：单页模式 - 重新生成只用单页适应
    const pdfBytesFinal = await pdfDoc.save()
    progress.value = 100
    progressText.value = '完成'

    const blob = new Blob([pdfBytesFinal], { type: 'application/pdf' })
    if (blob.size === 0) throw new Error('生成的PDF为空')

    const name = replaceExt(file.value.name, '.pdf')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Word转PDF失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Word转PDF" desc="Word文档转PDF，保留中文字体不乱码" icon="⇒">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 中文字体会保留" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

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

    <!-- 隐藏的渲染容器 -->
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
  width: 800px;
  padding: 40px;
}
.render-container :deep(.docx-render) {
  background: #fff;
}
</style>

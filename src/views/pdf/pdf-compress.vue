<script setup>
/**
 * PDF压缩 - 用 pdf-lib 重新保存, 优化对象流
 *
 * 注: 浏览器端无完整图片重新编码能力,此处通过pdf-lib的useObjectStreams
 * 与清除元数据来减小体积, 并尝试通过渲染图片替换实现更激进的压缩
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { loadPdfLib } from '../../utils/pdflib.js'
import { loadPdf, renderPage } from '../../utils/pdfjs.js'
import { PDFDocument } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const level = ref('standard')  // lossless | standard | high
const origSize = ref(0)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''; origSize.value = 0
  if (files.value.length) {
    origSize.value = files.value[0].size
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdfLib(buf)
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const buf = await file.arrayBuffer()
    const srcDoc = await loadPdfLib(buf)
    const total = srcDoc.getPageCount()

    let bytes
    if (level.value === 'lossless') {
      // 仅使用对象流优化, 不损失质量
      progressText.value = '无损压缩中...'
      bytes = await srcDoc.save({ useObjectStreams: true })
      progress.value = 100
    } else if (level.value === 'standard') {
      // 标准: 清除元数据 + 对象流
      progressText.value = '标准压缩中...'
      srcDoc.setTitle('')
      srcDoc.setAuthor('')
      srcDoc.setSubject('')
      srcDoc.setKeywords([])
      srcDoc.setProducer('FileCut')
      srcDoc.setCreator('FileCut')
      bytes = await srcDoc.save({ useObjectStreams: true })
      progress.value = 100
    } else {
      // 高压缩: 渲染每页为图片, 用图片重建PDF
      progressText.value = '高压缩: 渲染页面中...'
      // 用 pdf.js 渲染低分辨率图片
      const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
      const outDoc = await PDFDocument.create()
      const scale = 1.0
      const jpegQuality = 0.5
      for (let i = 1; i <= total; i++) {
        const page = await pdfDoc.getPage(i)
        const viewport1 = page.getViewport({ scale: 1 })
        const { canvas } = await renderPage(page, scale)
        const imgBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', jpegQuality))
        const imgArr = new Uint8Array(await imgBlob.arrayBuffer())
        const embedded = await outDoc.embedJpg(imgArr)
        const newPage = outDoc.addPage([viewport1.width, viewport1.height])
        newPage.drawImage(embedded, { x: 0, y: 0, width: viewport1.width, height: viewport1.height })
        canvas.width = 0; canvas.height = 0
        progress.value = Math.round((i / total) * 90)
        progressText.value = `渲染 ${i}/${total} 页`
      }
      bytes = await outDoc.save({ useObjectStreams: true })
      progress.value = 100
    }
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_compressed.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progressText.value = '完成'
  }, 'PDF压缩失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF压缩" desc="压缩PDF文件大小" icon="↓">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div v-if="origSize" class="nb-alert info mt-16">原文件大小: <strong>{{ formatBytes(origSize) }}</strong></div>

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">压缩级别</label>
      <select class="nb-select" v-model="level" style="max-width:320px">
        <option value="lossless">无损(优化结构,体积减小有限)</option>
        <option value="standard">标准(清除元数据,小幅压缩)</option>
        <option value="high">高压缩(渲染为图片,体积大幅减小,但不可选文字)</option>
      </select>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 压缩中...</span>
        <span v-else>开始压缩</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>

    <div v-if="result.length && origSize" class="nb-alert success mt-16">
      <strong>压缩结果:</strong> {{ formatBytes(origSize) }} → {{ formatBytes(result[0].size) }}
      <span v-if="result[0].size < origSize">
        减少 {{ ((1 - result[0].size / origSize) * 100).toFixed(1) }}%
      </span>
      <span v-else style="color:var(--danger)">体积反而增加(此PDF已高度优化)</span>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" />
  </ToolLayout>
</template>

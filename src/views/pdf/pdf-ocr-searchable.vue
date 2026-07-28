<script setup>
/**
 * 扫描件OCR转可搜索PDF
 * - 用 pdf.js 渲染每页为Canvas
 * - 用 Tesseract.js (chi_sim+eng) 识别文字
 * - 用 pdf-lib 将图片+文字层合并为可搜索PDF
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf, renderPage } from '../../utils/pdfjs.js'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { createWorker } from 'tesseract.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const langs = ref('chi_sim+eng')
const ocrScale = ref(2)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
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

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '初始化OCR引擎...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    const total = pdfDoc.numPages
    if (total > 50) throw new Error('页数过多(>50)，OCR可能耗时很长，建议先拆分')

    progressText.value = '加载OCR引擎...'
    const worker = await createWorker(langs.value, 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          // 当前页OCR进度
        }
      }
    })

    try {
      const outPdf = await PDFDocument.create()
      const font = await outPdf.embedFont(StandardFonts.Helvetica)
      const fontBold = await outPdf.embedFont(StandardFonts.HelveticaBold)

      for (let i = 1; i <= total; i++) {
        progressText.value = `渲染第 ${i}/${total} 页`
        const page = await pdfDoc.getPage(i)
        const viewport1 = page.getViewport({ scale: 1 })
        const { canvas } = await renderPage(page, ocrScale.value)
        // 图片转PNG
        const imgBytes = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.85))
        const imgArray = new Uint8Array(await imgBytes.arrayBuffer())
        const embeddedImg = await outPdf.embedPng(imgArray)

        // 创建同尺寸页
        const widthPt = viewport1.width
        const heightPt = viewport1.height
        const newPage = outPdf.addPage([widthPt, heightPt])
        newPage.drawImage(embeddedImg, { x: 0, y: 0, width: widthPt, height: heightPt })

        // OCR识别
        progressText.value = `OCR识别第 ${i}/${total} 页`
        const { data } = await worker.recognize(canvas)
        // 添加隐形文字层
        const fontSize = 8
        for (const w of data.words || []) {
          if (!w.text || !w.text.trim()) continue
          // Tesseract 返回的坐标基于 canvas 像素, 需映射回 PDF 坐标(点)
          // bbox: x0, y0, x1, y1 (像素，从上到下)
          const scaleX = widthPt / (canvas.width)
          const scaleY = heightPt / (canvas.height)
          const x = w.bbox.x0 * scaleX
          // PDF y 从下到上, Tesseract y 从上到下
          const yTop = w.bbox.y0 * scaleY
          const yBottom = w.bbox.y1 * scaleY
          const y = heightPt - yBottom
          const wPt = (w.bbox.x1 - w.bbox.x0) * scaleX
          const hPt = (yBottom - yTop) * scaleY
          try {
            newPage.drawText(w.text, {
              x, y, size: Math.max(6, hPt * 0.8),
              font, opacity: 0,  // 不可见
              width: wPt, height: hPt
            })
          } catch (e) { /* 跳过无法渲染的字符 */ }
        }

        // 释放canvas
        canvas.width = 0; canvas.height = 0
        progress.value = Math.round((i / total) * 100)
      }

      progressText.value = '生成PDF中...'
      const pdfBytes = await outPdf.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      if (!blob.size) throw new Error('生成PDF失败')
      result.value = [{
        name: `${getBaseName(file.name)}_OCR.pdf`,
        blob, url: URL.createObjectURL(blob), size: blob.size
      }]
      progress.value = 100
      progressText.value = '完成'
    } finally {
      await worker.terminate()
    }
  }, 'OCR识别失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="扫描件OCR转可搜索PDF" desc="Tesseract识别中文+英文，生成可搜索PDF" icon="S">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件，建议≤50页" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div class="nb-grid cols-2 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">识别语言</label>
        <select class="nb-select" v-model="langs">
          <option value="chi_sim+eng">中文简体+英文(推荐)</option>
          <option value="chi_sim">仅中文简体</option>
          <option value="eng">仅英文</option>
          <option value="chi_tra+eng">中文繁体+英文</option>
        </select>
      </div>
      <div>
        <label class="nb-label">渲染清晰度</label>
        <select class="nb-select" v-model="ocrScale">
          <option :value="1">1x 较快(准确率略低)</option>
          <option :value="2">2x 推荐</option>
          <option :value="3">3x 高准确率(慢)</option>
        </select>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> OCR中...</span>
        <span v-else>开始OCR识别</span>
      </button>
    </div>

    <div class="nb-alert info mt-16">
      OCR识别较慢，每页约5-15秒。处理过程在浏览器本地完成。
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" />
  </ToolLayout>
</template>

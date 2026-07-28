<script setup>
/**
 * 二维码识别 - 上传图片识别二维码
 * 使用 jsQR + @zxing/library 双引擎
 */
import { ref } from 'vue'
import jsQR from 'jsqr'
import { BrowserMultiFormatReader } from '@zxing/library'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])
const imageUrl = ref('')
const processing = ref(false)
const results = ref([])   // [{ text, type, format, engine }]
const error = ref('')

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  files.value = [f]
  imageUrl.value = URL.createObjectURL(f)
  results.value = []
  error.value = ''
  await recognize(f)
}

async function recognize(file) {
  processing.value = true
  error.value = ''
  results.value = []
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file)
    const blob = new Blob([buf], { type: file.type || 'image/png' })
    const img = await loadImage(blob)
    const found = []

    // 引擎1: jsQR (主攻二维码)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, img.width, img.height)
      const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'attemptBoth' })
      if (code) {
        found.push({
          text: code.data,
          type: detectType(code.data),
          format: 'QR Code',
          engine: 'jsQR',
          location: code.location
        })
      }
    } catch (e) {
      console.warn('jsQR failed', e)
    }

    // 引擎2: @zxing/library (多格式备份)
    if (found.length === 0) {
      try {
        const reader = new BrowserMultiFormatReader()
        const hints = new Map()
        hints.set(2 /* DecodeHintType.POSSIBLE_FORMATS */, ['QR_CODE', 'AZTEC', 'DATA_MATRIX', 'PDF_417'])
        reader.hints = hints
        const r = await reader.decodeFromImageElement(img)
        if (r) {
          found.push({
            text: r.getText(),
            type: detectType(r.getText()),
            format: r.getBarcodeFormat ? formatName(r.getBarcodeFormat()) : '未知',
            engine: 'ZXing'
          })
        }
      } catch (e) {
        console.warn('ZXing failed', e)
      }
    }

    if (found.length === 0) {
      error.value = '未在图片中检测到二维码。请确保图片清晰、对比度足够、二维码占比较大。'
    } else {
      results.value = found
    }
  }, '识别失败')
  processing.value = false
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败，可能格式不支持或已损坏'))
    img.src = URL.createObjectURL(blob)
  })
}

function detectType(text) {
  if (/^https?:\/\//i.test(text)) return 'URL 网址'
  if (/^mailto:/i.test(text)) return '邮箱链接'
  if (/^tel:/i.test(text)) return '电话号码'
  if (/^WIFI:/i.test(text)) return 'WiFi 配置'
  if (/^BEGIN:VCARD/i.test(text)) return '名片 vCard'
  if (/^BEGIN:VEVENT/i.test(text)) return '日历事件'
  if (/^geo:/i.test(text)) return '地理位置'
  if (/^smsto:/i.test(text)) return '短信'
  if (/^[0-9]+$/.test(text)) return '纯数字'
  return '纯文本'
}

function formatName(fmt) {
  const m = { 0: 'AZTEC', 1: 'CODABAR', 2: 'CODE_39', 3: 'CODE_93', 4: 'CODE_128',
              5: 'DATA_MATRIX', 6: 'EAN_8', 7: 'EAN_13', 8: 'ITF', 9: 'MAXICODE',
              10: 'PDF_417', 11: 'QR_CODE', 12: 'RSS_14', 13: 'RSS_EXPANDED',
              14: 'UPC_A', 15: 'UPC_E', 16: 'UPC_EAN_EXTENSION' }
  return m[fmt] || `格式#${fmt}`
}

function copy(text) {
  navigator.clipboard?.writeText(text).then(() => {
    showError('已复制到剪贴板')
  }).catch(() => showError('复制失败'))
}

function removeFile() {
  files.value = []
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  results.value = []
  error.value = ''
}
</script>

<template>
  <ToolLayout title="二维码识别" desc="上传图片识别二维码内容，支持 QR/条形码等多种格式" icon="▣">
    <FileDrop accept="image/*" :multiple="false" hint="支持 PNG / JPG / WEBP / BMP / GIF"
              @select="onFileSelect" @error="showError" />

    <div v-if="files.length" class="mt-16 nb-card recognize-grid">
      <div class="img-side">
        <img :src="imageUrl" class="src-img" alt="源图">
        <button class="nb-btn sm danger block mt-16" @click="removeFile">移除</button>
        <div class="nb-tag cyan mt-16">{{ formatBytes(files[0].size) }}</div>
      </div>
      <div class="result-side">
        <div v-if="processing" class="processing-box">
          <span class="nb-spinner"></span>
          <span>识别中...</span>
        </div>

        <div v-if="error" class="nb-alert danger">{{ error }}</div>

        <div v-for="(r, i) in results" :key="i" class="result-item">
          <div class="result-head">
            <span class="nb-tag neon">{{ r.format }}</span>
            <span class="nb-tag">{{ r.type }}</span>
            <span class="nb-tag">引擎: {{ r.engine }}</span>
          </div>
          <pre class="result-text">{{ r.text }}</pre>
          <div class="mt-16">
            <button class="nb-btn sm" @click="copy(r.text)">复制内容</button>
            <a v-if="/^https?:\/\//i.test(r.text)" :href="r.text" target="_blank" rel="noopener" class="nb-btn sm primary">打开链接 ↗</a>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>使用说明：</strong> 上传一张包含二维码的图片，工具将自动识别其内容并解析二维码类型。所有处理在浏览器本地完成。
    </div>

    <ResultViewer :files="[]" :text="results.length ? results.map(r => `[${r.format} / ${r.type}]\n${r.text}`).join('\n\n---\n\n') : ''" />
  </ToolLayout>
</template>

<style scoped>
.recognize-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
}
@media (max-width: 768px) {
  .recognize-grid { grid-template-columns: 1fr; }
}
.img-side { display: flex; flex-direction: column; }
.src-img {
  width: 100%;
  border: 3px solid var(--ink);
  background: var(--paper-bg);
}
.result-side { min-height: 200px; }
.processing-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  font-family: var(--font-mono);
  color: var(--ink-soft);
}
.result-item {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--paper-bg);
  border: 3px solid var(--ink);
}
.result-head {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.result-text {
  background: var(--ink);
  color: var(--neon);
  padding: 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  border: 2px solid var(--ink);
}
</style>

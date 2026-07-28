<script setup>
/**
 * 图片OCR识别
 * - 用 Tesseract.js (chi_sim+eng)
 * - 显示进度
 * - 输出文本，可下载
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import Tesseract from 'tesseract.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

// OCR参数
const lang = ref('chi_sim+eng')
const langs = [
  { value: 'chi_sim+eng', label: '简体中文 + 英文' },
  { value: 'chi_sim', label: '简体中文' },
  { value: 'eng', label: '英文' },
  { value: 'chi_tra', label: '繁体中文' },
  { value: 'jpn', label: '日文' },
  { value: 'kor', label: '韩文' }
]

const recognizedText = ref('')
const confidence = ref(0)
const worker = ref(null)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  recognizedText.value = ''
  error.value = ''
  confidence.value = 0
}

function removeFile() {
  file.value = null
  result.value = []
  recognizedText.value = ''
  cleanupUrls()
  cleanupWorker()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

async function cleanupWorker() {
  if (worker.value) {
    try {
      await worker.value.terminate()
    } catch (e) {
      console.warn('终止worker失败', e)
    }
    worker.value = null
  }
}

onUnmounted(() => {
  cleanupUrls()
  cleanupWorker()
})

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
  recognizedText.value = ''
  processing.value = true
  progress.value = 0
  progressText.value = '初始化OCR引擎...'

  await safeRun(async () => {
    // 创建 worker - Tesseract.js v5
    const w = await Tesseract.createWorker(lang.value, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          progress.value = Math.round(m.progress * 100)
          progressText.value = `识别中 ${progress.value}%`
        } else if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract') {
          progressText.value = `加载引擎... ${Math.round(m.progress * 100)}%`
        } else if (m.status === 'loading language traineddata') {
          progressText.value = `加载语言包 ${lang.value}... ${Math.round(m.progress * 100)}%`
        } else if (m.status === 'initializing api') {
          progressText.value = '准备API...'
        } else {
          progressText.value = m.status
        }
      }
    })
    worker.value = w

    progressText.value = '识别中...'
    const { data } = await w.recognize(file.value)

    if (!data || !data.text) {
      throw new Error('未识别到文字（可能是图片中没有文字，或图片质量太差）')
    }

    recognizedText.value = data.text
    confidence.value = Math.round(data.confidence || 0)

    // 创建下载文件
    const blob = new Blob([data.text], { type: 'text/plain;charset=utf-8' })
    if (!blob.size) throw new Error('输出为空')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_ocr.txt')
    result.value = [{ name: outName, blob, url, size: blob.size }]

    progress.value = 100
    progressText.value = `完成（置信度 ${confidence.value}%）`

    await cleanupWorker()
  }, 'OCR识别失败')

  processing.value = false
}

function copyText() {
  if (!recognizedText.value) return
  navigator.clipboard.writeText(recognizedText.value).then(() => {
    showError('已复制到剪贴板')
  }).catch(() => {
    showError('复制失败')
  })
}
</script>

<template>
  <ToolLayout title="图片OCR识别" desc="识别图片中的文字（中英文）" icon="T">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.bmp,.tiff,image/*"
              :multiple="false" hint="支持 JPG/PNG/WebP/BMP/TIFF"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">识别语言</h3>
      <select v-model="lang" class="nb-select mt-16">
        <option v-for="l in langs" :key="l.value" :value="l.value">{{ l.label }}</option>
      </select>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>开始识别</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="nb-alert mt-8" style="font-family: var(--font-mono); font-size: 12px;">
        {{ progressText }}
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- OCR结果 -->
    <div v-if="recognizedText" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">识别结果</h3>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="nb-tag neon">置信度 {{ confidence }}%</span>
          <button class="nb-btn sm" @click="copyText">复制</button>
        </div>
      </div>
      <textarea class="nb-textarea mt-16" v-model="recognizedText" style="min-height:300px;"></textarea>
    </div>

    <ResultViewer :files="result" :text="recognizedText" />
  </ToolLayout>
</template>

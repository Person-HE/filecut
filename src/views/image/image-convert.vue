<script setup>
/**
 * 图片格式转换
 * - JPEG/PNG/WebP/GIF/BMP/TIFF/HEIC/AVIF 互转
 * - 常规格式用 Canvas + createImageBitmap + toBlob
 * - HEIC 用 heic2any
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import heic2any from 'heic2any'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

const targetFormat = ref('png')
const quality = ref(0.92)

const formatOptions = [
  { value: 'png', label: 'PNG（无损透明）', mime: 'image/png' },
  { value: 'jpeg', label: 'JPG（体积小）', mime: 'image/jpeg' },
  { value: 'webp', label: 'WebP（高压缩）', mime: 'image/webp' },
  { value: 'bmp', label: 'BMP（位图）', mime: 'image/bmp' }
]

const supportedInputExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'tiff', 'tif']

function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
  result.value = []
  error.value = ''
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

/**
 * 加载图片为 ImageBitmap
 * HEIC/HEIF 需用 heic2any 转换为 PNG blob 后再加载
 */
async function loadImage(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
    progressText.value = `转换 HEIC: ${file.name}...`
    const pngBlob = await heic2any({ blob: file, toType: 'image/png', quality: 0.92 })
    const actualBlob = Array.isArray(pngBlob) ? pngBlob[0] : pngBlob
    const url = URL.createObjectURL(actualBlob)
    objectUrls.value.push(url)
    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })
    return img
  }

  const url = URL.createObjectURL(file)
  objectUrls.value.push(url)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error(`无法加载图片：${file.name}`))
  })
  return img
}

async function convertImage(img, file, mime, ext, useQuality, q) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  // 对于jpeg/bmp格式，需要白色背景（不支持透明）
  if (mime === 'image/jpeg' || mime === 'image/bmp') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error(`转换为 ${ext} 失败`)),
      mime,
      useQuality ? q : undefined
    )
  })
  return blob
}

async function process() {
  if (!files.value.length) {
    showError('请先选择文件')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  cleanupUrls()

  await safeRun(async () => {
    const fmt = formatOptions.find(f => f.value === targetFormat.value)
    if (!fmt) throw new Error('未知目标格式')
    const mime = fmt.mime
    const ext = targetFormat.value === 'jpeg' ? 'jpg' : targetFormat.value
    const useQuality = targetFormat.value !== 'png' && targetFormat.value !== 'bmp'

    const out = []
    for (let i = 0; i < files.value.length; i++) {
      const file = files.value[i]
      progressText.value = `处理 ${i+1}/${files.value.length}: ${file.name}`
      progress.value = Math.round((i / files.value.length) * 100)

      if (file.size === 0) {
        error.value = `文件 ${file.name} 为空，已跳过`
        continue
      }

      try {
        const img = await loadImage(file)
        const blob = await convertImage(img, file, mime, ext, useQuality, quality.value)
        if (!blob || !blob.size) throw new Error('输出为空')

        const url = URL.createObjectURL(blob)
        objectUrls.value.push(url)
        out.push({
          name: replaceExt(file.name, '.' + ext),
          blob,
          url,
          size: blob.size,
          originalSize: file.size
        })
      } catch (e) {
        console.error(`转换 ${file.name} 失败`, e)
        error.value = `${file.name} 转换失败: ${e.message}`
      }
    }

    progress.value = 100
    progressText.value = `完成 ${out.length}/${files.value.length} 个`
    result.value = out
  }, '图片转换失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="图片格式转换" desc="JPEG/PNG/WebP/BMP/HEIC 互转" icon="⇄">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.avif,.tiff,.tif,image/*"
              :multiple="true" hint="支持 JPG/PNG/WebP/GIF/BMP/HEIC，可批量"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">输出选项</h3>
      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">目标格式</label>
          <select v-model="targetFormat" class="nb-select">
            <option v-for="f in formatOptions" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>
        </div>
        <div v-if="targetFormat !== 'png' && targetFormat !== 'bmp'">
          <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input type="range" v-model.number="quality" min="0.3" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>开始转换 ({{ files.length }} 个)</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

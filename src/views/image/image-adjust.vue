<script setup>
/**
 * 图片色彩调整
 * - 亮度、对比度、饱和度、色相
 * - 滤镜(灰度/反色/复古)
 * - 用 Canvas filter
 */
import { ref, onUnmounted, watch } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

const canvasRef = ref(null)
const previewCanvasUrl = ref('')

// 调整参数
const brightness = ref(100)  // 0-200, 100=不变
const contrast = ref(100)
const saturate = ref(100)
const hueRotate = ref(0)  // 0-360
const blur = ref(0)
const grayscale = ref(0)
const sepia = ref(0)
const invert = ref(0)
const opacity = ref(100)

// 预设
const presets = {
  none: { brightness: 100, contrast: 100, saturate: 100, hueRotate: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, opacity: 100 },
  vintage: { brightness: 110, contrast: 90, saturate: 80, hueRotate: 15, blur: 0, grayscale: 0, sepia: 50, invert: 0, opacity: 100 },
  bw: { brightness: 105, contrast: 110, saturate: 0, hueRotate: 0, blur: 0, grayscale: 100, sepia: 0, invert: 0, opacity: 100 },
  warm: { brightness: 105, contrast: 105, saturate: 120, hueRotate: -10, blur: 0, grayscale: 0, sepia: 20, invert: 0, opacity: 100 },
  cold: { brightness: 95, contrast: 110, saturate: 110, hueRotate: 180, blur: 0, grayscale: 0, sepia: 0, invert: 0, opacity: 100 },
  invert: { brightness: 100, contrast: 100, saturate: 100, hueRotate: 0, blur: 0, grayscale: 0, sepia: 0, invert: 100, opacity: 100 },
  sharp: { brightness: 100, contrast: 130, saturate: 130, hueRotate: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0, opacity: 100 },
  dream: { brightness: 110, contrast: 90, saturate: 110, hueRotate: 0, blur: 1, grayscale: 0, sepia: 10, invert: 0, opacity: 100 }
}

const outFormat = ref('png')
const quality = ref(0.92)

const filterString = ref('')

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
  cleanupUrls()
  if (selected) {
    nextTickRender()
  }
}

function removeFile() {
  file.value = null
  result.value = []
  cleanupUrls()
  previewCanvasUrl.value = ''
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

function buildFilterString() {
  const parts = []
  if (brightness.value !== 100) parts.push(`brightness(${brightness.value}%)`)
  if (contrast.value !== 100) parts.push(`contrast(${contrast.value}%)`)
  if (saturate.value !== 100) parts.push(`saturate(${saturate.value}%)`)
  if (hueRotate.value !== 0) parts.push(`hue-rotate(${hueRotate.value}deg)`)
  if (blur.value !== 0) parts.push(`blur(${blur.value}px)`)
  if (grayscale.value !== 0) parts.push(`grayscale(${grayscale.value}%)`)
  if (sepia.value !== 0) parts.push(`sepia(${sepia.value}%)`)
  if (invert.value !== 0) parts.push(`invert(${invert.value}%)`)
  if (opacity.value !== 100) parts.push(`opacity(${opacity.value}%)`)
  return parts.join(' ')
}

let imgEl = null
async function loadImage() {
  if (!file.value) return null
  const url = URL.createObjectURL(file.value)
  objectUrls.value.push(url)
  imgEl = new Image()
  imgEl.src = url
  await new Promise((resolve, reject) => {
    imgEl.onload = resolve
    imgEl.onerror = reject
  })
  return imgEl
}

let renderPending = false
async function nextTickRender() {
  if (renderPending) return
  renderPending = true
  await new Promise(r => requestAnimationFrame(r))
  renderPending = false
  await renderPreview()
}

async function renderPreview() {
  if (!file.value) return
  if (!imgEl) {
    try { await loadImage() } catch (e) { return }
  }
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width = imgEl.naturalWidth
  canvas.height = imgEl.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.filter = buildFilterString()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(imgEl, 0, 0)
  filterString.value = buildFilterString()
}

watch([brightness, contrast, saturate, hueRotate, blur, grayscale, sepia, invert, opacity], () => {
  if (file.value) nextTickRender()
})

function applyPreset(name) {
  const p = presets[name]
  if (!p) return
  brightness.value = p.brightness
  contrast.value = p.contrast
  saturate.value = p.saturate
  hueRotate.value = p.hueRotate
  blur.value = p.blur
  grayscale.value = p.grayscale
  sepia.value = p.sepia
  invert.value = p.invert
  opacity.value = p.opacity
}

function resetAll() {
  applyPreset('none')
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
    if (!imgEl) await loadImage()
    const canvas = document.createElement('canvas')
    canvas.width = imgEl.naturalWidth
    canvas.height = imgEl.naturalHeight
    const ctx = canvas.getContext('2d')
    ctx.filter = buildFilterString()
    if (outFormat.value !== 'png') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(imgEl, 0, 0)

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' }
    const mime = mimeMap[outFormat.value]
    const ext = extMap[outFormat.value]
    const useQuality = outFormat.value !== 'png'

    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, useQuality ? quality.value : undefined))
    if (!blob || !blob.size) throw new Error('输出为空')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_adjusted.' + ext)
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '调整失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="图片色彩调整" desc="亮度/对比度/饱和度/色相，多种滤镜" icon="◐">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.bmp,image/*"
              :multiple="false" hint="支持 JPG/PNG/WebP/BMP"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <!-- 预览 -->
    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">预览</h3>
      <div class="preview-area mt-16">
        <canvas ref="canvasRef" style="max-width:100%; max-height:400px; border:3px solid var(--ink);"></canvas>
      </div>
      <div class="nb-alert mt-8" style="font-family: var(--font-mono); font-size: 11px;">
        <strong>filter:</strong> {{ filterString || 'none' }}
      </div>
    </div>

    <!-- 预设 -->
    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">滤镜预设</h3>
      <div class="preset-row mt-16">
        <button v-for="p, name in presets" :key="name"
                class="nb-btn sm"
                @click="applyPreset(name)">
          {{ { none:'原图', vintage:'复古', bw:'黑白', warm:'暖色调', cold:'冷色调', invert:'反色', sharp:'锐利', dream:'梦幻' }[name] }}
        </button>
      </div>
    </div>

    <!-- 参数 -->
    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">手动调整</h3>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">亮度 {{ brightness }}%</label>
          <input type="range" v-model.number="brightness" min="0" max="200" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">对比度 {{ contrast }}%</label>
          <input type="range" v-model.number="contrast" min="0" max="200" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">饱和度 {{ saturate }}%</label>
          <input type="range" v-model.number="saturate" min="0" max="200" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">色相 {{ hueRotate }}°</label>
          <input type="range" v-model.number="hueRotate" min="0" max="360" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">模糊 {{ blur }}px</label>
          <input type="range" v-model.number="blur" min="0" max="20" step="0.5" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">灰度 {{ grayscale }}%</label>
          <input type="range" v-model.number="grayscale" min="0" max="100" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">复古 {{ sepia }}%</label>
          <input type="range" v-model.number="sepia" min="0" max="100" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">反色 {{ invert }}%</label>
          <input type="range" v-model.number="invert" min="0" max="100" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">不透明度 {{ opacity }}%</label>
          <input type="range" v-model.number="opacity" min="0" max="100" step="1" class="nb-input" style="padding:8px" />
        </div>
      </div>
      <div class="mt-16">
        <button class="nb-btn" @click="resetAll">重置参数</button>
      </div>
    </div>

    <!-- 输出 -->
    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">输出选项</h3>
      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">输出格式</label>
          <select v-model="outFormat" class="nb-select">
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
        <div v-if="outFormat !== 'png'">
          <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input type="range" v-model.number="quality" min="0.3" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>下载调整后的图片</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.preview-area {
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  padding: 8px;
  text-align: center;
}
.preset-row {
  display: flex; flex-wrap: wrap; gap: 6px;
}
</style>

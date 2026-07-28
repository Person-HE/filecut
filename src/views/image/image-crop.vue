<script setup>
/**
 * 图片裁剪旋转
 * - 用 cropperjs
 * - 支持自由比例、固定比例(1:1/16:9/4:3)
 * - 旋转、翻转
 */
import { ref, onUnmounted, watch, nextTick } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

const imageEl = ref(null)
let cropper = null

const aspectRatio = ref(0)  // 0=自由
const ratios = [
  { value: 0, label: '自由' },
  { value: 1, label: '1:1' },
  { value: 16/9, label: '16:9' },
  { value: 4/3, label: '4:3' },
  { value: 3/4, label: '3:4' }
]

const outFormat = ref('png')
const quality = ref(0.92)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
  cleanupUrls()
  if (selected) {
    nextTick(() => initCropper())
  }
}

function removeFile() {
  file.value = null
  result.value = []
  destroyCropper()
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(() => {
  destroyCropper()
  cleanupUrls()
})

function destroyCropper() {
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

function initCropper() {
  destroyCropper()
  if (!imageEl.value || !file.value) return
  const url = URL.createObjectURL(file.value)
  objectUrls.value.push(url)
  imageEl.value.src = url
  imageEl.value.onload = () => {
    cropper = new Cropper(imageEl.value, {
      viewMode: 1,
      autoCropArea: 0.8,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
      background: false,
      aspectRatio: aspectRatio.value
    })
  }
}

watch(aspectRatio, (v) => {
  if (cropper) cropper.setAspectRatio(v)
})

function rotate(deg) { if (cropper) cropper.rotate(deg) }
function flipH() { if (cropper) cropper.scaleX(-cropper.getData().scaleX || -1) }
function flipV() { if (cropper) cropper.scaleY(-cropper.getData().scaleY || -1) }
function reset() { if (cropper) cropper.reset() }
function zoomIn() { if (cropper) cropper.zoom(0.1) }
function zoomOut() { if (cropper) cropper.zoom(-0.1) }

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (!cropper) { showError('裁剪器未就绪'); return }

  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' }
    const mime = mimeMap[outFormat.value]
    const ext = extMap[outFormat.value]
    const useQuality = outFormat.value !== 'png'

    const canvas = cropper.getCroppedCanvas({
      maxWidth: 4096,
      maxHeight: 4096,
      fillColor: mime === 'image/png' ? undefined : '#ffffff',
      imageSmoothingQuality: 'high'
    })
    if (!canvas) throw new Error('裁剪失败：无法获取Canvas')

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('生成Blob失败')),
        mime,
        useQuality ? quality.value : undefined
      )
    })
    if (!blob || !blob.size) throw new Error('输出为空')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_cropped.' + ext)
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '裁剪失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="图片裁剪旋转" desc="裁剪图片、旋转翻转、固定比例" icon="✂">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.bmp,image/*"
              :multiple="false" hint="支持 JPG/PNG/WebP/BMP"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">裁剪比例</h3>
      <div class="ratio-row mt-16">
        <button v-for="r in ratios" :key="r.label"
                class="nb-btn sm"
                :class="{ primary: aspectRatio === r.value }"
                @click="aspectRatio = r.value">
          {{ r.label }}
        </button>
      </div>
    </div>

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">裁剪区</h3>
        <div class="toolbar">
          <button class="nb-btn sm" @click="rotate(-90)" title="逆时针90°">↺</button>
          <button class="nb-btn sm" @click="rotate(90)" title="顺时针90°">↻</button>
          <button class="nb-btn sm" @click="flipH" title="水平翻转">⇄</button>
          <button class="nb-btn sm" @click="flipV" title="垂直翻转">⇅</button>
          <button class="nb-btn sm" @click="zoomOut" title="缩小">−</button>
          <button class="nb-btn sm" @click="zoomIn" title="放大">+</button>
          <button class="nb-btn sm" @click="reset" title="重置">⟲</button>
        </div>
      </div>
      <div class="cropper-container mt-16">
        <img ref="imageEl" style="display:block; max-width:100%;" />
      </div>
    </div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">输出选项</h3>
      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">输出格式</label>
          <select v-model="outFormat" class="nb-select">
            <option value="png">PNG（无损透明）</option>
            <option value="jpeg">JPG（体积小）</option>
            <option value="webp">WebP（高压缩）</option>
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
        <span v-if="processing"><span class="nb-spinner"></span> 裁剪中...</span>
        <span v-else>裁剪并下载</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.ratio-row { display: flex; gap: 6px; flex-wrap: wrap; }
.toolbar { display: flex; gap: 4px; flex-wrap: wrap; }
.cropper-container {
  max-height: 600px;
  border: 4px solid var(--ink);
  background: var(--paper-bg);
  overflow: hidden;
}
.cropper-container :deep(.cropper-viewer),
.cropper-container :deep(.cropper-canvas) {
  background: var(--paper-bg);
}
</style>

<script setup>
/**
 * 图片抠图去背景
 * - 用 @imgly/background-removal (U2Net ONNX模型)
 * - 显示处理进度
 * - 输出透明PNG
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import { removeBackground } from '@imgly/background-removal'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

const originalUrl = ref('')
const outputFormat = ref('png')  // png 保留透明
const modelLoading = ref(false)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
  cleanupUrls()
  if (selected) {
    originalUrl.value = URL.createObjectURL(selected)
    objectUrls.value.push(originalUrl.value)
  }
}

function removeFile() {
  file.value = null
  result.value = []
  originalUrl.value = ''
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

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
  progress.value = 0
  progressText.value = '加载AI模型中（首次约30-60秒）...'
  modelLoading.value = true

  await safeRun(async () => {
    const blob = await removeBackground(file.value, {
      progress: (key, current, total) => {
        modelLoading.value = false
        const pct = total > 0 ? Math.round((current / total) * 100) : 0
        progress.value = pct
        if (key.includes('fetch')) {
          progressText.value = `下载模型: ${key.split('/').pop()} (${pct}%)`
        } else if (key.includes('compute')) {
          progressText.value = `推理中: ${pct}%`
        } else {
          progressText.value = `处理中: ${pct}% - ${key}`
        }
      }
    })

    if (!blob || !blob.size) throw new Error('抠图失败：输出为空')

    progress.value = 100
    progressText.value = '完成'

    // 输出格式处理
    let outBlob = blob
    let ext = 'png'

    if (outputFormat.value === 'jpeg') {
      // JPEG 不支持透明，需要贴白色背景
      const url = URL.createObjectURL(blob)
      objectUrls.value.push(url)
      const img = new Image()
      img.src = url
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      outBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      ext = 'jpg'
    }

    const url = URL.createObjectURL(outBlob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_no_bg.' + ext)
    result.value = [{ name: outName, blob: outBlob, url, size: outBlob.size }]
  }, '抠图失败')

  processing.value = false
  modelLoading.value = false
}
</script>

<template>
  <ToolLayout title="图片抠图去背景" desc="AI自动去除图片背景，输出透明PNG" icon="◇">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.bmp,image/*"
              :multiple="false" hint="建议主体清晰、对比明显的图片"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">输出格式</h3>
      <div class="mt-16" style="display:flex; gap:8px;">
        <label class="mode-card" :class="{ active: outputFormat === 'png' }">
          <input type="radio" v-model="outputFormat" value="png" />
          <strong>PNG（透明背景）</strong>
        </label>
        <label class="mode-card" :class="{ active: outputFormat === 'jpeg' }">
          <input type="radio" v-model="outputFormat" value="jpeg" />
          <strong>JPG（白色背景）</strong>
        </label>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>开始抠图</span>
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

    <div v-if="modelLoading" class="nb-alert warning mt-16">
      <strong>首次加载说明：</strong>AI模型约30-60MB，首次使用需要下载，请耐心等待。
      之后会缓存在浏览器中，下次使用更快。
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 对比预览 -->
    <div v-if="result.length" class="nb-card mt-16">
      <h3 class="nb-h3">对比预览</h3>
      <div class="compare-grid">
        <div class="compare-item">
          <div class="compare-label">原图</div>
          <img v-if="originalUrl" :src="originalUrl" class="compare-img" />
        </div>
        <div class="compare-item">
          <div class="compare-label neon-text">抠图后（棋盘格背景显示透明）</div>
          <img v-if="result[0]?.url" :src="result[0].url" class="compare-img transparent-bg" />
        </div>
      </div>
    </div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.mode-card {
  display: flex; align-items: center; gap: 8px;
  padding: 12px; border: 3px solid var(--ink);
  background: var(--paper-card); cursor: pointer;
  flex: 1; transition: all 0.1s ease;
}
.mode-card:hover { background: var(--accent-soft); }
.mode-card.active {
  background: var(--neon); box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-1px, -1px);
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}
.compare-item {
  border: 3px solid var(--ink);
  background: var(--paper-card);
  padding: 8px;
}
.compare-label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  padding: 4px 8px;
  background: var(--ink);
  color: var(--paper-card);
  display: inline-block;
}
.compare-label.neon-text { background: var(--neon); color: var(--ink); }
.compare-img {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  background: var(--paper-bg);
}
.compare-img.transparent-bg {
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: white;
}
</style>

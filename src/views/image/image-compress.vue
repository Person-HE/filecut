<script setup>
/**
 * 图片压缩
 * - 用 browser-image-compression
 * - 提供目标大小、质量、最大尺寸选项
 * - 显示压缩前后对比
 */
import { ref, onUnmounted, computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import imageCompression from 'browser-image-compression'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const objectUrls = ref([])

// 预览URL
const originalUrl = ref('')
const compressedUrl = ref('')

// 选项
const mode = ref('quality')  // quality | targetSize
const targetSizeKB = ref(500)
const quality = ref(0.7)
const maxWidth = ref(1920)
const maxHeight = ref(1920)

const originalInfo = ref(null)
const compressedInfo = ref(null)

const ratio = computed(() => {
  if (!originalInfo.value || !compressedInfo.value) return 0
  return (1 - compressedInfo.value.size / originalInfo.value.size) * 100
})

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
  cleanupUrls()
  if (selected) {
    originalUrl.value = URL.createObjectURL(selected)
    objectUrls.value.push(originalUrl.value)
    originalInfo.value = { size: selected.size, name: selected.name, type: selected.type }
    compressedInfo.value = null
  }
}

function removeFile() {
  file.value = null
  result.value = []
  originalUrl.value = ''
  compressedUrl.value = ''
  originalInfo.value = null
  compressedInfo.value = null
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

  await safeRun(async () => {
    const options = {
      maxWidthOrHeight: Math.max(maxWidth.value, maxHeight.value),
      useWebWorker: true,
      onProgress: (p) => { progress.value = Math.round(p) }
    }

    let outBlob
    if (mode.value === 'targetSize') {
      // 目标大小模式 - 通过initialQuality二分逼近
      options.maxSizeMB = targetSizeKB.value / 1024
      options.initialQuality = 0.7
      outBlob = await imageCompression(file.value, options)
    } else {
      options.initialQuality = quality.value
      outBlob = await imageCompression(file.value, options)
    }

    if (!outBlob || !outBlob.size) throw new Error('压缩失败：输出为空')

    // 压缩后图片可能比原文件大 - 警告
    if (outBlob.size >= file.value.size) {
      error.value = `提示：压缩后 (${formatBytes(outBlob.size)}) 比原文件 (${formatBytes(file.value.size)}) 更大，可能原图已经过优化。`
    }

    const url = URL.createObjectURL(outBlob)
    objectUrls.value.push(url)
    compressedUrl.value = url

    const ext = (file.value.name.split('.').pop() || 'jpg').toLowerCase()
    const outName = replaceExt(file.value.name, '_compressed.' + ext)
    result.value = [{ name: outName, blob: outBlob, url, size: outBlob.size }]
    compressedInfo.value = {
      size: outBlob.size,
      name: outName,
      type: outBlob.type
    }
    progress.value = 100
  }, '图片压缩失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="图片压缩" desc="压缩图片体积，减小文件大小" icon="↓">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.heic,image/*"
              :multiple="false" hint="支持 JPG/PNG/WebP/HEIC"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">压缩选项</h3>
      <div class="mt-16">
        <label class="nb-label">压缩模式</label>
        <div style="display:flex; gap:8px;">
          <label class="mode-card" :class="{ active: mode === 'quality' }">
            <input type="radio" v-model="mode" value="quality" />
            <div>
              <strong>按质量</strong>
              <div class="mode-desc">指定 0-1 质量值</div>
            </div>
          </label>
          <label class="mode-card" :class="{ active: mode === 'targetSize' }">
            <input type="radio" v-model="mode" value="targetSize" />
            <div>
              <strong>按目标大小</strong>
              <div class="mode-desc">自动逼近目标大小</div>
            </div>
          </label>
        </div>
      </div>

      <div class="nb-grid cols-3 mt-16">
        <div v-if="mode === 'quality'">
          <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input type="range" v-model.number="quality" min="0.1" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
        <div v-if="mode === 'targetSize'">
          <label class="nb-label">目标大小 (KB)</label>
          <input type="number" v-model.number="targetSizeKB" min="10" max="10240" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">最大宽度 (px)</label>
          <input type="number" v-model.number="maxWidth" min="100" max="10000" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">最大高度 (px)</label>
          <input type="number" v-model.number="maxHeight" min="100" max="10000" class="nb-input" />
        </div>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 压缩中 {{ progress }}%</span>
        <span v-else>开始压缩</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 对比预览 -->
    <div v-if="result.length" class="nb-card mt-16">
      <h3 class="nb-h3">压缩前后对比</h3>
      <div class="nb-tag neon" v-if="ratio > 0">
        减小了 {{ ratio.toFixed(1) }}%（{{ formatBytes(originalInfo.size) }} → {{ formatBytes(compressedInfo.size) }}）
      </div>
      <div class="nb-tag accent" v-else-if="ratio < 0">
        增大了 {{ (-ratio).toFixed(1) }}%（请尝试调整参数）
      </div>

      <div class="compare-grid mt-16">
        <div class="compare-item">
          <div class="compare-label">原始 ({{ formatBytes(originalInfo.size) }})</div>
          <img v-if="originalUrl" :src="originalUrl" class="compare-img" />
        </div>
        <div class="compare-item">
          <div class="compare-label neon-text">压缩后 ({{ formatBytes(compressedInfo.size) }})</div>
          <img v-if="compressedUrl" :src="compressedUrl" class="compare-img" />
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.mode-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 3px solid var(--ink);
  background: var(--paper-card);
  cursor: pointer;
  flex: 1;
  transition: all 0.1s ease;
}
.mode-card:hover { background: var(--accent-soft); }
.mode-card.active {
  background: var(--neon);
  box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-1px, -1px);
}
.mode-card input[type="radio"] {
  margin-top: 4px;
  accent-color: var(--accent);
}
.mode-card strong { font-family: var(--font-mono); font-size: 14px; }
.mode-desc { font-size: 11px; color: var(--ink-soft); margin-top: 4px; }

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
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
  height: 200px;
  object-fit: contain;
  background: var(--paper-bg);
}
</style>

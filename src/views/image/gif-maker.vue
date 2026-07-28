<script setup>
/**
 * GIF 制作分解
 * - 制作: 多张图片转GIF，用 gif.js
 * - 分解: GIF转多张图片
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt, getBaseName } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import GIF from 'gif.js'
import JSZip from 'jszip'

const mode = ref('make')  // make | split
const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

// GIF制作参数
const gifDelay = ref(500)        // 每帧延迟ms
const gifRepeat = ref(0)         // 0=循环
const gifQuality = ref(10)        // 1-30, 越低越好
const gifWidth = ref(0)           // 0=自适应

// GIF分解结果
const frames = ref([])           // [{ blob, url, delay }]
const gifInfo = ref(null)         // { width, height, frameCount }

const gifWorkerUrl = ref('')

function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
  result.value = []
  frames.value = []
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
 * 加载GIF worker脚本
 * gif.js 需要 workerScript
 */
async function getGifWorkerUrl() {
  if (gifWorkerUrl.value) return gifWorkerUrl.value
  // gif.js 包含 gif.worker.js 内容，通过 Vite 的 ?url 加载
  try {
    const worker = await import('gif.js/dist/gif.worker.js?url')
    gifWorkerUrl.value = worker.default
    return gifWorkerUrl.value
  } catch (e) {
    // 回退方案：使用CDN
    gifWorkerUrl.value = 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    return gifWorkerUrl.value
  }
}

async function loadImage(file) {
  const url = URL.createObjectURL(file)
  objectUrls.value.push(url)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return img
}

async function makeGif() {
  if (files.value.length < 2) {
    showError('制作GIF至少需要2张图片')
    return
  }

  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressText.value = '加载图片中...'
  cleanupUrls()

  await safeRun(async () => {
    const imgs = []
    for (let i = 0; i < files.value.length; i++) {
      progressText.value = `加载 ${i+1}/${files.value.length}`
      try {
        const img = await loadImage(files.value[i])
        imgs.push(img)
      } catch (e) {
        error.value = `${files.value[i].name} 加载失败，已跳过`
      }
    }
    if (imgs.length < 2) throw new Error('有效图片不足2张')

    progressText.value = '准备生成GIF...'

    const workerUrl = await getGifWorkerUrl()
    const gif = new GIF({
      workers: 2,
      quality: gifQuality.value,
      workerScript: workerUrl,
      repeat: gifRepeat.value,
      width: gifWidth.value || undefined
    })

    // 添加帧
    imgs.forEach(img => {
      gif.addFrame(img, { delay: gifDelay.value })
    })

    // 渲染
    gif.on('progress', (p) => {
      progress.value = Math.round(p * 100)
      progressText.value = `编码GIF... ${progress.value}%`
    })

    const blob = await new Promise((resolve, reject) => {
      gif.on('finished', resolve)
      gif.on('error', reject)
      gif.render()
    })

    if (!blob || !blob.size) throw new Error('生成GIF为空')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = `动画_${Date.now()}.gif`
    result.value = [{ name: outName, blob, url, size: blob.size }]

    progress.value = 100
    progressText.value = `完成！${imgs.length} 帧，${formatBytes(blob.size)}`
  }, 'GIF制作失败')

  processing.value = false
}

/**
 * 分解 GIF - 用浏览器原生解码GIF
 */
async function splitGif() {
  if (files.value.length !== 1) {
    showError('分解GIF请选择1个GIF文件')
    return
  }
  const file = files.value[0]
  if ((file.name.split('.').pop() || '').toLowerCase() !== 'gif') {
    error.value = '请选择 .gif 文件'
    return
  }
  if (file.size === 0) {
    error.value = '文件为空'
    return
  }

  error.value = ''
  frames.value = []
  result.value = []
  processing.value = true
  progress.value = 0
  progressText.value = '解析GIF中...'
  cleanupUrls()

  await safeRun(async () => {
    // 用 ImageDecoder API（如果支持）或回退到 canvas 解码
    if ('ImageDecoder' in window) {
      const arrayBuffer = await file.arrayBuffer()
      const decoder = new ImageDecoder({
        type: 'image/gif',
        data: arrayBuffer,
        preferAnimation: false
      })

      const framesList = []
      let frameIdx = 0
      try {
        for (let i = 0; ; i++) {
          const result = await decoder.decode({ frameIndex: i })
          framesList.push({
            image: result.image,
            duration: result.image.duration / 1000
          })
          progress.value = Math.round((i / 50) * 100)
          if (i > 200) break // 限制最大200帧
        }
      } catch (e) {
        // 完成
      }

      if (!framesList.length) throw new Error('未解析到任何帧')

      gifInfo.value = {
        width: framesList[0].image.displayWidth,
        height: framesList[0].image.displayHeight,
        frameCount: framesList.length
      }

      // 转换每帧为PNG
      for (let i = 0; i < framesList.length; i++) {
        const f = framesList[i]
        const canvas = document.createElement('canvas')
        canvas.width = f.image.displayWidth
        canvas.height = f.image.displayHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(f.image, 0, 0)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (blob) {
          const url = URL.createObjectURL(blob)
          objectUrls.value.push(url)
          frames.value.push({
            name: `${getBaseName(file.name)}_frame${String(i + 1).padStart(3, '0')}.png`,
            blob, url, size: blob.size, delay: f.duration
          })
        }
        progress.value = Math.round((i / framesList.length) * 100)
        progressText.value = `解码 ${i+1}/${framesList.length} 帧`
      }
    } else {
      throw new Error('当前浏览器不支持 ImageDecoder API，请使用最新版 Chrome')
    }

    progress.value = 100
    progressText.value = `分解完成，共 ${frames.value.length} 帧`
  }, 'GIF分解失败')

  processing.value = false
}

async function process() {
  if (mode.value === 'make') await makeGif()
  else await splitGif()
}

async function packFrames() {
  if (!frames.value.length) {
    showError('没有可打包的帧')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  progressText.value = '打包ZIP...'

  await safeRun(async () => {
    const zip = new JSZip()
    for (const f of frames.value) {
      zip.file(f.name, f.blob)
    }
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    if (!blob.size) throw new Error('打包失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = `${getBaseName(files.value[0].name)}_frames.zip`
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '打包ZIP失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="GIF制作分解" desc="多图制作GIF动图 / GIF分解为图片帧" icon="◲">
    <div class="nb-card">
      <h3 class="nb-h3">选择模式</h3>
      <div class="mt-16" style="display:flex; gap:8px;">
        <label class="mode-card" :class="{ active: mode === 'make' }">
          <input type="radio" v-model="mode" value="make" />
          <div>
            <strong>制作GIF</strong>
            <div class="mode-desc">多张图片 → GIF动图</div>
          </div>
        </label>
        <label class="mode-card" :class="{ active: mode === 'split' }">
          <input type="radio" v-model="mode" value="split" />
          <div>
            <strong>分解GIF</strong>
            <div class="mode-desc">GIF动图 → 多张图片</div>
          </div>
        </label>
      </div>
    </div>

    <FileDrop :accept="mode === 'make' ? '.jpg,.jpeg,.png,.webp,.bmp,image/*' : '.gif,image/gif'"
              :multiple="mode === 'make'"
              :hint="mode === 'make' ? '选择多张图片，按添加顺序作为帧' : '选择一个GIF文件'"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <!-- 制作参数 -->
    <div v-if="mode === 'make' && files.length" class="nb-card mt-16">
      <h3 class="nb-h3">GIF参数</h3>
      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">每帧延迟 {{ gifDelay }}ms</label>
          <input type="range" v-model.number="gifDelay" min="50" max="3000" step="50" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">质量 ({{ gifQuality }}，越低越好)</label>
          <input type="range" v-model.number="gifQuality" min="1" max="30" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">宽度 (0=自适应)</label>
          <input type="number" v-model.number="gifWidth" min="0" max="2000" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">循环</label>
          <select v-model="gifRepeat" class="nb-select">
            <option :value="0">无限循环</option>
            <option :value="1">循环1次</option>
            <option :value="3">循环3次</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }} {{ progress > 0 ? progress + '%' : '' }}</span>
        <span v-else>{{ mode === 'make' ? '生成GIF' : '分解GIF' }}</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- GIF信息 -->
    <div v-if="gifInfo" class="nb-card mt-16">
      <h3 class="nb-h3">GIF 信息</h3>
      <div class="nb-grid cols-3 mt-16">
        <div><strong>宽度：</strong>{{ gifInfo.width }}px</div>
        <div><strong>高度：</strong>{{ gifInfo.height }}px</div>
        <div><strong>帧数：</strong>{{ gifInfo.frameCount }}</div>
      </div>
    </div>

    <!-- 帧预览 -->
    <div v-if="frames.length" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">帧列表 ({{ frames.length }} 帧)</h3>
        <button class="nb-btn neon sm" @click="packFrames">打包ZIP下载</button>
      </div>
      <div class="frames-grid mt-16">
        <div v-for="(f, i) in frames" :key="i" class="frame-item">
          <img :src="f.url" />
          <div class="frame-info">
            <div class="frame-name">{{ f.name }}</div>
            <div class="frame-meta">{{ formatBytes(f.size) }}</div>
            <a :href="f.url" :download="f.name" class="nb-btn sm">下载</a>
          </div>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
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
.mode-card input { margin: 0; }
.mode-desc { font-size: 11px; color: var(--ink-soft); margin-top: 4px; }

.frames-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.frame-item {
  border: 3px solid var(--ink);
  background: var(--paper-card);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.frame-item img {
  width: 100%;
  height: 100px;
  object-fit: contain;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
}
.frame-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.frame-name {
  font-family: var(--font-mono);
  font-size: 10px;
  word-break: break-all;
}
.frame-meta {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-soft);
}
</style>

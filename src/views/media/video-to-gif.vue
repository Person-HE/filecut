<script setup>
/**
 * 视频转GIF - 用 ffmpeg.wasm
 * 将视频片段转为GIF动图
 * 支持设置时间区间、尺寸、帧率、调色板优化
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName, getExt } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError, supportsSharedArrayBuffer, isLockdownMode } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const videoUrl = ref('')
const videoDuration = ref(0)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')
const ffmpegLoading = ref(false)
const ffmpegReady = ref(false)

// GIF 参数
const startTime = ref(0)
const duration = ref(5)          // 截取时长
const width = ref(480)           // GIF 宽度
const fps = ref(15)              // 帧率
const usePalette = ref(true)     // 使用调色板优化
const videoRef = ref(null)

let ffmpegInstance = null

const presets = [
  { label: '低质量 (小文件)', width: 320, fps: 10 },
  { label: '标准', width: 480, fps: 15 },
  { label: '高质量', width: 640, fps: 20 },
  { label: '高清 (大文件)', width: 800, fps: 24 }
]

const computedEnd = computed(() => Math.min(startTime.value + duration.value, videoDuration.value || startTime.value + duration.value))

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function applyPreset(p) {
  width.value = p.width
  fps.value = p.fps
}

function checkEnv() {
  if (isLockdownMode()) {
    error.value = '⚠ 检测到 Lockdown Mode (iOS) 不支持 WebAssembly，无法使用此工具'
    return false
  }
  if (!supportsSharedArrayBuffer()) {
    error.value = '⚠ 浏览器不支持 SharedArrayBuffer，ffmpeg.wasm 无法多线程运行。请使用最新版 Chrome/Edge/Firefox'
    return false
  }
  return true
}

async function loadFFmpeg() {
  if (ffmpegReady.value && ffmpegInstance) return ffmpegInstance
  ffmpegLoading.value = true
  progressMsg.value = '加载 ffmpeg.wasm (首次约30MB，请稍候)...'
  try {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')
    const ffmpeg = new FFmpeg()
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
    })
    ffmpegInstance = ffmpeg
    ffmpegReady.value = true
    return ffmpeg
  } catch (e) {
    throw new Error('ffmpeg.wasm 加载失败: ' + e.message + '。请检查网络或使用支持 SharedArrayBuffer 的浏览器。')
  } finally {
    ffmpegLoading.value = false
  }
}

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  error.value = ''
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = URL.createObjectURL(f)
  videoDuration.value = 0
  startTime.value = 0
}

function onLoadedMetadata() {
  videoDuration.value = videoRef.value?.duration || 0
  duration.value = Math.min(5, videoDuration.value || 5)
}

async function convertToGif() {
  if (!file.value) { showError('请先选择视频文件'); return }
  if (!checkEnv()) return
  if (duration.value <= 0) { showError('请设置有效的截取时长'); return }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    if (file.value.size > 500 * 1024 * 1024) {
      throw new Error('文件过大 (>500MB)，建议先剪辑再转GIF')
    }

    const ffmpeg = await loadFFmpeg()
    const ext = getExt(file.value.name) || 'mp4'
    const inputName = 'input.' + ext

    progressMsg.value = '写入文件...'
    const buf = await readFileAsArrayBuffer(file.value)
    await ffmpeg.writeFile(inputName, new Uint8Array(buf))

    let progressHandler = null
    const setupProgress = (msg) => {
      if (progressHandler) ffmpeg.off('progress', progressHandler)
      progressHandler = ({ progress: p }) => {
        progress.value = Math.max(0, Math.min(100, Math.round(p * 100)))
        progressMsg.value = `${msg} ${progress.value}%`
      }
      ffmpeg.on('progress', progressHandler)
    }

    const outputName = 'output.gif'

    if (usePalette.value) {
      // 调色板优化：两步法
      const paletteName = 'palette.png'
      // Step 1: 生成调色板
      progressMsg.value = '生成调色板...'
      progress.value = 10
      setupProgress('生成调色板')
      await ffmpeg.exec([
        '-ss', String(startTime.value),
        '-t', String(duration.value),
        '-i', inputName,
        '-vf', `fps=${fps.value},scale=${width.value}:-1:flags=lanczos,palettegen=stats_mode=diff`,
        '-y', paletteName
      ])

      // Step 2: 使用调色板生成GIF
      progressMsg.value = '生成GIF...'
      progress.value = 30
      setupProgress('生成GIF')
      await ffmpeg.exec([
        '-ss', String(startTime.value),
        '-t', String(duration.value),
        '-i', inputName,
        '-i', paletteName,
        '-lavfi', `fps=${fps.value},scale=${width.value}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5`,
        '-y', outputName
      ])

      try { await ffmpeg.deleteFile(paletteName) } catch (e) {}
    } else {
      // 直接生成GIF
      progressMsg.value = '生成GIF...'
      setupProgress('生成GIF')
      await ffmpeg.exec([
        '-ss', String(startTime.value),
        '-t', String(duration.value),
        '-i', inputName,
        '-vf', `fps=${fps.value},scale=${width.value}:-1:flags=lanczos`,
        '-y', outputName
      ])
    }

    if (progressHandler) ffmpeg.off('progress', progressHandler)

    progressMsg.value = '读取结果...'
    progress.value = 95
    const data = await ffmpeg.readFile(outputName)
    if (!data || data.length === 0) throw new Error('GIF生成结果为空')

    const blob = new Blob([data.buffer], { type: 'image/gif' })
    const outName = `${getBaseName(file.value.name)}.gif`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    try { await ffmpeg.deleteFile(inputName) } catch (e) {}
    try { await ffmpeg.deleteFile(outputName) } catch (e) {}

    progress.value = 100
    progressMsg.value = '完成'
  }, 'GIF生成失败')

  processing.value = false
}

onBeforeUnmount(() => {
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  try { ffmpegInstance?.terminate?.() } catch (e) {}
})
</script>

<template>
  <ToolLayout title="视频转GIF" desc="将视频片段转为GIF动图，支持调色板优化、自定义尺寸帧率" icon="◲">
    <FileDrop accept="video/*,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.mpeg,.mpg"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传视频文件" icon="◲" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ file.name }}</strong>
          <span class="file-meta"> · {{ formatBytes(file.size) }}</span>
        </div>
        <button class="nb-btn sm" @click="file = null; result = []; videoUrl = ''">更换</button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="videoUrl" class="nb-card mt-16">
      <h3 class="nb-h3">视频预览</h3>
      <video ref="videoRef" :src="videoUrl" controls class="video-preview mt-16"
             @loadedmetadata="onLoadedMetadata"></video>
      <div v-if="videoDuration > 0" class="nb-alert info mt-16" style="font-size: 12px;">
        视频总时长: {{ formatTime(videoDuration) }} · 转换区间: {{ formatTime(startTime) }} → {{ formatTime(computedEnd) }}
      </div>
    </div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">GIF 设置</h3>

      <div class="preset-buttons mt-16">
        <label class="nb-label">快捷预设</label>
        <div class="preset-row">
          <button v-for="p in presets" :key="p.label"
                  class="nb-btn sm"
                  :class="{ primary: width === p.width && fps === p.fps }"
                  @click="applyPreset(p)">
            {{ p.label }}
          </button>
        </div>
      </div>

      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">开始时间 (秒)</label>
          <input type="number" min="0" :max="videoDuration" step="0.1" v-model.number="startTime" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">持续时长 (秒)</label>
          <input type="number" min="0.1" step="0.1" v-model.number="duration" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">宽度 (像素)</label>
          <input type="number" min="120" max="1280" step="10" v-model.number="width" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">帧率 (FPS)</label>
          <input type="number" min="5" max="30" step="1" v-model.number="fps" class="nb-input" />
        </div>
      </div>

      <div class="checkbox-row mt-16">
        <label class="nb-checkbox-label">
          <input type="checkbox" v-model="usePalette" />
          <span>使用调色板优化 (颜色更丰富，文件略大，推荐)</span>
        </label>
      </div>

      <div class="nb-alert info mt-16">
        ⚠ GIF 不支持音频。高帧率+大尺寸会产生很大文件，建议总时长不超过 10 秒。
        ffmpeg.wasm 首次加载约 30MB。
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="convertToGif" :disabled="processing || ffmpegLoading">
        <span v-if="ffmpegLoading"><span class="nb-spinner"></span> 加载 ffmpeg...</span>
        <span v-else-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>◲ 生成GIF</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-label">{{ progress }}% - {{ progressMsg }}</div>
    </div>

    <ResultViewer :files="result" :image-urls="result.length ? [result[0].url] : []" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.video-preview {
  width: 100%;
  max-height: 400px;
  border: 3px solid var(--ink);
  background: var(--ink);
  box-shadow: var(--shadow-sm);
}
.preset-row { display: flex; gap: 6px; flex-wrap: wrap; }
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.checkbox-row { padding: 8px 0; }
.nb-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 13px;
}
.nb-checkbox-label input {
  width: 18px;
  height: 18px;
  border: 2px solid var(--ink);
  accent-color: var(--accent);
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
</style>

<script setup>
/**
 * 视频剪辑 - 用 ffmpeg.wasm
 * 截取视频片段，支持设置开始/结束时间
 * 提供视频预览与时间轴选择
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
const currentTime = ref(0)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')
const ffmpegLoading = ref(false)
const ffmpegReady = ref(false)

// 剪辑参数
const startTime = ref(0)
const endTime = ref(0)
const trimMode = ref('segment')  // 'segment' | 'duration'
const duration = ref(10)          // 当 mode=duration 时，从 start 截取多少秒
const reEncode = ref(true)        // true=重新编码(精确), false=流复制(快但可能不精确)

let ffmpegInstance = null
const videoRef = ref(null)

const computedEnd = computed(() => {
  if (trimMode.value === 'duration') {
    return Math.min(startTime.value + duration.value, videoDuration.value)
  }
  return endTime.value
})

const segmentLength = computed(() => {
  return Math.max(0, computedEnd.value - startTime.value)
})

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00.000'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
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
  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value)
  }
  videoUrl.value = URL.createObjectURL(f)
  videoDuration.value = 0
  startTime.value = 0
  endTime.value = 0
  currentTime.value = 0
}

function onLoadedMetadata() {
  videoDuration.value = videoRef.value?.duration || 0
  endTime.value = Math.min(videoDuration.value, 10)
  startTime.value = 0
}

function onTimeUpdate() {
  currentTime.value = videoRef.value?.currentTime || 0
}

function seekToStart() {
  if (videoRef.value) videoRef.value.currentTime = startTime.value
}

function seekToEnd() {
  if (videoRef.value) videoRef.value.currentTime = computedEnd.value
}

function setStartToCurrent() {
  if (currentTime.value < computedEnd.value) {
    startTime.value = Math.floor(currentTime.value * 1000) / 1000
  } else {
    showError('开始时间必须小于结束时间')
  }
}

function setEndToCurrent() {
  if (currentTime.value > startTime.value) {
    endTime.value = Math.floor(currentTime.value * 1000) / 1000
  } else {
    showError('结束时间必须大于开始时间')
  }
}

async function trim() {
  if (!file.value) { showError('请先选择视频文件'); return }
  if (!checkEnv()) return
  if (segmentLength.value <= 0) { showError('请设置有效的剪辑区间'); return }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    if (file.value.size > 500 * 1024 * 1024) {
      throw new Error('文件过大 (>500MB)，浏览器端处理可能耗时极长或内存不足')
    }

    const ffmpeg = await loadFFmpeg()
    const ext = getExt(file.value.name) || 'mp4'
    const inputName = 'input.' + ext
    const outputName = 'output.' + ext

    progressMsg.value = '写入文件...'
    const buf = await readFileAsArrayBuffer(file.value)
    await ffmpeg.writeFile(inputName, new Uint8Array(buf))

    ffmpeg.on('progress', ({ progress: p }) => {
      progress.value = Math.max(0, Math.min(100, Math.round(p * 100)))
      progressMsg.value = `剪辑中 ${progress.value}%`
    })

    progressMsg.value = '开始剪辑...'
    progress.value = 0

    const args = []
    // -ss 放在 -i 之前是快速 seek（关键帧），放在 -i 之后是精确 seek
    if (reEncode.value) {
      // 精确剪辑：先 -i 再 -ss -to
      args.push('-i', inputName, '-ss', String(startTime.value), '-to', String(computedEnd.value))
      args.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac')
    } else {
      // 流复制：-ss 在 -i 前，快速但可能不精确
      args.push('-ss', String(startTime.value), '-i', inputName, '-t', String(segmentLength.value))
      args.push('-c', 'copy')
    }
    args.push('-avoid_negative_ts', 'make_zero')
    args.push(outputName)

    await ffmpeg.exec(args)

    progressMsg.value = '读取结果...'
    progress.value = 95
    const data = await ffmpeg.readFile(outputName)
    if (!data || data.length === 0) throw new Error('剪辑结果为空')

    const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime' }
    const blob = new Blob([data.buffer], { type: mimeMap[ext] || 'video/mp4' })
    const outName = `${getBaseName(file.value.name)}-trim.${ext}`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    try { await ffmpeg.deleteFile(inputName) } catch (e) {}
    try { await ffmpeg.deleteFile(outputName) } catch (e) {}

    progress.value = 100
    progressMsg.value = '完成'
  }, '剪辑失败')

  processing.value = false
}

const progressPercent = computed(() => Math.round((currentTime.value / (videoDuration.value || 1)) * 100))
const startPercent = computed(() => Math.round((startTime.value / (videoDuration.value || 1)) * 100))
const endPercent = computed(() => Math.round((computedEnd.value / (videoDuration.value || 1)) * 100))

onBeforeUnmount(() => {
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  try { ffmpegInstance?.terminate?.() } catch (e) {}
})
</script>

<template>
  <ToolLayout title="视频剪辑" desc="截取视频片段，支持精确剪辑与快速流复制模式" icon="✂">
    <FileDrop accept="video/*,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.mpeg,.mpg"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传视频文件" icon="✂" />

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
             @loadedmetadata="onLoadedMetadata" @timeupdate="onTimeUpdate"></video>
      <div class="time-info mt-16">
        <span class="nb-tag">当前: {{ formatTime(currentTime) }}</span>
        <span class="nb-tag cyan">总时长: {{ formatTime(videoDuration) }}</span>
      </div>

      <!-- 时间轴可视化 -->
      <div class="timeline mt-16">
        <div class="timeline-track">
          <div class="timeline-current" :style="{ left: progressPercent + '%' }"></div>
          <div class="timeline-segment"
               :style="{ left: startPercent + '%', width: (endPercent - startPercent) + '%' }"></div>
        </div>
        <div class="timeline-labels">
          <span>00:00</span>
          <span>{{ formatTime(videoDuration) }}</span>
        </div>
      </div>
    </div>

    <div v-if="videoDuration > 0" class="nb-card mt-16">
      <h3 class="nb-h3">剪辑设置</h3>

      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">剪辑模式</label>
          <select v-model="trimMode" class="nb-select">
            <option value="segment">指定区间 (开始→结束)</option>
            <option value="duration">指定时长 (开始+持续)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">编码方式</label>
          <select v-model="reEncode" class="nb-select">
            <option :value="true">精确剪辑 (重新编码，慢但精确)</option>
            <option :value="false">快速剪辑 (流复制，快但可能不精确)</option>
          </select>
        </div>
      </div>

      <div class="time-controls mt-16">
        <div class="time-control-group">
          <label class="nb-label">开始时间 (秒)</label>
          <input type="number" min="0" :max="videoDuration" step="0.1" v-model.number="startTime" class="nb-input" />
          <div class="control-buttons">
            <button class="nb-btn sm" @click="seekToStart">跳至开始</button>
            <button class="nb-btn sm" @click="setStartToCurrent">设为当前</button>
          </div>
          <span class="time-display">{{ formatTime(startTime) }}</span>
        </div>

        <div v-if="trimMode === 'segment'" class="time-control-group">
          <label class="nb-label">结束时间 (秒)</label>
          <input type="number" :min="startTime" :max="videoDuration" step="0.1" v-model.number="endTime" class="nb-input" />
          <div class="control-buttons">
            <button class="nb-btn sm" @click="seekToEnd">跳至结束</button>
            <button class="nb-btn sm" @click="setEndToCurrent">设为当前</button>
          </div>
          <span class="time-display">{{ formatTime(endTime) }}</span>
        </div>

        <div v-else class="time-control-group">
          <label class="nb-label">持续时长 (秒)</label>
          <input type="number" min="0.1" step="0.1" v-model.number="duration" class="nb-input" />
          <span class="time-display">结束: {{ formatTime(computedEnd) }}</span>
        </div>
      </div>

      <div class="nb-alert info mt-16">
        <strong>剪辑片段长度:</strong> {{ formatTime(segmentLength) }}
      </div>
    </div>

    <div v-if="videoDuration > 0" class="mt-16">
      <button class="nb-btn primary lg" @click="trim" :disabled="processing || ffmpegLoading">
        <span v-if="ffmpegLoading"><span class="nb-spinner"></span> 加载 ffmpeg...</span>
        <span v-else-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>✂ 剪辑视频</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-label">{{ progress }}% - {{ progressMsg }}</div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.video-preview {
  width: 100%;
  max-height: 480px;
  border: 3px solid var(--ink);
  background: var(--ink);
  box-shadow: var(--shadow-sm);
}
.time-info { display: flex; gap: 8px; flex-wrap: wrap; }
.timeline {
  position: relative;
  padding: 0 4px;
}
.timeline-track {
  position: relative;
  height: 24px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  overflow: hidden;
}
.timeline-segment {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--accent);
  background-image: repeating-linear-gradient(
    45deg,
    var(--accent) 0,
    var(--accent) 6px,
    var(--accent-deep) 6px,
    var(--accent-deep) 12px
  );
  border-left: 2px solid var(--ink);
  border-right: 2px solid var(--ink);
}
.timeline-current {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 3px;
  background: var(--neon-deep);
  z-index: 2;
  box-shadow: 0 0 0 1px var(--ink);
}
.timeline-labels {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  margin-top: 4px;
}
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.time-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.time-control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 2px solid var(--ink);
  background: var(--paper-bg);
}
.control-buttons { display: flex; gap: 6px; flex-wrap: wrap; }
.time-display {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent-deep);
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
</style>

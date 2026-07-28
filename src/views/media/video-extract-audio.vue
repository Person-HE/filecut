<script setup>
/**
 * 视频提取音频 - 用 ffmpeg.wasm
 * 从视频中提取音轨，支持多种输出格式
 * 可选提取整段或指定片段
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

// 提取参数
const outputFormat = ref('mp3')
const bitrate = ref('192k')
const startTime = ref(0)
const extractMode = ref('full')  // 'full' | 'segment'
const endTime = ref(0)
const volume = ref(1)            // 音量倍数

let ffmpegInstance = null
const videoRef = ref(null)

const audioFormats = [
  { value: 'mp3', label: 'MP3 (推荐)', codec: 'libmp3lame', ext: 'mp3', mime: 'audio/mpeg' },
  { value: 'wav', label: 'WAV (无损)', codec: 'pcm_s16le', ext: 'wav', mime: 'audio/wav' },
  { value: 'aac', label: 'AAC', codec: 'aac', ext: 'aac', mime: 'audio/aac' },
  { value: 'flac', label: 'FLAC (无损压缩)', codec: 'flac', ext: 'flac', mime: 'audio/flac' },
  { value: 'ogg', label: 'OGG Vorbis', codec: 'libvorbis', ext: 'ogg', mime: 'audio/ogg' },
  { value: 'opus', label: 'OPUS', codec: 'libopus', ext: 'opus', mime: 'audio/ogg' }
]

const bitrates = ['64k', '96k', '128k', '192k', '256k', '320k']

const currentFormat = computed(() => audioFormats.find(f => f.value === outputFormat.value))

const segmentLength = computed(() => {
  if (extractMode.value === 'full') return 0
  return Math.max(0, endTime.value - startTime.value)
})

const isLossless = computed(() => ['wav', 'flac'].includes(outputFormat.value))

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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
  endTime.value = 0
}

function onLoadedMetadata() {
  videoDuration.value = videoRef.value?.duration || 0
  endTime.value = Math.min(videoDuration.value, 10)
}

async function extractAudio() {
  if (!file.value) { showError('请先选择视频文件'); return }
  if (!checkEnv()) return
  if (extractMode.value === 'segment' && segmentLength.value <= 0) {
    showError('请设置有效的提取区间'); return
  }
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
    const fmt = currentFormat.value
    const outputName = 'output.' + fmt.ext

    progressMsg.value = '写入文件...'
    const buf = await readFileAsArrayBuffer(file.value)
    await ffmpeg.writeFile(inputName, new Uint8Array(buf))

    ffmpeg.on('progress', ({ progress: p }) => {
      progress.value = Math.max(0, Math.min(100, Math.round(p * 100)))
      progressMsg.value = `提取中 ${progress.value}%`
    })

    progressMsg.value = '开始提取音频...'
    progress.value = 0

    const args = ['-i', inputName, '-vn']  // -vn 禁用视频

    // 区间设置
    if (extractMode.value === 'segment') {
      args.push('-ss', String(startTime.value), '-to', String(endTime.value))
    }

    // 音频编码
    args.push('-c:a', fmt.codec)
    if (!isLossless.value) {
      args.push('-b:a', bitrate.value)
    }

    // 音量调整
    if (volume.value !== 1) {
      args.push('-af', `volume=${volume.value}`)
    }

    args.push('-y', outputName)

    await ffmpeg.exec(args)

    progressMsg.value = '读取结果...'
    progress.value = 95
    const data = await ffmpeg.readFile(outputName)
    if (!data || data.length === 0) throw new Error('提取结果为空')

    const blob = new Blob([data.buffer], { type: fmt.mime })
    const outName = `${getBaseName(file.value.name)}.${fmt.ext}`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    try { await ffmpeg.deleteFile(inputName) } catch (e) {}
    try { await ffmpeg.deleteFile(outputName) } catch (e) {}

    progress.value = 100
    progressMsg.value = '完成'
  }, '提取失败')

  processing.value = false
}

onBeforeUnmount(() => {
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  try { ffmpegInstance?.terminate?.() } catch (e) {}
})
</script>

<template>
  <ToolLayout title="视频提取音频" desc="从视频中提取音轨，支持MP3/WAV/AAC/FLAC/OGG格式，可调音量" icon="♪">
    <FileDrop accept="video/*,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.mpeg,.mpg"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传视频文件" icon="♪" />

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
      <div v-if="videoDuration > 0" class="time-info mt-16">
        <span class="nb-tag cyan">总时长: {{ formatTime(videoDuration) }}</span>
      </div>
    </div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">提取设置</h3>

      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">输出格式</label>
          <select v-model="outputFormat" class="nb-select">
            <option v-for="f in audioFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>
        </div>
        <div v-if="!isLossless">
          <label class="nb-label">音频比特率</label>
          <select v-model="bitrate" class="nb-select">
            <option v-for="b in bitrates" :key="b" :value="b">{{ b }} ({{ b === '320k' ? '最高' : b === '64k' ? '低' : '标准' }})</option>
          </select>
        </div>
        <div>
          <label class="nb-label">提取范围</label>
          <select v-model="extractMode" class="nb-select">
            <option value="full">整段提取</option>
            <option value="segment">指定片段</option>
          </select>
        </div>
        <div>
          <label class="nb-label">音量倍数: {{ volume.toFixed(1) }}x</label>
          <select v-model.number="volume" class="nb-select">
            <option :value="0.5">0.5x (减半)</option>
            <option :value="1">1x (原音量)</option>
            <option :value="1.5">1.5x (增大)</option>
            <option :value="2">2x (两倍)</option>
            <option :value="3">3x (三倍)</option>
          </select>
        </div>
      </div>

      <div v-if="extractMode === 'segment' && videoDuration > 0" class="segment-controls mt-16">
        <div class="seg-group">
          <label class="nb-label">开始 (秒)</label>
          <input type="number" min="0" :max="videoDuration" step="0.1" v-model.number="startTime" class="nb-input" />
        </div>
        <div class="seg-group">
          <label class="nb-label">结束 (秒)</label>
          <input type="number" :min="startTime" :max="videoDuration" step="0.1" v-model.number="endTime" class="nb-input" />
        </div>
        <div class="seg-group">
          <label class="nb-label">片段时长</label>
          <div class="seg-duration">{{ formatTime(segmentLength) }}</div>
        </div>
      </div>

      <div class="nb-alert info mt-16">
        ⚠ ffmpeg.wasm 首次加载约 30MB。无损格式 (WAV/FLAC) 文件较大。高比特率音质更好但文件更大。
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="extractAudio" :disabled="processing || ffmpegLoading">
        <span v-if="ffmpegLoading"><span class="nb-spinner"></span> 加载 ffmpeg...</span>
        <span v-else-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>♪ 提取音频 ({{ outputFormat.toUpperCase() }})</span>
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
  max-height: 400px;
  border: 3px solid var(--ink);
  background: var(--ink);
  box-shadow: var(--shadow-sm);
}
.time-info { display: flex; gap: 8px; flex-wrap: wrap; }
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.segment-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.seg-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.seg-duration {
  padding: 10px 14px;
  background: var(--paper-bg);
  border: var(--border-w) solid var(--ink);
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-deep);
  box-shadow: var(--shadow-sm);
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
</style>

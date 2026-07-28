<script setup>
/**
 * 音视频格式转换 - 用 ffmpeg.wasm
 * 常见格式: MP4/AVI/MOV/MKV/WEBM 互转
 * MP3/WAV/AAC/FLAC 互转
 * 显示进度，提示首次加载较慢
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, getExt, replaceExt } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError, supportsSharedArrayBuffer, isLockdownMode } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const targetFormat = ref('mp4')
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')
const ffmpegLoading = ref(false)
const ffmpegReady = ref(false)

let ffmpegInstance = null

const videoFormats = [
  { value: 'mp4', label: 'MP4 (H.264)', codec: 'libx264', ext: 'mp4' },
  { value: 'webm', label: 'WebM (VP9)', codec: 'libvpx-vp9', ext: 'webm' },
  { value: 'mkv', label: 'MKV', codec: 'copy', ext: 'mkv' },
  { value: 'avi', label: 'AVI', codec: 'mpeg4', ext: 'avi' },
  { value: 'mov', label: 'MOV', codec: 'libx264', ext: 'mov' }
]
const audioFormats = [
  { value: 'mp3', label: 'MP3', codec: 'libmp3lame', ext: 'mp3' },
  { value: 'wav', label: 'WAV (PCM)', codec: 'pcm_s16le', ext: 'wav' },
  { value: 'aac', label: 'AAC', codec: 'aac', ext: 'aac' },
  { value: 'flac', label: 'FLAC', codec: 'flac', ext: 'flac' },
  { value: 'ogg', label: 'OGG Vorbis', codec: 'libvorbis', ext: 'ogg' }
]
const allFormats = [...videoFormats, ...audioFormats]

const detectedKind = computed(() => {
  if (!file.value) return ''
  const ext = getExt(file.value.name)
  if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'mpeg', 'mpg'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio'
  return ''
})

const suggestedFormats = computed(() => {
  return detectedKind.value === 'audio' ? audioFormats : videoFormats
})

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
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util')
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
  // 智能默认目标
  const ext = getExt(f.name)
  if (detectedKind.value === 'audio') {
    targetFormat.value = ext === 'mp3' ? 'wav' : 'mp3'
  } else {
    targetFormat.value = ext === 'mp4' ? 'webm' : 'mp4'
  }
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (!checkEnv()) return
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    if (file.value.size > 500 * 1024 * 1024) {
      throw new Error('文件过大 (>500MB)，建议在小文件上使用浏览器端处理')
    }

    const ffmpeg = await loadFFmpeg()
    const inputName = 'input.' + getExt(file.value.name)
    const targetFmt = allFormats.find(f => f.value === targetFormat.value)
    if (!targetFmt) throw new Error('目标格式不支持')
    const outputName = 'output.' + targetFmt.ext

    progressMsg.value = '写入文件...'
    const buf = await readFileAsArrayBuffer(file.value)
    await ffmpeg.writeFile(inputName, new Uint8Array(buf))

    // 进度监听
    ffmpeg.on('progress', ({ progress: p }) => {
      progress.value = Math.max(0, Math.min(100, Math.round(p * 100)))
      progressMsg.value = `转码中 ${progress.value}%`
    })

    progressMsg.value = '开始转码...'
    progress.value = 0

    // 构建 ffmpeg 命令
    const args = ['-i', inputName]
    if (targetFmt.codec !== 'copy') {
      args.push('-c:v', targetFmt.codec)
      // 音频用 AAC 兼容
      if (targetFmt.value === 'mp4' || targetFmt.value === 'mov') {
        args.push('-c:a', 'aac')
      } else if (targetFmt.value === 'webm') {
        args.push('-c:a', 'libvorbis')
      }
    }
    args.push('-preset', 'fast')
    args.push(outputName)

    await ffmpeg.exec(args)

    progressMsg.value = '读取结果...'
    progress.value = 95
    const data = await ffmpeg.readFile(outputName)
    if (!data || data.length === 0) throw new Error('转码结果为空')

    const blob = new Blob([data.buffer], { type: mimeType(targetFmt.ext) })
    const outName = replaceExt(file.value.name, '.' + targetFmt.ext)
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    // 清理
    try { await ffmpeg.deleteFile(inputName) } catch (e) {}
    try { await ffmpeg.deleteFile(outputName) } catch (e) {}

    progress.value = 100
    progressMsg.value = '完成'
  }, '转码失败')

  processing.value = false
}

function mimeType(ext) {
  const map = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
    flac: 'audio/flac',
    ogg: 'audio/ogg'
  }
  return map[ext] || 'application/octet-stream'
}

onBeforeUnmount(() => {
  try { ffmpegInstance?.terminate?.() } catch (e) {}
})
</script>

<template>
  <ToolLayout title="音视频格式转换" desc="音视频格式互转，支持MP4/AVI/MOV/MKV/WEBM/MP3/WAV/AAC/FLAC" icon="⇄">
    <FileDrop accept="video/*,audio/*,.mp4,.avi,.mov,.mkv,.webm,.flv,.mp3,.wav,.aac,.flac,.ogg,.m4a"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传视频或音频文件" icon="🎬" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ file.name }}</strong>
          <span class="file-meta"> · {{ formatBytes(file.size) }} · {{ detectedKind || '未知' }}</span>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">转换设置</h3>
      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">目标格式</label>
          <select v-model="targetFormat" class="nb-select">
            <optgroup v-if="detectedKind !== 'audio'" label="视频格式">
              <option v-for="f in videoFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
            </optgroup>
            <optgroup v-if="detectedKind !== 'video'" label="音频格式">
              <option v-for="f in audioFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
            </optgroup>
          </select>
        </div>
      </div>

      <div class="nb-alert info mt-16">
        ⚠ 注意：ffmpeg.wasm 首次加载约 30MB，需要支持 SharedArrayBuffer 的浏览器（Chrome/Edge/Firefox 最新版）。
        大文件处理可能耗时较长。
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing || ffmpegLoading">
        <span v-if="ffmpegLoading"><span class="nb-spinner"></span> 加载 ffmpeg...</span>
        <span v-else-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>⇄ 转换为 {{ targetFormat.toUpperCase() }}</span>
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
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
</style>

<script setup>
/**
 * 音频剪辑合并 - 用 ffmpeg.wasm
 * 功能：
 * - 音频剪辑（截取片段）
 * - 多音频合并（拼接）
 * - 音量调整
 * - 淡入淡出
 * - 格式转换
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName, getExt } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError, supportsSharedArrayBuffer, isLockdownMode } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])          // 音频文件列表 [{ file, name, size, url, duration }]
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')
const ffmpegLoading = ref(false)
const ffmpegReady = ref(false)

// 操作模式
const mode = ref('trim')       // 'trim' | 'merge' | 'volume' | 'fade'

// 剪辑参数
const startTime = ref(0)
const endTime = ref(0)

// 音量参数
const volume = ref(1)

// 淡入淡出
const fadeIn = ref(0)          // 秒
const fadeOut = ref(0)         // 秒

// 输出格式
const outputFormat = ref('mp3')

let ffmpegInstance = null

const audioFormats = [
  { value: 'mp3', label: 'MP3', codec: 'libmp3lame', ext: 'mp3', mime: 'audio/mpeg' },
  { value: 'wav', label: 'WAV (无损)', codec: 'pcm_s16le', ext: 'wav', mime: 'audio/wav' },
  { value: 'aac', label: 'AAC', codec: 'aac', ext: 'aac', mime: 'audio/aac' },
  { value: 'flac', label: 'FLAC', codec: 'flac', ext: 'flac', mime: 'audio/flac' },
  { value: 'ogg', label: 'OGG', codec: 'libvorbis', ext: 'ogg', mime: 'audio/ogg' }
]

const currentFormat = computed(() => audioFormats.find(f => f.value === outputFormat.value))
const firstFile = computed(() => files.value[0] || null)

const modeOptions = [
  { value: 'trim', label: '剪辑片段', needSingle: true },
  { value: 'merge', label: '合并拼接', needSingle: false, needMulti: true },
  { value: 'volume', label: '音量调整', needSingle: true },
  { value: 'fade', label: '淡入淡出', needSingle: true }
]

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
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    const url = URL.createObjectURL(f)
    files.value.push({
      file: f,
      name: f.name,
      size: f.size,
      url,
      duration: 0
    })
  }
  // 加载第一个文件的时长
  if (files.value.length === 1) {
    await loadFirstDuration()
  }
  result.value = []
  error.value = ''
}

async function loadFirstDuration() {
  // 通过创建临时 audio 元素获取时长
  return new Promise((resolve) => {
    if (!firstFile.value) { resolve(); return }
    const audio = new Audio()
    audio.src = firstFile.value.url
    audio.onloadedmetadata = () => {
      if (files.value[0]) {
        files.value[0].duration = audio.duration
        endTime.value = Math.min(audio.duration, 10)
      }
      resolve()
    }
    audio.onerror = () => resolve()
  })
}

function removeFile(idx) {
  const f = files.value[idx]
  if (f?.url) URL.revokeObjectURL(f.url)
  files.value.splice(idx, 1)
  if (!files.value.length) {
    result.value = []
  }
}

function moveFile(idx, dir) {
  const ni = idx + dir
  if (ni < 0 || ni >= files.value.length) return
  const tmp = files.value[idx]
  files.value[idx] = files.value[ni]
  files.value[ni] = tmp
}

function clearAll() {
  for (const f of files.value) {
    if (f.url) URL.revokeObjectURL(f.url)
  }
  files.value = []
  result.value = []
  error.value = ''
}

async function process() {
  if (!files.value.length) { showError('请先添加音频文件'); return }
  if (mode.value === 'trim' && (endTime.value - startTime.value) <= 0) {
    showError('请设置有效的剪辑区间'); return
  }
  if (mode.value === 'merge' && files.value.length < 2) {
    showError('合并至少需要 2 个音频文件'); return
  }
  if (!checkEnv()) return

  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0

  if (mode.value === 'merge') {
    await mergeAudio()
  } else {
    await editSingle()
  }

  processing.value = false
}

async function editSingle() {
  await safeRun(async () => {
    const target = files.value[0]
    if (target.file.size === 0) throw new Error('文件为空')
    if (target.file.size > 500 * 1024 * 1024) {
      throw new Error('文件过大 (>500MB)')
    }

    const ffmpeg = await loadFFmpeg()
    const ext = getExt(target.name) || 'mp3'
    const inputName = 'input.' + ext
    const fmt = currentFormat.value
    const outputName = 'output.' + fmt.ext

    progressMsg.value = '写入文件...'
    const buf = await readFileAsArrayBuffer(target.file)
    await ffmpeg.writeFile(inputName, new Uint8Array(buf))

    ffmpeg.on('progress', ({ progress: p }) => {
      progress.value = Math.max(0, Math.min(100, Math.round(p * 100)))
      progressMsg.value = `处理中 ${progress.value}%`
    })

    progressMsg.value = '开始处理...'
    progress.value = 0

    const args = ['-i', inputName]
    const filters = []

    if (mode.value === 'trim') {
      args.push('-ss', String(startTime.value), '-to', String(endTime.value))
    } else if (mode.value === 'volume' && volume.value !== 1) {
      filters.push(`volume=${volume.value}`)
    } else if (mode.value === 'fade') {
      if (fadeIn.value > 0) filters.push(`afade=t=in:st=0:d=${fadeIn.value}`)
      if (fadeOut.value > 0) {
        const st = Math.max(0, (target.duration || 0) - fadeOut.value)
        filters.push(`afade=t=out:st=${st}:d=${fadeOut.value}`)
      }
    }

    if (filters.length) args.push('-af', filters.join(','))
    args.push('-c:a', fmt.codec, '-y', outputName)

    await ffmpeg.exec(args)

    progressMsg.value = '读取结果...'
    progress.value = 95
    const data = await ffmpeg.readFile(outputName)
    if (!data || data.length === 0) throw new Error('处理结果为空')

    const blob = new Blob([data.buffer], { type: fmt.mime })
    const outName = `${getBaseName(target.name)}-edited.${fmt.ext}`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    try { await ffmpeg.deleteFile(inputName) } catch (e) {}
    try { await ffmpeg.deleteFile(outputName) } catch (e) {}

    progress.value = 100
    progressMsg.value = '完成'
  }, '音频处理失败')
}

async function mergeAudio() {
  await safeRun(async () => {
    const ffmpeg = await loadFFmpeg()
    const fmt = currentFormat.value
    const outputName = 'output.' + fmt.ext

    // 写入所有输入文件，并构建 concat 列表
    const inputFiles = []
    const listLines = []
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      if (f.file.size === 0) throw new Error(`文件 ${f.name} 为空`)
      if (f.file.size > 500 * 1024 * 1024) {
        throw new Error(`文件 ${f.name} 过大 (>500MB)`)
      }
      const ext = getExt(f.name) || 'mp3'
      const inputName = `input${i}.${ext}`
      progressMsg.value = `写入文件 ${i + 1}/${files.value.length}...`
      const buf = await readFileAsArrayBuffer(f.file)
      await ffmpeg.writeFile(inputName, new Uint8Array(buf))
      inputFiles.push(inputName)
      listLines.push(`file '${inputName}'`)
    }

    // 写入 concat 列表文件
    const listName = 'list.txt'
    await ffmpeg.writeFile(listName, new TextEncoder().encode(listLines.join('\n')))

    ffmpeg.on('progress', ({ progress: p }) => {
      progress.value = Math.max(0, Math.min(100, Math.round(p * 100)))
      progressMsg.value = `合并中 ${progress.value}%`
    })

    progressMsg.value = '开始合并...'
    progress.value = 0

    // 使用 concat demuxer（要求同格式；不同格式先转码）
    // 为兼容不同格式，先全部转为中间格式再合并
    const midFiles = []
    for (let i = 0; i < inputFiles.length; i++) {
      const midName = `mid${i}.${fmt.ext}`
      progressMsg.value = `标准化文件 ${i + 1}/${inputFiles.length}...`
      await ffmpeg.exec([
        '-i', inputFiles[i],
        '-c:a', fmt.codec,
        '-ar', '44100',
        '-ac', '2',
        '-y', midName
      ])
      midFiles.push(midName)
    }

    // 更新列表为标准化后的文件
    const midListLines = midFiles.map(f => `file '${f}'`)
    await ffmpeg.writeFile(listName, new TextEncoder().encode(midListLines.join('\n')))

    progressMsg.value = '合并中...'
    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', listName,
      '-c', 'copy',
      '-y', outputName
    ])

    progressMsg.value = '读取结果...'
    progress.value = 95
    const data = await ffmpeg.readFile(outputName)
    if (!data || data.length === 0) throw new Error('合并结果为空')

    const blob = new Blob([data.buffer], { type: fmt.mime })
    const outName = `merged.${fmt.ext}`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    // 清理
    for (const f of inputFiles) { try { await ffmpeg.deleteFile(f) } catch (e) {} }
    for (const f of midFiles) { try { await ffmpeg.deleteFile(f) } catch (e) {} }
    try { await ffmpeg.deleteFile(listName) } catch (e) {}
    try { await ffmpeg.deleteFile(outputName) } catch (e) {}

    progress.value = 100
    progressMsg.value = '完成'
  }, '音频合并失败')
}

onBeforeUnmount(() => {
  for (const f of files.value) {
    if (f.url) URL.revokeObjectURL(f.url)
  }
  try { ffmpegInstance?.terminate?.() } catch (e) {}
})
</script>

<template>
  <ToolLayout title="音频剪辑合并" desc="音频剪辑、多文件合并、音量调整、淡入淡出效果" icon="♪">
    <FileDrop accept="audio/*,.mp3,.wav,.aac,.flac,.ogg,.m4a,.wma,.opus"
              :multiple="true" @select="onFileSelect" @error="showError"
              hint="上传一个或多个音频文件" icon="♪" />

    <div v-if="files.length" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">音频文件 ({{ files.length }})</h3>
        <button class="nb-btn sm danger" @click="clearAll">全部清除</button>
      </div>
      <div class="audio-list mt-16">
        <div v-for="(f, i) in files" :key="i" class="audio-item">
          <span class="audio-icon">♪</span>
          <span class="audio-name" :title="f.name">{{ f.name }}</span>
          <span class="audio-size">{{ formatBytes(f.size) }}</span>
          <span v-if="f.duration" class="audio-dur">{{ formatTime(f.duration) }}</span>
          <div class="audio-actions">
            <button class="nb-btn sm" :disabled="i === 0" @click="moveFile(i, -1)">↑</button>
            <button class="nb-btn sm" :disabled="i === files.length - 1" @click="moveFile(i, 1)">↓</button>
            <button class="nb-btn sm danger" @click="removeFile(i)">×</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">操作设置</h3>

      <div class="mode-buttons mt-16">
        <button v-for="m in modeOptions" :key="m.value"
                class="nb-btn"
                :class="{ primary: mode === m.value }"
                @click="mode = m.value">
          {{ m.label }}
        </button>
      </div>

      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">输出格式</label>
          <select v-model="outputFormat" class="nb-select">
            <option v-for="f in audioFormats" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>
        </div>
      </div>

      <!-- 剪辑参数 -->
      <div v-if="mode === 'trim' && firstFile" class="mt-16">
        <div class="nb-alert info">
          源文件: {{ firstFile.name }}
          <span v-if="firstFile.duration"> · 时长: {{ formatTime(firstFile.duration) }}</span>
        </div>
        <div class="opt-grid mt-16">
          <div>
            <label class="nb-label">开始时间 (秒)</label>
            <input type="number" min="0" :max="firstFile.duration || 9999" step="0.1"
                   v-model.number="startTime" class="nb-input" />
          </div>
          <div>
            <label class="nb-label">结束时间 (秒)</label>
            <input type="number" :min="startTime" :max="firstFile.duration || 9999" step="0.1"
                   v-model.number="endTime" class="nb-input" />
          </div>
        </div>
      </div>

      <!-- 音量参数 -->
      <div v-if="mode === 'volume'" class="mt-16">
        <label class="nb-label">音量倍数: {{ volume.toFixed(1) }}x</label>
        <input type="range" min="0" max="4" step="0.1" v-model.number="volume" class="nb-input range-input" />
        <div class="range-marks">
          <span>0 (静音)</span><span>1x (原音量)</span><span>2x</span><span>4x</span>
        </div>
      </div>

      <!-- 淡入淡出参数 -->
      <div v-if="mode === 'fade'" class="mt-16">
        <div class="opt-grid">
          <div>
            <label class="nb-label">淡入时长 (秒)</label>
            <input type="number" min="0" step="0.1" v-model.number="fadeIn" class="nb-input" />
          </div>
          <div>
            <label class="nb-label">淡出时长 (秒)</label>
            <input type="number" min="0" step="0.1" v-model.number="fadeOut" class="nb-input" />
          </div>
        </div>
      </div>

      <!-- 合并提示 -->
      <div v-if="mode === 'merge'" class="nb-alert info mt-16">
        将按文件列表顺序合并为单个音频文件。不同格式的文件会先标准化再合并。
      </div>

      <div class="nb-alert info mt-16">
        ⚠ ffmpeg.wasm 首次加载约 30MB，需支持 SharedArrayBuffer 的浏览器。
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing || ffmpegLoading">
        <span v-if="ffmpegLoading"><span class="nb-spinner"></span> 加载 ffmpeg...</span>
        <span v-else-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>♪ 开始处理</span>
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
.audio-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}
.audio-item {
  display: grid;
  grid-template-columns: 24px 1fr 80px 60px auto;
  gap: 12px;
  align-items: center;
  padding: 10px 14px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
}
.audio-icon {
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
}
.audio-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audio-size { color: var(--ink-soft); font-size: 11px; text-align: right; }
.audio-dur { color: var(--cyan); font-size: 11px; text-align: right; }
.audio-actions { display: flex; gap: 4px; }
.mode-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.range-input { padding: 0; height: 32px; cursor: pointer; }
.range-marks {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-muted);
  margin-top: 4px;
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
@media (max-width: 768px) {
  .audio-item {
    grid-template-columns: 24px 1fr auto;
    font-size: 11px;
  }
  .audio-size, .audio-dur { display: none; }
}
</style>

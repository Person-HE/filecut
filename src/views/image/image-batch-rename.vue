<script setup>
/**
 * 批量图片重命名
 * - 按EXIF日期、序号、自定义模板重命名
 * - 输出ZIP包含重命名后的文件
 */
import { ref, onUnmounted, computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import exifr from 'exifr'
import JSZip from 'jszip'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

// 重命名模式
const mode = ref('exif-date')  // exif-date | sequence | custom

// 序号模式参数
const seqStart = ref(1)
const seqStep = ref(1)
const seqPad = ref(3)  // 数字位数
const seqPrefix = ref('IMG_')

// 自定义模板
const customTemplate = ref('{date}_{name}_{seq}')  // {date} {name} {seq} {ext} {size}

// 预览结果
const renamePreviews = ref([])  // [{ oldName, newName, file }]

const modeOptions = [
  { value: 'exif-date', label: '按EXIF拍摄日期' },
  { value: 'sequence', label: '序号模式' },
  { value: 'custom', label: '自定义模板' }
]

function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
  result.value = []
  error.value = ''
  // 不立即预览，等用户点击"预览"
}

function removeFile(idx) {
  files.value.splice(idx, 1)
  renamePreviews.value = []
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

function pad(n, width) {
  return String(n).padStart(width, '0')
}

function formatDateForName(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  const Y = dt.getFullYear()
  const M = pad(dt.getMonth() + 1, 2)
  const D = pad(dt.getDate(), 2)
  const h = pad(dt.getHours(), 2)
  const m = pad(dt.getMinutes(), 2)
  const s = pad(dt.getSeconds(), 2)
  return `${Y}${M}${D}_${h}${m}${s}`
}

function getExt(name) {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

function getBaseName(name) {
  const ext = getExt(name)
  return ext ? name.slice(0, name.length - ext.length - 1) : name
}

async function generatePreview() {
  if (!files.value.length) return
  error.value = ''
  progress.value = 0
  progressText.value = '生成预览...'
  renamePreviews.value = []

  const previews = []
  let seq = seqStart.value

  for (let i = 0; i < files.value.length; i++) {
    const f = files.value[i]
    progress.value = Math.round((i / files.value.length) * 100)
    progressText.value = `处理 ${i+1}/${files.value.length}: ${f.name}`

    let newName = ''

    if (mode.value === 'exif-date') {
      try {
        const exif = await exifr.parse(f, { tiff: true, exif: true })
        const dt = exif?.DateTimeOriginal || exif?.CreateDate
        const dateStr = formatDateForName(dt) || formatDateForName(new Date(f.lastModified)) || pad(i+1, 4)
        const ext = getExt(f.name)
        newName = `${dateStr}${ext ? '.' + ext : ''}`
      } catch (e) {
        const dateStr = formatDateForName(new Date(f.lastModified))
        const ext = getExt(f.name)
        newName = `${dateStr || pad(i+1, 4)}${ext ? '.' + ext : ''}`
      }
    } else if (mode.value === 'sequence') {
      const ext = getExt(f.name)
      newName = `${seqPrefix.value}${pad(seq, seqPad.value)}${ext ? '.' + ext : ''}`
      seq += seqStep.value
    } else if (mode.value === 'custom') {
      // 应用模板
      const ext = getExt(f.name)
      const baseName = getBaseName(f.name)
      const dateStr = formatDateForName(new Date(f.lastModified))
      newName = customTemplate.value
        .replace(/\{date\}/g, dateStr)
        .replace(/\{name\}/g, baseName)
        .replace(/\{seq\}/g, pad(i + seqStart.value, seqPad.value))
        .replace(/\{ext\}/g, ext)
        .replace(/\{size\}/g, formatBytes(f.size).replace(/\s/g, ''))
      if (ext && !newName.endsWith('.' + ext)) newName += '.' + ext
    }

    previews.push({
      oldName: f.name,
      newName,
      file: f
    })
  }

  renamePreviews.value = previews
  progress.value = 100
  progressText.value = `预览生成完成，共 ${previews.length} 个文件`
}

async function process() {
  if (!renamePreviews.value.length) {
    showError('请先生成预览')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressText.value = '打包ZIP...'
  cleanupUrls()

  await safeRun(async () => {
    const zip = new JSZip()
    const usedNames = new Set()
    for (let i = 0; i < renamePreviews.value.length; i++) {
      const p = renamePreviews.value[i]
      let finalName = p.newName
      // 处理重名
      if (usedNames.has(finalName)) {
        const ext = getExt(finalName)
        const base = getBaseName(finalName)
        let counter = 1
        while (usedNames.has(`${base}_${counter}${ext ? '.' + ext : ''}`)) counter++
        finalName = `${base}_${counter}${ext ? '.' + ext : ''}`
      }
      usedNames.add(finalName)
      zip.file(finalName, p.file)
      progress.value = Math.round((i / renamePreviews.value.length) * 100)
      progressText.value = `压缩 ${i+1}/${renamePreviews.value.length}`
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    if (!blob.size) throw new Error('打包失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    result.value = [{ name: `重命名_${renamePreviews.value.length}个文件.zip`, blob, url, size: blob.size }]
  }, '打包失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="批量图片重命名" desc="按EXIF日期、序号、自定义模板批量重命名" icon="#">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,.heic,.tiff,image/*"
              :multiple="true" hint="支持 JPG/PNG/WebP/HEIC/TIFF"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">重命名模式</h3>
      <div class="mt-16" style="display:flex; gap:8px; flex-wrap:wrap;">
        <label v-for="m in modeOptions" :key="m.value"
               class="mode-card" :class="{ active: mode === m.value }">
          <input type="radio" v-model="mode" :value="m.value" />
          <strong>{{ m.label }}</strong>
        </label>
      </div>

      <!-- 序号模式参数 -->
      <div v-if="mode === 'sequence'" class="nb-grid cols-4 mt-16">
        <div>
          <label class="nb-label">前缀</label>
          <input v-model="seqPrefix" class="nb-input" placeholder="如 IMG_" />
        </div>
        <div>
          <label class="nb-label">起始序号</label>
          <input type="number" v-model.number="seqStart" min="0" max="999999" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">步长</label>
          <input type="number" v-model.number="seqStep" min="1" max="100" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">位数</label>
          <input type="number" v-model.number="seqPad" min="1" max="10" class="nb-input" />
        </div>
      </div>

      <!-- 自定义模板 -->
      <div v-if="mode === 'custom'" class="mt-16">
        <label class="nb-label">命名模板</label>
        <input v-model="customTemplate" class="nb-input" placeholder="{date}_{name}_{seq}" />
        <div class="nb-alert mt-8" style="font-family: var(--font-mono); font-size: 11px;">
          <strong>可用变量：</strong>
          <code>{date}</code> - 拍摄日期 YYYYMMDD_HHMMSS ·
          <code>{name}</code> - 原文件名 ·
          <code>{seq}</code> - 序号 ·
          <code>{ext}</code> - 扩展名 ·
          <code>{size}</code> - 文件大小
        </div>
      </div>

      <div class="nb-alert info mt-16">
        <strong>提示：</strong>按EXIF日期模式时，无EXIF信息的文件会使用文件修改时间。
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn neon lg" @click="generatePreview" :disabled="processing">
        <span v-if="processing && !renamePreviews.length"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>生成预览</span>
      </button>
      <button v-if="renamePreviews.length" class="nb-btn primary lg"
              style="margin-left:8px;" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>打包下载 ({{ renamePreviews.length }} 文件)</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 预览列表 -->
    <div v-if="renamePreviews.length" class="nb-card mt-16">
      <h3 class="nb-h3">重命名预览</h3>
      <div class="rename-list mt-16">
        <div v-for="(p, i) in renamePreviews" :key="i" class="rename-row">
          <span class="idx">{{ i + 1 }}</span>
          <div class="names">
            <div class="old-name">{{ p.oldName }}</div>
            <div class="arrow">→</div>
            <div class="new-name">{{ p.newName }}</div>
          </div>
          <span class="file-size">{{ formatBytes(p.file.size) }}</span>
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
  transition: all 0.1s ease;
}
.mode-card:hover { background: var(--accent-soft); }
.mode-card.active {
  background: var(--neon); box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-1px, -1px);
}
.mode-card input { margin: 0; accent-color: var(--accent); }

.rename-list {
  border: 3px solid var(--ink);
  max-height: 400px;
  overflow: auto;
}
.rename-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border-bottom: 2px solid var(--ink);
  font-family: var(--font-mono); font-size: 12px;
  background: var(--paper-card);
}
.rename-row:hover { background: var(--accent-soft); }
.idx {
  background: var(--ink); color: var(--neon);
  padding: 2px 8px; font-weight: 700;
}
.names { flex: 1; display: flex; align-items: center; gap: 8px; }
.old-name { color: var(--ink-soft); text-decoration: line-through; }
.arrow { color: var(--accent); font-weight: 700; }
.new-name { color: var(--ink); font-weight: 600; }
.file-size { color: var(--ink-muted); }
</style>

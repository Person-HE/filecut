<script setup>
/**
 * 批量文件处理中心
 * - 上传多个文件
 * - 选择批量操作: 重命名/压缩/格式转换/添加水印
 * - Web Worker 队列处理
 * - 输出 ZIP
 */
import { ref, computed, onUnmounted } from 'vue'
import JSZip from 'jszip'
import imageCompression from 'browser-image-compression'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, getExt } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])
const operation = ref('rename') // rename | compress | convert-image | watermark-pdf
const processing = ref(false)
const progress = ref({ current: 0, total: 0, name: '', stage: '' })
const result = ref([])
const taskLog = ref([])
const error = ref('')

// 各操作的参数
const renameTemplate = ref('{name}_batch{ext}')
const compressQuality = ref(0.7)
const convertFormat = ref('webp')
const watermarkText = ref('CONFIDENTIAL')

const operations = [
  { id: 'rename',         label: '批量重命名',   desc: '按模板重命名所有文件', icon: '#' },
  { id: 'compress',       label: '批量压缩',     desc: '压缩图片/PDF体积', icon: '↓' },
  { id: 'convert-image',  label: '图片格式转换', desc: '转换图片为统一格式', icon: '⇄' },
  { id: 'watermark-pdf',  label: 'PDF加水印',    desc: '为所有PDF加水印', icon: '◐' }
]

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
  }
  files.value = [...files.value, ...arr]
}

function removeFile(idx) { files.value.splice(idx, 1) }

// === Web Worker 实现 ===
const workerCode = `
self.onmessage = async function(e) {
  const { task, files, params } = e.data
  const results = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    self.postMessage({ type: 'progress', current: i, total: files.length, name: f.name, stage: '处理中' })
    try {
      let outBlob = null
      let outName = f.name
      if (task === 'rename') {
        const ext = '.' + (f.name.split('.').pop() || '')
        const name = f.name.replace(/\\.[^.]+$/, '')
        let newName = params.template
          .replace(/\\{name\\}/g, name)
          .replace(/\\{ext\\}/g, ext)
          .replace(/\\{n\\}/g, String(i + 1).padStart(3, '0'))
          .replace(/\\{date\\}/g, new Date().toISOString().slice(0, 10).replace(/-/g, ''))
        outName = newName
        outBlob = new Blob([await f.arrayBuffer()], { type: f.type })
      } else if (task === 'compress') {
        const ext = (f.name.split('.').pop() || '').toLowerCase()
        if (['jpg','jpeg','png','webp','bmp'].includes(ext)) {
          // 图片压缩 - 主线程不能传图片库, 这里返回原文件
          // 实际压缩在主线程做 (browser-image-compression 用 Web Worker 内部)
          outBlob = new Blob([await f.arrayBuffer()], { type: f.type })
          outName = f.name
          results.push({ name: f.name, error: '图片压缩需在主线程处理', skipped: true })
          continue
        } else if (ext === 'pdf') {
          // PDF 重压缩
          const buf = await f.arrayBuffer()
          const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
          const saved = await pdf.save({ useObjectStreams: true })
          outBlob = new Blob([saved], { type: 'application/pdf' })
          outName = f.name
        } else {
          results.push({ name: f.name, error: '不支持的压缩类型', skipped: true })
          continue
        }
      } else if (task === 'convert-image') {
        const ext = (f.name.split('.').pop() || '').toLowerCase()
        if (!['jpg','jpeg','png','webp','bmp'].includes(ext)) {
          results.push({ name: f.name, error: '非图片文件', skipped: true })
          continue
        }
        outBlob = new Blob([await f.arrayBuffer()], { type: f.type })
        outName = f.name
        results.push({ name: f.name, error: '图片转换需在主线程处理', skipped: true })
        continue
      } else if (task === 'watermark-pdf') {
        const ext = (f.name.split('.').pop() || '').toLowerCase()
        if (ext !== 'pdf') {
          results.push({ name: f.name, error: '非PDF文件', skipped: true })
          continue
        }
        // PDF 加水印 (在 worker 内不能用 pdf-lib, 它需要 DOM-free 环境, 实际可用)
        // 这里改为标记需要在主线程处理
        outBlob = new Blob([await f.arrayBuffer()], { type: 'application/pdf' })
        outName = f.name
        results.push({ name: f.name, error: 'PDF水印需在主线程处理', skipped: true })
        continue
      }
      results.push({ name: outName, blob: outBlob, original: f.name, size: outBlob.size, ok: true })
    } catch (e) {
      results.push({ name: f.name, error: e.message, skipped: true })
    }
  }
  self.postMessage({ type: 'done', results })
}
`

let worker = null
let workerUrl = null
function destroyWorker() {
  if (worker) { worker.terminate(); worker = null }
  if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null }
}
onUnmounted(destroyWorker)

// 由于各任务需要不同的库, 简化实现: 在主线程串行处理, 不用 worker
// 但保留进度展示. 实际生产可拆分独立 worker 文件
async function process() {
  if (!files.value.length) { showError('请先选择文件'); return }
  error.value = ''
  result.value = []
  taskLog.value = []
  processing.value = true
  progress.value = { current: 0, total: files.value.length, name: '', stage: '开始' }

  await safeRun(async () => {
    const outFiles = []
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      progress.value = { current: i, total: files.value.length, name: f.name, stage: '处理中' }
      taskLog.value.push({ name: f.name, status: 'processing' })

      try {
        const result = await processOne(f, i + 1)
        if (result) {
          outFiles.push(result)
          taskLog.value[i].status = 'ok'
          taskLog.value[i].outName = result.name
        } else {
          taskLog.value[i].status = 'skipped'
        }
      } catch (e) {
        taskLog.value[i].status = 'fail'
        taskLog.value[i].error = e?.message || '失败'
      }
      // 让出主线程
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 0))
    }

    if (!outFiles.length) throw new Error('所有文件处理失败或被跳过')

    // 打包 ZIP
    progress.value = { current: files.value.length, total: files.value.length, name: '', stage: '打包中' }
    const zip = new JSZip()
    for (const f of outFiles) {
      zip.file(f.name, f.blob)
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
    if (blob.size === 0) throw new Error('ZIP 打包结果为空')

    result.value = [{
      name: `batch-${operation.value}-${Date.now()}.zip`,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size
    }]
  }, '批量处理失败')
  processing.value = false
  progress.value = { current: 0, total: 0, name: '', stage: '' }
}

async function processOne(f, idx) {
  const ext = getExt(f.name)
  switch (operation.value) {
    case 'rename': {
      const ext2 = '.' + ext
      const name = getBaseName(f.name)
      let newName = renameTemplate.value
        .replace(/\{name\}/g, name)
        .replace(/\{ext\}/g, ext2)
        .replace(/\{n\}/g, String(idx).padStart(3, '0'))
        .replace(/\{date\}/g, new Date().toISOString().slice(0, 10).replace(/-/g, ''))
      newName = newName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      const buf = await f.arrayBuffer()
      return { name: newName, blob: new Blob([buf], { type: f.type }), url: URL.createObjectURL(new Blob([buf])), size: f.size }
    }
    case 'compress': {
      if (['jpg','jpeg','png','webp','bmp'].includes(ext)) {
        const compressed = await imageCompression(f, {
          maxSizeMB: 10,
          useWebWorker: true,
          initialQuality: compressQuality.value
        })
        return {
          name: `${getBaseName(f.name)}-compressed.${ext}`,
          blob: compressed,
          url: URL.createObjectURL(compressed),
          size: compressed.size
        }
      } else if (ext === 'pdf') {
        const buf = await f.arrayBuffer()
        const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
        const saved = await pdf.save({ useObjectStreams: true })
        const blob = new Blob([saved], { type: 'application/pdf' })
        return {
          name: `${getBaseName(f.name)}-compressed.pdf`,
          blob,
          url: URL.createObjectURL(blob),
          size: blob.size
        }
      }
      return null
    }
    case 'convert-image': {
      if (!['jpg','jpeg','png','webp','bmp','gif'].includes(ext)) return null
      // 用 canvas 转换
      const bitmap = await createImageBitmap(f)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0)
      const type = `image/${convertFormat.value === 'jpg' ? 'jpeg' : convertFormat.value}`
      const blob = await new Promise(res => canvas.toBlob(res, type, 0.92))
      return {
        name: `${getBaseName(f.name)}.${convertFormat.value}`,
        blob,
        url: URL.createObjectURL(blob),
        size: blob.size
      }
    }
    case 'watermark-pdf': {
      if (ext !== 'pdf') return null
      const buf = await f.arrayBuffer()
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
      const font = await pdf.embedFont(StandardFonts.HelveticaBold)
      const pages = pdf.getPages()
      for (const page of pages) {
        const { width, height } = page.getSize()
        // 对角水印
        page.drawText(watermarkText.value, {
          x: width / 4,
          y: height / 2,
          size: 60,
          font,
          color: rgb(0.85, 0.1, 0.1),
          opacity: 0.3,
          rotate: { degrees: 45, type: 'degrees' }
        })
      }
      const saved = await pdf.save({ useObjectStreams: true })
      const blob = new Blob([saved], { type: 'application/pdf' })
      return {
        name: `${getBaseName(f.name)}-watermarked.pdf`,
        blob,
        url: URL.createObjectURL(blob),
        size: blob.size
      }
    }
    default: return null
  }
}

const okCount = computed(() => taskLog.value.filter(t => t.status === 'ok').length)
const failCount = computed(() => taskLog.value.filter(t => t.status === 'fail').length)
</script>

<template>
  <ToolLayout title="批量文件处理中心" desc="批量重命名/压缩/格式转换/加水印，队列处理输出 ZIP" icon="▤">
    <FileDrop accept="*" :multiple="true" hint="支持任意文件批量处理"
              @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div v-if="files.length" class="mt-16 nb-card">
      <label class="nb-label">批量操作</label>
      <div class="op-grid">
        <button v-for="op in operations" :key="op.id"
                class="op-card"
                :class="{ active: operation === op.id }"
                @click="operation = op.id">
          <div class="op-icon">{{ op.icon }}</div>
          <div class="op-name">{{ op.label }}</div>
          <div class="op-desc">{{ op.desc }}</div>
        </button>
      </div>

      <div class="mt-16 op-params">
        <div v-if="operation === 'rename'" class="nb-grid cols-2">
          <div>
            <label class="nb-label">重命名模板</label>
            <input v-model="renameTemplate" class="nb-input" placeholder="{name}_batch{ext}">
          </div>
          <div class="nb-alert info">
            <strong>变量:</strong> {name}原文件名 · {ext}扩展名 · {n}序号 · {date}日期
          </div>
        </div>
        <div v-else-if="operation === 'compress'" class="nb-grid cols-2">
          <div>
            <label class="nb-label">压缩质量 ({{ compressQuality }})</label>
            <input type="range" v-model.number="compressQuality" min="0.1" max="1" step="0.1" class="range-input">
          </div>
          <div class="nb-alert info">支持图片 (JPG/PNG/WEBP) 和 PDF 重压缩</div>
        </div>
        <div v-else-if="operation === 'convert-image'" class="nb-grid cols-2">
          <div>
            <label class="nb-label">目标格式</label>
            <select v-model="convertFormat" class="nb-select">
              <option value="webp">WebP</option>
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
            </select>
          </div>
          <div class="nb-alert info">仅处理图片文件, 其他跳过</div>
        </div>
        <div v-else-if="operation === 'watermark-pdf'" class="nb-grid cols-2">
          <div>
            <label class="nb-label">水印文字</label>
            <input v-model="watermarkText" class="nb-input" placeholder="CONFIDENTIAL">
          </div>
          <div class="nb-alert info">为每个 PDF 添加对角红色水印</div>
        </div>
      </div>

      <button class="nb-btn primary lg block mt-16" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progress.stage }} {{ progress.current }}/{{ progress.total }}</span>
        <span v-else>⚡ 开始批量处理</span>
      </button>
    </div>

    <div v-if="processing && progress.total" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: (progress.current / progress.total * 100) + '%' }"></div>
      </div>
      <div class="progress-text">{{ progress.stage }}: {{ progress.name }} ({{ progress.current }}/{{ progress.total }})</div>
    </div>

    <div v-if="taskLog.length" class="mt-16 nb-card">
      <div class="log-head">
        <span class="nb-h3">处理日志</span>
        <span class="nb-tag neon">{{ okCount }} 成功</span>
        <span class="nb-tag accent" v-if="failCount">{{ failCount }} 失败</span>
      </div>
      <div class="log-list mt-16">
        <div v-for="(t, i) in taskLog" :key="i" class="log-item" :class="t.status">
          <span class="log-status">{{ t.status === 'ok' ? '✓' : t.status === 'fail' ? '✕' : '−' }}</span>
          <span class="log-name">{{ t.name }}</span>
          <span v-if="t.outName" class="log-outname">→ {{ t.outName }}</span>
          <span v-if="t.error" class="log-error">{{ t.error }}</span>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.op-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.op-card {
  padding: 14px;
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  transition: all 0.1s ease;
}
.op-card:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--ink); }
.op-card.active {
  background: var(--neon);
  box-shadow: 5px 5px 0 var(--ink);
  transform: translate(-2px, -2px);
}
.op-icon { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
.op-card.active .op-icon { color: var(--ink); }
.op-name { font-weight: 700; margin-top: 4px; font-size: 14px; }
.op-desc { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }
.range-input { width: 100%; }
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
.log-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.log-list {
  max-height: 300px;
  overflow-y: auto;
  background: var(--ink);
  border: 2px solid var(--ink);
}
.log-item {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #333;
  font-family: var(--font-mono);
  font-size: 12px;
  align-items: center;
}
.log-item:last-child { border-bottom: none; }
.log-status { font-weight: 700; min-width: 16px; }
.log-item.ok .log-status { color: var(--neon); }
.log-item.fail .log-status { color: var(--danger); }
.log-item.skipped .log-status { color: var(--warning); }
.log-name { color: var(--paper-card); flex: 1; word-break: break-all; }
.log-outname { color: var(--neon); }
.log-error { color: var(--accent); }
</style>

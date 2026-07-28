<script setup>
/**
 * 文件大小压缩 - 综合压缩
 * 检测文件类型，调用对应压缩算法
 * - 文本: gzip
 * - 图片: browser-image-compression
 * - PDF: pdf-lib 重压缩图片
 */
import { ref } from 'vue'
import imageCompression from 'browser-image-compression'
import { PDFDocument } from 'pdf-lib'
import * as pako from 'pako'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, getExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import { showError, safeRun } from '../../utils/common.js'
import { streamFile } from '../../utils/fileReader.js'

const files = ref([])
const imageQuality = ref(0.7)
const imageMaxSize = ref(1920)
const gzipLevel = ref(6)
const processing = ref(false)
const progress = ref({ current: 0, total: 0, name: '' })
const results = ref([])
const resultInfo = ref([])
const error = ref('')

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
  }
  files.value = [...files.value, ...arr]
}

function removeFile(idx) { files.value.splice(idx, 1) }

function isImage(ext) {
  return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)
}

function isText(ext) {
  return ['txt', 'csv', 'json', 'xml', 'html', 'htm', 'md', 'yaml', 'yml', 'js', 'ts', 'css', 'scss', 'log', 'svg'].includes(ext)
}

async function compressImage(file) {
  const options = {
    maxSizeMB: Math.max(0.1, file.size / 1024 / 1024 * 0.7),
    useWebWorker: true,
    maxWidthOrHeight: imageMaxSize.value,
    initialQuality: imageQuality.value,
    onProgress: (p) => {
      progress.value = { current: p, total: 100, name: file.name }
    }
  }
  const compressed = await imageCompression(file, options)
  return compressed
}

async function compressText(file) {
  // 用 pako gzip 压缩文本
  const chunks = []
  for await (const chunk of streamFile(file, 1024 * 1024)) {
    chunks.push(chunk)
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  const data = new Uint8Array(totalLen)
  let off = 0
  for (const c of chunks) { data.set(c, off); off += c.length }
  const compressed = pako.gzip(data, { level: gzipLevel.value })
  return new Blob([compressed], { type: 'application/gzip' })
}

async function compressPdf(file) {
  // 简化版: 重新加载并保存，剥离部分冗余
  const buf = await file.arrayBuffer()
  const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
  // pdf-lib 不能直接压缩图片，但可重新保存并应用对象流
  const saved = await pdf.save({ useObjectStreams: true })
  return new Blob([saved], { type: 'application/pdf' })
}

async function process() {
  if (!files.value.length) { showError('请先选择文件'); return }
  error.value = ''
  results.value = []
  resultInfo.value = []
  processing.value = true

  await safeRun(async () => {
    const outFiles = []
    const info = []
    for (const file of files.value) {
      const ext = getExt(file.name)
      let compressed = null
      let method = ''
      try {
        if (isImage(ext)) {
          method = `图片压缩 (Q=${imageQuality.value}, Max=${imageMaxSize.value}px)`
          compressed = await compressImage(file)
        } else if (isText(ext)) {
          method = `Gzip 压缩 (Level=${gzipLevel.value})`
          compressed = await compressText(file)
        } else if (ext === 'pdf') {
          method = 'PDF 对象流重压缩'
          compressed = await compressPdf(file)
        } else {
          // 通用: 尝试 gzip
          method = `Gzip 通用压缩 (Level=${gzipLevel.value})`
          compressed = await compressText(file)
        }

        if (!compressed || compressed.size === 0) throw new Error('压缩结果为空')

        // 如果压缩后反而变大, 提示并保留原文件
        if (compressed.size >= file.size) {
          info.push({
            name: file.name,
            method,
            before: file.size,
            after: compressed.size,
            note: '⚠ 压缩后体积更大，建议保留原文件',
            skipped: true
          })
          continue
        }

        const newExt = isImage(ext) ? ext : (isText(ext) || !isImage(ext) ? 'gz' : ext)
        const newName = isImage(ext)
          ? `${getBaseName(file.name)}-compressed.${ext}`
          : `${file.name}.gz`
        const url = URL.createObjectURL(compressed)
        outFiles.push({ name: newName, blob: compressed, url, size: compressed.size })
        info.push({
          name: file.name,
          method,
          before: file.size,
          after: compressed.size,
          ratio: ((1 - compressed.size / file.size) * 100).toFixed(1),
          skipped: false
        })
      } catch (e) {
        info.push({ name: file.name, error: e?.message || '压缩失败' })
      }
    }
    resultInfo.value = info
    results.value = outFiles
    if (!outFiles.length && info.every(i => i.error || i.skipped)) {
      throw new Error('所有文件压缩失败或无改善')
    }
  }, '压缩失败')
  processing.value = false
  progress.value = { current: 0, total: 0, name: '' }
}
</script>

<template>
  <ToolLayout title="文件大小压缩" desc="智能识别文件类型，调用对应压缩算法减小体积" icon="↓">
    <FileDrop accept="*" :multiple="true" hint="支持图片/文本/PDF，自动选择最佳压缩算法"
              @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div v-if="files.length" class="mt-16 nb-card">
      <div class="nb-h3">压缩参数</div>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">图片质量 ({{ imageQuality }})</label>
          <input type="range" v-model.number="imageQuality" min="0.1" max="1" step="0.1" class="range-input">
        </div>
        <div>
          <label class="nb-label">图片最大边 ({{ imageMaxSize }}px)</label>
          <input type="range" v-model.number="imageMaxSize" min="320" max="4096" step="160" class="range-input">
        </div>
        <div>
          <label class="nb-label">Gzip 等级 ({{ gzipLevel }})</label>
          <input type="range" v-model.number="gzipLevel" min="1" max="9" step="1" class="range-input">
        </div>
      </div>
      <button class="nb-btn primary lg block mt-16" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 压缩中...</span>
        <span v-else>⚡ 智能压缩</span>
      </button>
    </div>

    <div v-if="processing && progress.total" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: (progress.current / progress.total * 100) + '%' }"></div>
      </div>
      <div class="progress-text">{{ progress.name }}: {{ progress.current }}%</div>
    </div>

    <div v-if="resultInfo.length" class="mt-16 nb-card">
      <div class="nb-h3">压缩对比</div>
      <table class="info-table mt-16">
        <thead>
          <tr><th>文件</th><th>方法</th><th>原大小</th><th>新大小</th><th>压缩率</th></tr>
        </thead>
        <tbody>
          <tr v-for="(i, idx) in resultInfo" :key="idx">
            <td>{{ i.name }}</td>
            <td>{{ i.method || i.error }}</td>
            <td v-if="!i.error">{{ formatBytes(i.before) }}</td>
            <td v-if="!i.error">{{ formatBytes(i.after) }}</td>
            <td v-if="!i.error" :class="{ positive: !i.skipped && parseFloat(i.ratio) > 0 }">
              {{ i.skipped ? i.note : (i.ratio + '%') }}
            </td>
            <td v-if="i.error" colspan="3" class="err-cell">{{ i.error }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div class="nb-alert info mt-16">
      <strong>策略说明：</strong>
      <ul>
        <li>图片: 使用 Web Worker 重编码 (质量+尺寸)</li>
        <li>文本类: Gzip 压缩 (输出 .gz)</li>
        <li>PDF: 对象流重压缩 (有限提升)</li>
        <li>其他: 通用 Gzip 压缩</li>
      </ul>
    </div>

    <ResultViewer :files="results" />
  </ToolLayout>
</template>

<style scoped>
.range-input { width: 100%; }
.info-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--paper-bg);
}
.info-table th, .info-table td {
  border: 2px solid var(--ink);
  padding: 8px;
  text-align: left;
}
.info-table th { background: var(--ink); color: var(--neon); }
.info-table td.positive { color: var(--accent); font-weight: 700; }
.info-table .err-cell { color: var(--danger); }
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
ul { margin: 6px 0 0 16px; }
</style>

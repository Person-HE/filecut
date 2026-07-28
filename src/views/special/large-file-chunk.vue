<script setup>
/**
 * 大文件分块处理
 * - 上传大文件
 * - 用 Streams API 流式处理
 * - 多种处理选项: 分块读取/计算哈希/格式检测
 */
import { ref } from 'vue'
import { md5, sha256 } from 'hash-wasm'
import { fileTypeFromBuffer } from 'file-type'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { streamFile } from '../../utils/fileReader.js'

const file = ref(null)
const chunkSize = ref(4)  // MB
const operation = ref('analyze') // analyze | hash | split | detect
const processing = ref(false)
const progress = ref({ current: 0, total: 0, name: '' })
const result = ref([])
const report = ref(null)
const error = ref('')

const operations = [
  { id: 'analyze', label: '分块分析', desc: '读取并显示每块信息' },
  { id: 'hash',    label: '流式哈希', desc: '计算 MD5 + SHA-256' },
  { id: 'split',   label: '切分打包', desc: '按块切分为 ZIP' },
  { id: 'detect',  label: '格式检测', desc: '识别文件头类型' }
]

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  file.value = f
  report.value = null
  result.value = []
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  error.value = ''
  result.value = []
  report.value = null
  processing.value = true
  progress.value = { current: 0, total: file.value.size, name: file.value.name }

  await safeRun(async () => {
    const sizeBytes = chunkSize.value * 1024 * 1024

    if (operation.value === 'analyze') {
      await analyzeChunks(sizeBytes)
    } else if (operation.value === 'hash') {
      await hashLargeFile(sizeBytes)
    } else if (operation.value === 'split') {
      await splitToZip(sizeBytes)
    } else if (operation.value === 'detect') {
      await detectFormat()
    }
  }, '处理失败')
  processing.value = false
  progress.value = { current: 0, total: 0, name: '' }
}

async function analyzeChunks(sizeBytes) {
  const chunks = []
  let idx = 0
  let offset = 0
  for await (const chunk of streamFile(file.value, sizeBytes)) {
    chunks.push({
      index: idx,
      offset,
      size: chunk.length,
      head: Array.from(chunk.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    })
    offset += chunk.length
    progress.value.current = offset
    idx++
    if (idx % 10 === 0) await new Promise(r => setTimeout(r, 0))
  }
  report.value = {
    type: 'analyze',
    totalChunks: chunks.length,
    chunkSize: sizeBytes,
    chunks: chunks.slice(0, 100), // 仅显示前100块
    truncated: chunks.length > 100
  }
}

async function hashLargeFile(sizeBytes) {
  const md5Hasher = await md5.create()
  const sha256Hasher = await sha256.create()
  let offset = 0
  for await (const chunk of streamFile(file.value, sizeBytes)) {
    md5Hasher.update(chunk)
    sha256Hasher.update(chunk)
    offset += chunk.length
    progress.value.current = offset
    if ((offset / sizeBytes | 0) % 4 === 0) await new Promise(r => setTimeout(r, 0))
  }
  report.value = {
    type: 'hash',
    md5: md5Hasher.digest(),
    sha256: sha256Hasher.digest(),
    size: file.value.size
  }
}

async function splitToZip(sizeBytes) {
  const zip = new JSZip()
  let idx = 0
  let offset = 0
  const baseName = file.value.name.replace(/\.[^.]+$/, '')
  for await (const chunk of streamFile(file.value, sizeBytes)) {
    const partName = `${baseName}.part${String(idx).padStart(3, '0')}`
    zip.file(partName, chunk)
    offset += chunk.length
    progress.value.current = offset
    idx++
    if (idx % 5 === 0) await new Promise(r => setTimeout(r, 0))
  }
  // 添加 manifest
  zip.file('_manifest.json', JSON.stringify({
    originalName: file.value.name,
    size: file.value.size,
    chunkSize: sizeBytes,
    parts: idx,
    createdAt: new Date().toISOString()
  }, null, 2))

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE', // 大文件不再压缩
    onUpdate: (meta) => {
      progress.value = { current: meta.percent, total: 100, name: '压缩中' }
    }
  })
  if (blob.size === 0) throw new Error('输出为空')
  result.value = [{
    name: `${baseName}-chunks-${Date.now()}.zip`,
    blob,
    url: URL.createObjectURL(blob),
    size: blob.size
  }]
}

async function detectFormat() {
  const headSize = Math.min(4100, file.value.size)
  const head = new Uint8Array(await file.value.slice(0, headSize).arrayBuffer())
  let detected = null
  try { detected = await fileTypeFromBuffer(head) } catch (e) {}

  // 尾部签名
  const tailSize = Math.min(256, file.value.size)
  const tail = new Uint8Array(await file.value.slice(file.value.size - tailSize).arrayBuffer())
  const tailHex = Array.from(tail.slice(-16)).map(b => b.toString(16).padStart(2, '0')).join(' ')

  report.value = {
    type: 'detect',
    size: file.value.size,
    detected,
    headHex: Array.from(head.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' '),
    tailHex
  }
}

function removeFile() {
  file.value = null
  report.value = null
  result.value = []
}
</script>

<template>
  <ToolLayout title="大文件分块处理" desc="使用 Streams API 流式处理大文件，避免内存溢出" icon="▤">
    <FileDrop accept="*" :multiple="false"
              hint="支持任意大小文件 (1GB+ 推荐)，使用流式处理"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
      </div>

      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">分块大小 ({{ chunkSize }} MB)</label>
          <input type="range" v-model.number="chunkSize" min="1" max="64" step="1" class="range-input">
        </div>
        <div>
          <label class="nb-label">处理操作</label>
          <select v-model="operation" class="nb-select">
            <option v-for="op in operations" :key="op.id" :value="op.id">{{ op.label }} - {{ op.desc }}</option>
          </select>
        </div>
      </div>

      <button class="nb-btn primary lg block mt-16" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>⚡ 开始处理</span>
      </button>
    </div>

    <div v-if="processing && progress.total" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: (progress.current / progress.total * 100) + '%' }"></div>
      </div>
      <div class="progress-text">{{ progress.name }}: {{ formatBytes(progress.current) }} / {{ formatBytes(progress.total) }}</div>
    </div>

    <div v-if="report" class="mt-16 nb-card">
      <div class="nb-h3">处理报告</div>

      <div v-if="report.type === 'analyze'" class="mt-16">
        <div class="report-summary">
          <span class="nb-tag neon">{{ report.totalChunks }} 块</span>
          <span class="nb-tag">{{ formatBytes(report.chunkSize) }} / 块</span>
        </div>
        <table class="chunk-table mt-16">
          <thead><tr><th>#</th><th>偏移</th><th>大小</th><th>头部字节</th></tr></thead>
          <tbody>
            <tr v-for="c in report.chunks" :key="c.index">
              <td>{{ c.index }}</td>
              <td>{{ formatBytes(c.offset) }}</td>
              <td>{{ formatBytes(c.size) }}</td>
              <td><code>{{ c.head }}</code></td>
            </tr>
          </tbody>
        </table>
        <div v-if="report.truncated" class="nb-alert mt-16">仅显示前 100 块, 完整列表请下载</div>
      </div>

      <div v-if="report.type === 'hash'" class="mt-16">
        <div class="hash-block">
          <span class="nb-tag neon">MD5</span>
          <code>{{ report.md5 }}</code>
        </div>
        <div class="hash-block">
          <span class="nb-tag neon">SHA-256</span>
          <code>{{ report.sha256 }}</code>
        </div>
      </div>

      <div v-if="report.type === 'detect'" class="mt-16">
        <div class="info-row">
          <span class="info-label">真实类型</span>
          <span class="info-value">
            <span class="nb-tag neon">{{ report.detected?.ext || '未识别' }}</span>
            <code>{{ report.detected?.mime || '未知' }}</code>
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">头部 32 字节</span>
          <code class="hex">{{ report.headHex }}</code>
        </div>
        <div class="info-row">
          <span class="info-label">尾部 16 字节</span>
          <code class="hex">{{ report.tailHex }}</code>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!file" class="nb-alert info mt-16">
      <strong>适用场景:</strong>
      <ul>
        <li>分析大文件结构（每块头部字节）</li>
        <li>流式计算哈希值（不占内存）</li>
        <li>切分大文件为多个分片（便于传输）</li>
        <li>识别未知大文件的真实格式</li>
      </ul>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.range-input { width: 100%; }
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
.report-summary { display: flex; gap: 8px; }
.chunk-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--paper-bg);
}
.chunk-table th, .chunk-table td {
  border: 2px solid var(--ink);
  padding: 4px 8px;
  text-align: left;
}
.chunk-table th { background: var(--ink); color: var(--neon); }
.chunk-table code { background: var(--ink); color: var(--neon); padding: 1px 4px; font-size: 10px; }
.hash-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
}
.hash-block code {
  flex: 1;
  background: var(--ink);
  color: var(--neon);
  padding: 6px 10px;
  word-break: break-all;
}
.info-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
}
.info-row code { background: var(--ink); color: var(--neon); padding: 2px 8px; word-break: break-all; }
.info-row code.hex { font-size: 11px; }
ul { margin: 6px 0 0 20px; }
</style>

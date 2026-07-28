<script setup>
/**
 * 文件哈希计算 - MD5/SHA1/SHA256/SHA512
 * MD5 用 hash-wasm, SHA 用 Web Crypto API
 * 流式处理大文件, 支持进度
 */
import { ref } from 'vue'
import { md5, sha1, sha256, sha512, crc32, adler32 } from 'hash-wasm'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { streamFile } from '../../utils/fileReader.js'

const files = ref([])
const algorithms = ref({ md5: true, sha1: false, sha256: true, sha512: false, crc32: false })
const results = ref([])
const processing = ref(false)
const progress = ref({ current: 0, total: 0, name: '' })
const error = ref('')

const ALGOS = [
  { id: 'md5', label: 'MD5', bits: 128, engine: 'hash-wasm' },
  { id: 'sha1', label: 'SHA-1', bits: 160, engine: 'Web Crypto' },
  { id: 'sha256', label: 'SHA-256', bits: 256, engine: 'Web Crypto' },
  { id: 'sha512', label: 'SHA-512', bits: 512, engine: 'Web Crypto' },
  { id: 'crc32', label: 'CRC32', bits: 32, engine: 'hash-wasm' }
]

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
  }
  files.value = [...files.value, ...arr]
}

function removeFile(idx) { files.value.splice(idx, 1) }

// 流式 hash-wasm
async function streamingHashWasm(file, algoFn, algoName) {
  const hasher = await algoFn.create()
  const chunkSize = 4 * 1024 * 1024 // 4MB
  let offset = 0
  for await (const chunk of streamFile(file, chunkSize)) {
    hasher.update(chunk)
    offset += chunk.length
    progress.value = { current: offset, total: file.size, name: `${file.name} (${algoName})` }
    if (offset % (chunkSize * 4) === 0) await new Promise(r => setTimeout(r, 0))
  }
  return hasher.digest()
}

// Web Crypto 流式 - 需要把所有 chunks 收集再算 (SubtleCrypto 不支持流式)
// 改用整体读取 + 分块进度展示
async function hashWebCrypto(file, algo) {
  const algoMap = { sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' }
  // 读取整个文件，但带进度
  const buf = await readWithProgress(file)
  const digest = await crypto.subtle.digest(algoMap[algo], buf)
  return bufferToHex(digest)
}

function readWithProgress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      progress.value = { current: e.loaded, total: e.total, name: file.name }
    }
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

function bufferToHex(buf) {
  const bytes = new Uint8Array(buf)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function process() {
  if (!files.value.length) { showError('请先选择文件'); return }
  const enabledAlgos = ALGOS.filter(a => algorithms.value[a.id])
  if (!enabledAlgos.length) { showError('请至少选择一种哈希算法'); return }

  error.value = ''
  results.value = []
  processing.value = true

  await safeRun(async () => {
    const out = []
    for (const file of files.value) {
      const item = {
        name: file.name,
        size: file.size,
        hashes: {}
      }
      for (const algo of enabledAlgos) {
        try {
          let hash
          if (algo.id === 'md5') {
            hash = await streamingHashWasm(file, md5, 'MD5')
          } else if (algo.id === 'crc32') {
            hash = await streamingHashWasm(file, crc32, 'CRC32')
          } else if (algo.id === 'sha1') {
            hash = await streamingHashWasm(file, sha1, 'SHA-1')
          } else if (algo.id === 'sha256') {
            hash = await streamingHashWasm(file, sha256, 'SHA-256')
          } else if (algo.id === 'sha512') {
            hash = await streamingHashWasm(file, sha512, 'SHA-512')
          }
          item.hashes[algo.id] = { value: hash, error: null }
        } catch (e) {
          item.hashes[algo.id] = { value: null, error: e?.message || '计算失败' }
        }
      }
      out.push(item)
    }
    results.value = out
  }, '哈希计算失败')
  processing.value = false
  progress.value = { current: 0, total: 0, name: '' }
}

function copy(text) {
  navigator.clipboard?.writeText(text).then(() => showError('已复制到剪贴板'))
}

function exportResults() {
  if (!results.value.length) { showError('暂无结果'); return }
  const lines = []
  for (const r of results.value) {
    lines.push(`# ${r.name} (${formatBytes(r.size)})`)
    for (const [algo, h] of Object.entries(r.hashes)) {
      if (h.value) lines.push(`${algo.toUpperCase()}: ${h.value}`)
    }
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hashes-${Date.now()}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
</script>

<template>
  <ToolLayout title="文件哈希计算" desc="计算 MD5/SHA1/SHA256/SHA512 哈希值，流式处理大文件" icon="#">
    <FileDrop accept="*" :multiple="true" hint="支持任意文件，大文件流式处理"
              @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div v-if="files.length" class="mt-16 nb-card">
      <label class="nb-label">哈希算法</label>
      <div class="algo-grid">
        <label v-for="a in ALGOS" :key="a.id" class="algo-item">
          <input type="checkbox" v-model="algorithms[a.id]">
          <span class="algo-name">{{ a.label }}</span>
          <small>{{ a.bits }} bit · {{ a.engine }}</small>
        </label>
      </div>
      <button class="nb-btn primary lg block mt-16" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 计算中...</span>
        <span v-else>⚡ 计算哈希</span>
      </button>
    </div>

    <div v-if="processing && progress.total" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: (progress.current / progress.total * 100) + '%' }"></div>
      </div>
      <div class="progress-text">{{ progress.name }}: {{ formatBytes(progress.current) }} / {{ formatBytes(progress.total) }}</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="results.length" class="mt-16 nb-card">
      <div class="result-head">
        <span class="nb-h3">哈希结果</span>
        <button class="nb-btn sm neon" @click="exportResults">导出 TXT</button>
      </div>
      <div v-for="(r, idx) in results" :key="idx" class="result-item mt-16">
        <div class="result-name">
          <strong>{{ r.name }}</strong>
          <span class="nb-tag cyan">{{ formatBytes(r.size) }}</span>
        </div>
        <div v-for="(h, algo) in r.hashes" :key="algo" class="hash-row">
          <span class="nb-tag neon">{{ algo.toUpperCase() }}</span>
          <code class="hash-value" v-if="h.value">{{ h.value }}</code>
          <span v-else class="err">✕ {{ h.error }}</span>
          <button v-if="h.value" class="nb-btn sm" @click="copy(h.value)">复制</button>
        </div>
      </div>
    </div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>使用说明：</strong> 支持任意文件类型，可批量处理。MD5/CRC32/SHA 系列均使用流式算法，可处理 GB 级大文件。
    </div>
  </ToolLayout>
</template>

<style scoped>
.algo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.algo-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 13px;
}
.algo-item input { margin-bottom: 4px; }
.algo-name { font-weight: 700; }
.algo-item small { color: var(--ink-soft); font-size: 10px; }
.result-head { display: flex; justify-content: space-between; align-items: center; }
.result-item { padding: 12px; background: var(--paper-bg); border: 2px solid var(--ink); }
.result-name { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.hash-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px dashed var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}
.hash-value {
  flex: 1;
  background: var(--ink);
  color: var(--neon);
  padding: 4px 8px;
  word-break: break-all;
  overflow-x: auto;
}
.err { color: var(--danger); }
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
</style>

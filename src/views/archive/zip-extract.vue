<script setup>
/**
 * ZIP解压 - 上传.zip，列出所有文件，选择全部或部分解压
 * 输出ZIP包(包含所选文件)或单独下载
 */
import { ref, computed } from 'vue'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const zipFile = ref(null)
const entries = ref([])        // [{ name, dir, size, date, selected }]
const result = ref([])
const processing = ref(false)
const error = ref('')
const password = ref('')
const needPassword = ref(false)
const loaded = ref(false)
const progress = ref(0)
const progressMsg = ref('')

const selectedEntries = computed(() => entries.value.filter(e => !e.dir && e.selected))

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  zipFile.value = f
  entries.value = []
  result.value = []
  loaded.value = false
  needPassword.value = false
  password.value = ''
  await loadZip()
}

async function loadZip() {
  if (!zipFile.value) return
  error.value = ''
  processing.value = true
  progress.value = 0
  progressMsg.value = '正在读取压缩包...'

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const zip = await JSZip.loadAsync(buf, { password: password.value || undefined }).catch(e => {
      if (/password|encrypt|decrypt/i.test(e.message)) {
        needPassword.value = true
        throw new Error('此ZIP需要密码，请输入密码后重试')
      }
      throw e
    })

    const list = []
    zip.forEach((relativePath, entry) => {
      list.push({
        name: relativePath,
        dir: entry.dir,
        size: entry._data ? (entry._data.uncompressedSize || 0) : 0,
        date: entry.date,
        selected: !entry.dir
      })
    })
    entries.value = list
    loaded.value = true
  }, '读取ZIP失败')

  processing.value = false
  progressMsg.value = ''
}

async function retryWithPassword() {
  if (!password.value) {
    showError('请输入密码')
    return
  }
  await loadZip()
}

function selectAll() {
  entries.value.forEach(e => { if (!e.dir) e.selected = true })
}
function selectNone() {
  entries.value.forEach(e => { e.selected = false })
}
function invertSelect() {
  entries.value.forEach(e => { if (!e.dir) e.selected = !e.selected })
}

async function downloadOne(entry) {
  if (entry.dir) return
  processing.value = true
  progressMsg.value = `解压: ${entry.name}`
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const zip = await JSZip.loadAsync(buf, { password: password.value || undefined })
    const file = zip.file(entry.name)
    if (!file) throw new Error('文件不存在')
    const blob = await file.async('blob')
    if (blob.size === 0) console.warn('文件为空:', entry.name)
    downloadBlob(blob, entry.name.split('/').pop())
  }, '解压失败')
  processing.value = false
  progressMsg.value = ''
}

async function downloadSelectedAsZip() {
  if (!selectedEntries.value.length) {
    showError('请至少选择一个文件')
    return
  }
  processing.value = true
  progress.value = 0
  progressMsg.value = '准备打包...'

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const zip = await JSZip.loadAsync(buf, { password: password.value || undefined })

    const outZip = new JSZip()
    let done = 0
    for (const entry of selectedEntries.value) {
      const file = zip.file(entry.name)
      if (file) {
        const blob = await file.async('blob')
        outZip.file(entry.name, blob)
      }
      done++
      progress.value = Math.round((done / selectedEntries.value.length) * 90)
      progressMsg.value = `解压 ${done}/${selectedEntries.value.length}`
    }
    progressMsg.value = '生成新ZIP...'
    const blob = await outZip.generateAsync({
      type: 'blob',
      compression: 'STORE'
    }, (meta) => {
      progress.value = 90 + Math.round(meta.percent * 0.1)
    })
    if (!blob || blob.size === 0) throw new Error('生成ZIP为空')
    const outName = `${getBaseName(zipFile.value.name)}-extracted.zip`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]
    progress.value = 100
    progressMsg.value = '完成'
  }, '打包失败')

  processing.value = false
}

function resetAll() {
  zipFile.value = null
  entries.value = []
  result.value = []
  loaded.value = false
  needPassword.value = false
  password.value = ''
}
</script>

<template>
  <ToolLayout title="ZIP解压" desc="上传ZIP，选择全部或部分文件解压下载" icon="-z">
    <FileDrop accept=".zip,application/zip,application/x-zip-compressed"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="支持 .zip 文件，可加密" icon="🗜" />

    <div v-if="zipFile" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ zipFile.name }}</strong>
          <span class="file-meta"> · {{ formatBytes(zipFile.size) }}</span>
        </div>
        <button class="nb-btn sm" @click="resetAll">更换文件</button>
      </div>
    </div>

    <div v-if="needPassword" class="nb-card mt-16">
      <h3 class="nb-h3">🔒 加密ZIP</h3>
      <p class="hint">此压缩包已加密，请输入密码</p>
      <div class="password-input mt-16">
        <input v-model="password" type="password" class="nb-input" placeholder="输入ZIP密码"
               @keyup.enter="retryWithPassword" />
        <button class="nb-btn primary" @click="retryWithPassword">解锁</button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="loaded" class="nb-card mt-16">
      <div class="toolbar">
        <h3 class="nb-h3">📦 文件清单 ({{ entries.filter(e => !e.dir).length }} 项)</h3>
        <div class="toolbar-actions">
          <button class="nb-btn sm" @click="selectAll">全选</button>
          <button class="nb-btn sm" @click="selectNone">全不选</button>
          <button class="nb-btn sm" @click="invertSelect">反选</button>
        </div>
      </div>

      <div class="entries-list mt-16">
        <div v-for="(e, i) in entries" :key="i" class="entry-item" :class="{ dir: e.dir }">
          <label v-if="!e.dir" class="entry-check">
            <input type="checkbox" v-model="e.selected" />
          </label>
          <span v-else class="entry-icon">📁</span>
          <span class="entry-name" :title="e.name">
            <span v-if="e.dir">📁</span> {{ e.name }}
          </span>
          <span class="entry-size">{{ e.dir ? '-' : formatBytes(e.size) }}</span>
          <span class="entry-date">{{ e.date ? new Date(e.date).toLocaleString() : '-' }}</span>
          <button v-if="!e.dir" class="nb-btn sm" @click="downloadOne(e)" :disabled="processing">
            下载
          </button>
        </div>
      </div>

      <div class="actions mt-16">
        <button class="nb-btn primary lg" @click="downloadSelectedAsZip"
                :disabled="processing || !selectedEntries.length">
          <span v-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
          <span v-else>⬇ 打包下载选中 ({{ selectedEntries.length }} 项)</span>
        </button>
      </div>

      <div v-if="processing" class="mt-16">
        <div class="nb-progress">
          <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="progress-label">{{ progress }}% - {{ progressMsg }}</div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.hint { color: var(--ink-soft); font-size: 13px; }
.password-input { display: flex; gap: 8px; align-items: center; }
.password-input .nb-input { flex: 1; }
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.entries-list {
  max-height: 480px;
  overflow-y: auto;
  border: 2px solid var(--ink);
  background: var(--paper-bg);
}
.entry-item {
  display: grid;
  grid-template-columns: 28px 1fr 90px 150px 70px;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px dashed var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}
.entry-item:last-child { border-bottom: none; }
.entry-item.dir { background: var(--paper-darker); }
.entry-item:hover { background: var(--neon); }
.entry-check input { cursor: pointer; }
.entry-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-size { color: var(--ink-soft); text-align: right; }
.entry-date { color: var(--ink-muted); font-size: 11px; }
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
@media (max-width: 768px) {
  .entry-item {
    grid-template-columns: 28px 1fr 70px;
    font-size: 11px;
  }
  .entry-date, .entry-item button { display: none; }
}
</style>

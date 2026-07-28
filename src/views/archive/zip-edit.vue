<script setup>
/**
 * 压缩包内编辑 - 列出文件，可删除/重命名
 * 文本文件可直接编辑后保存回ZIP，输出新的ZIP
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
const entries = ref([])        // [{ name, dir, size, date, originalName }]
const loaded = ref(false)
const processing = ref(false)
const error = ref('')
const password = ref('')
const needPassword = ref(false)
const result = ref([])

const editing = ref(null)      // { name, content, original }
const editBuffer = ref('')
const dirty = ref(false)

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  zipFile.value = f
  entries.value = []
  loaded.value = false
  needPassword.value = false
  password.value = ''
  result.value = []
  editing.value = null
  await loadZip()
}

async function loadZip() {
  if (!zipFile.value) return
  error.value = ''
  processing.value = true

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
        originalName: relativePath,
        dir: entry.dir,
        size: entry._data ? (entry._data.uncompressedSize || 0) : 0,
        date: entry.date
      })
    })
    entries.value = list
    loaded.value = true
  }, '读取ZIP失败')

  processing.value = false
}

async function retryWithPassword() {
  if (!password.value) { showError('请输入密码'); return }
  await loadZip()
}

function isTextFile(name) {
  return /\.(txt|md|markdown|log|csv|json|yaml|yml|xml|html|htm|css|js|ts|vue|jsx|tsx|ini|conf|cfg|toml|sql|bat|sh|py|java|c|cpp|h|hpp|cs|go|rs|rb|php|swift|kt|scala|pl|lua|asm|s|gitignore|env|properties|srt|vtt)$/i.test(name)
}

async function openEditor(entry) {
  if (entry.dir) return
  if (!isTextFile(entry.name)) {
    showError('此文件类型不支持在线编辑（仅支持文本文件）')
    return
  }
  processing.value = true
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const zip = await JSZip.loadAsync(buf, { password: password.value || undefined })
    const file = zip.file(entry.originalName)
    if (!file) throw new Error('文件不存在')
    const text = await file.async('string')
    editing.value = { name: entry.name, originalName: entry.originalName }
    editBuffer.value = text
    dirty.value = false
  }, '打开编辑器失败')
  processing.value = false
}

function onContentInput() {
  dirty.value = true
}

function saveEdit() {
  if (!editing.value) return
  const entry = entries.value.find(e => e.originalName === editing.value.originalName)
  if (entry) {
    entry.size = new Blob([editBuffer.value]).size
    entry._edited = true
    entry._newContent = editBuffer.value
  }
  editing.value = null
  editBuffer.value = ''
  dirty.value = false
}

function cancelEdit() {
  if (dirty.value && !confirm('有未保存的更改，确认放弃？')) return
  editing.value = null
  editBuffer.value = ''
  dirty.value = false
}

function deleteEntry(idx) {
  const e = entries.value[idx]
  if (!e.dir && !confirm(`确认删除文件 "${e.name}"？`)) return
  entries.value.splice(idx, 1)
}

function renameEntry(idx) {
  const e = entries.value[idx]
  const newName = prompt('输入新名称（可含相对路径）:', e.name)
  if (!newName || newName === e.name) return
  if (entries.value.some(x => x.name === newName)) {
    showError('名称已存在')
    return
  }
  e.name = newName
}

async function buildZip() {
  processing.value = true
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const srcZip = await JSZip.loadAsync(buf, { password: password.value || undefined })

    const outZip = new JSZip()
    for (const e of entries.value) {
      if (e.dir) {
        outZip.folder(e.name)
      } else if (e._edited && e._newContent !== undefined) {
        outZip.file(e.name, e._newContent)
      } else {
        // 从原ZIP读取二进制
        const file = srcZip.file(e.originalName)
        if (file) {
          const blob = await file.async('blob')
          outZip.file(e.name, blob)
        }
      }
    }
    const blob = await outZip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    if (!blob || blob.size === 0) throw new Error('生成ZIP为空')
    const outName = `${getBaseName(zipFile.value.name)}-edited.zip`
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '生成ZIP失败')
  processing.value = false
}

function resetAll() {
  zipFile.value = null
  entries.value = []
  loaded.value = false
  needPassword.value = false
  password.value = ''
  result.value = []
  editing.value = null
  editBuffer.value = ''
}

const dirtyCount = computed(() =>
  entries.value.filter(e => e._edited || e.name !== e.originalName).length
)
</script>

<template>
  <ToolLayout title="压缩包内编辑" desc="在线编辑ZIP内容：删除、重命名、修改文本文件" icon="✎">
    <FileDrop accept=".zip,application/zip,application/x-zip-compressed"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="支持 .zip 文件" icon="✎" />

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
      <div class="password-input mt-16">
        <input v-model="password" type="password" class="nb-input" placeholder="输入ZIP密码"
               @keyup.enter="retryWithPassword" />
        <button class="nb-btn primary" @click="retryWithPassword">解锁</button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="loaded" class="nb-card mt-16">
      <div class="toolbar">
        <h3 class="nb-h3">📝 文件列表 ({{ entries.length }})</h3>
        <span v-if="dirtyCount" class="nb-tag accent">{{ dirtyCount }} 处修改</span>
      </div>

      <div class="entries-list mt-16">
        <div v-for="(e, i) in entries" :key="i" class="entry-item" :class="{ dir: e.dir, modified: e._edited || e.name !== e.originalName }">
          <span class="entry-name" :title="e.name">
            <span v-if="e.dir">📁</span>
            <span v-else>📄</span>
            {{ e.name }}
            <span v-if="e.name !== e.originalName" class="renamed">← {{ e.originalName }}</span>
            <span v-if="e._edited" class="nb-tag neon">已修改</span>
          </span>
          <span class="entry-size">{{ e.dir ? '-' : formatBytes(e.size) }}</span>
          <span class="entry-actions">
            <button v-if="!e.dir && isTextFile(e.name)" class="nb-btn sm" @click="openEditor(e)" :disabled="processing">
              ✎ 编辑
            </button>
            <button v-if="!e.dir" class="nb-btn sm" @click="renameEntry(i)">✎ 重命名</button>
            <button class="nb-btn sm danger" @click="deleteEntry(i)">×</button>
          </span>
        </div>
      </div>

      <div class="actions mt-16">
        <button class="nb-btn primary lg" @click="buildZip" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 生成中...</span>
          <span v-else>⬇ 生成新ZIP</span>
        </button>
      </div>
    </div>

    <div v-if="editing" class="nb-card mt-16 editor-card">
      <div class="between">
        <h3 class="nb-h3">✎ 编辑: {{ editing.name }}</h3>
        <div class="editor-actions">
          <button class="nb-btn sm" @click="cancelEdit">取消</button>
          <button class="nb-btn sm primary" @click="saveEdit" :disabled="!dirty">保存</button>
        </div>
      </div>
      <textarea v-model="editBuffer" class="nb-textarea editor-textarea mt-16"
                @input="onContentInput" :placeholder="'编辑 ' + editing.name + ' 的内容...'"
                spellcheck="false"></textarea>
      <div class="editor-meta mt-16">
        <span class="nb-tag">{{ editBuffer.length }} 字符</span>
        <span class="nb-tag cyan">{{ editBuffer.split('\n').length }} 行</span>
        <span v-if="dirty" class="nb-tag accent">未保存</span>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.password-input { display: flex; gap: 8px; align-items: center; }
.password-input .nb-input { flex: 1; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.entries-list {
  border: 2px solid var(--ink);
  background: var(--paper-bg);
  max-height: 480px;
  overflow-y: auto;
}
.entry-item {
  display: grid;
  grid-template-columns: 1fr 100px auto;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px dashed var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 12px;
}
.entry-item.modified { background: var(--accent-soft); }
.entry-item:hover { background: var(--neon); }
.entry-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 6px;
}
.renamed { color: var(--ink-muted); font-size: 11px; }
.entry-size { color: var(--ink-soft); text-align: right; }
.entry-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.editor-card { border-color: var(--accent); }
.editor-actions { display: flex; gap: 6px; }
.editor-textarea {
  min-height: 320px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
}
.editor-meta { display: flex; gap: 6px; flex-wrap: wrap; }
@media (max-width: 768px) {
  .entry-item {
    grid-template-columns: 1fr;
    font-size: 11px;
  }
  .entry-size, .entry-actions { font-size: 11px; }
}
</style>

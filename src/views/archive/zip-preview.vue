<script setup>
/**
 * 压缩包预览 - 不解压直接列出文件清单
 * 显示文件名、大小、修改时间，文本文件可预览内容
 */
import { ref, computed } from 'vue'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import { downloadBlob } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const zipFile = ref(null)
const entries = ref([])
const loaded = ref(false)
const processing = ref(false)
const error = ref('')
const password = ref('')
const needPassword = ref(false)

const previewing = ref(null)  // { name, content, isText, isBinary, size }
const previewLoading = ref(false)

const totalSize = computed(() =>
  entries.value.filter(e => !e.dir).reduce((s, e) => s + (e.size || 0), 0)
)
const fileCount = computed(() => entries.value.filter(e => !e.dir).length)

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  zipFile.value = f
  entries.value = []
  loaded.value = false
  needPassword.value = false
  password.value = ''
  previewing.value = null
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
        dir: entry.dir,
        size: entry._data ? (entry._data.uncompressedSize || 0) : 0,
        date: entry.date,
        compressedSize: entry._data ? (entry._data.compressedSize || 0) : 0
      })
    })
    entries.value = list
    loaded.value = true
  }, '读取ZIP失败')

  processing.value = false
}

async function retryWithPassword() {
  if (!password.value) {
    showError('请输入密码')
    return
  }
  await loadZip()
}

function isTextFile(name) {
  return /\.(txt|md|markdown|log|csv|json|yaml|yml|xml|html|htm|css|js|ts|vue|jsx|tsx|ini|conf|cfg|toml|sql|bat|sh|py|java|c|cpp|h|hpp|cs|go|rs|rb|php|swift|kt|scala|pl|lua|asm|s|gitignore|env|properties|svg|srt|vtt)$/i.test(name)
}

function isImageFile(name) {
  return /\.(png|jpg|jpeg|gif|webp|bmp|ico)$/i.test(name)
}

async function previewEntry(entry) {
  if (entry.dir) return
  previewLoading.value = true
  previewing.value = null

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const zip = await JSZip.loadAsync(buf, { password: password.value || undefined })
    const file = zip.file(entry.name)
    if (!file) throw new Error('文件不存在')

    if (isImageFile(entry.name)) {
      const blob = await file.async('blob')
      const url = URL.createObjectURL(blob)
      previewing.value = {
        name: entry.name,
        size: entry.size,
        isImage: true,
        imageUrl: url
      }
    } else if (isTextFile(entry.name) || entry.size < 256 * 1024) {
      // 尝试文本预览
      try {
        const text = await file.async('string')
        previewing.value = {
          name: entry.name,
          size: entry.size,
          isText: true,
          content: text.length > 200000 ? text.slice(0, 200000) + '\n\n... (内容过长已截断)' : text,
          truncated: text.length > 200000
        }
      } catch (e) {
        // 二进制
        previewing.value = {
          name: entry.name,
          size: entry.size,
          isBinary: true
        }
      }
    } else {
      previewing.value = {
        name: entry.name,
        size: entry.size,
        isBinary: true,
        message: '二进制文件，无法预览，可下载查看'
      }
    }
  }, '预览失败')

  previewLoading.value = false
}

async function downloadEntry(entry) {
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(zipFile.value)
    const zip = await JSZip.loadAsync(buf, { password: password.value || undefined })
    const file = zip.file(entry.name)
    if (!file) throw new Error('文件不存在')
    const blob = await file.async('blob')
    downloadBlob(blob, entry.name.split('/').pop())
  }, '下载失败')
}

function closePreview() {
  if (previewing.value?.imageUrl) URL.revokeObjectURL(previewing.value.imageUrl)
  previewing.value = null
}

function resetAll() {
  closePreview()
  zipFile.value = null
  entries.value = []
  loaded.value = false
  needPassword.value = false
  password.value = ''
}
</script>

<template>
  <ToolLayout title="压缩包预览" desc="不解压查看ZIP内容清单，支持文本预览" icon="👁">
    <FileDrop accept=".zip,application/zip,application/x-zip-compressed"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="支持 .zip 文件" icon="👁" />

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
      <div class="summary">
        <span class="nb-tag">📦 文件: {{ fileCount }}</span>
        <span class="nb-tag cyan">💾 解压后大小: {{ formatBytes(totalSize) }}</span>
      </div>

      <div class="entries-table mt-16">
        <div class="entry-header">
          <span>文件名</span>
          <span>大小</span>
          <span>压缩后</span>
          <span>修改时间</span>
          <span>操作</span>
        </div>
        <div v-for="(e, i) in entries" :key="i" class="entry-row" :class="{ dir: e.dir }">
          <span class="entry-name" :title="e.name">
            <span v-if="e.dir">📁</span>
            <span v-else-if="isTextFile(e.name)">📝</span>
            <span v-else-if="isImageFile(e.name)">🖼</span>
            <span v-else>📄</span>
            {{ e.name }}
          </span>
          <span class="entry-size">{{ e.dir ? '-' : formatBytes(e.size) }}</span>
          <span class="entry-size">{{ e.dir ? '-' : formatBytes(e.compressedSize) }}</span>
          <span class="entry-date">{{ e.date ? new Date(e.date).toLocaleString() : '-' }}</span>
          <span class="entry-actions">
            <button v-if="!e.dir" class="nb-btn sm" @click="previewEntry(e)" :disabled="previewLoading">
              预览
            </button>
            <button v-if="!e.dir" class="nb-btn sm" @click="downloadEntry(e)">下载</button>
          </span>
        </div>
      </div>
    </div>

    <div v-if="previewLoading" class="nb-card mt-16">
      <span class="nb-spinner"></span> 正在加载预览...
    </div>

    <div v-if="previewing" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">📄 {{ previewing.name }}</h3>
        <button class="nb-btn sm" @click="closePreview">关闭</button>
      </div>
      <div class="preview-meta mt-16">
        <span class="nb-tag">{{ formatBytes(previewing.size) }}</span>
        <span v-if="previewing.isText" class="nb-tag cyan">文本</span>
        <span v-else-if="previewing.isImage" class="nb-tag neon">图片</span>
        <span v-else class="nb-tag accent">二进制</span>
      </div>

      <div v-if="previewing.isText" class="text-content mt-16">
        <pre>{{ previewing.content }}</pre>
      </div>
      <div v-else-if="previewing.isImage" class="image-content mt-16">
        <img :src="previewing.imageUrl" :alt="previewing.name" />
      </div>
      <div v-else class="nb-alert info mt-16">
        {{ previewing.message || '二进制文件，无法预览' }}
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.password-input { display: flex; gap: 8px; align-items: center; }
.password-input .nb-input { flex: 1; }
.summary { display: flex; gap: 8px; flex-wrap: wrap; }
.entries-table {
  border: 2px solid var(--ink);
  background: var(--paper-bg);
  max-height: 520px;
  overflow-y: auto;
}
.entry-header, .entry-row {
  display: grid;
  grid-template-columns: 1fr 90px 90px 150px 130px;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px dashed var(--ink-soft);
  font-family: var(--font-mono);
  font-size: 12px;
  align-items: center;
}
.entry-header {
  background: var(--ink);
  color: var(--neon);
  font-weight: 700;
  position: sticky;
  top: 0;
  z-index: 1;
}
.entry-row.dir { background: var(--paper-darker); }
.entry-row:hover { background: var(--neon); }
.entry-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-size { color: var(--ink-soft); text-align: right; }
.entry-date { color: var(--ink-muted); font-size: 11px; }
.entry-actions { display: flex; gap: 4px; }
.preview-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.text-content {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  border: 3px solid var(--ink);
  max-height: 480px;
  overflow: auto;
}
.text-content pre {
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
.image-content {
  text-align: center;
  background: var(--paper-bg);
  padding: 16px;
  border: 2px solid var(--ink);
}
.image-content img {
  max-width: 100%;
  max-height: 600px;
  margin: 0 auto;
  border: 3px solid var(--ink);
}
@media (max-width: 768px) {
  .entry-header, .entry-row {
    grid-template-columns: 1fr 80px 80px;
    font-size: 11px;
  }
  .entry-date, .entry-actions { display: none; }
}
</style>

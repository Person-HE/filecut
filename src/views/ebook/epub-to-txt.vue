<script setup>
/**
 * EPUB转TXT - 提取所有文本
 * 用 epub.js (CDN 动态加载)
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')
const preview = ref('')
const stats = ref(null)

const includeChapterMarkers = ref(true)
const includeBlankLines = ref(true)

async function loadEpubJs() {
  if (window.ePub) return window.ePub
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('epub.js 加载失败'))
    document.head.appendChild(s)
  })
  return window.ePub
}

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  preview.value = ''
  stats.value = null
  error.value = ''
}

async function process() {
  if (!file.value) { showError('请先选择EPUB'); return }
  error.value = ''
  result.value = []
  preview.value = ''
  processing.value = true
  progress.value = 0
  progressMsg.value = '加载 epub.js...'

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    await loadEpubJs()
    const epubjs = window.ePub

    progressMsg.value = '打开 EPUB...'
    const buf = await readFileAsArrayBuffer(file.value)
    const book = epubjs(buf)

    const spine = await book.loaded.spine
    const items = spine.items.slice()
    const total = items.length

    let allText = ''
    let chapterCount = 0
    let charCount = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      progressMsg.value = `提取章节 ${i + 1}/${total}`
      progress.value = Math.round(i / total * 90)

      const doc = await item.load(book.load.bind(book))
      const text = extractTextFromChapter(doc)
      if (text.trim()) {
        chapterCount++
        if (includeChapterMarkers.value) {
          allText += `\n\n========== 第 ${chapterCount} 章 ==========\n\n`
        }
        allText += text
        if (includeBlankLines.value) allText += '\n\n'
        charCount += text.length
      }
    }

    // 清理多余空行
    allText = allText.replace(/\n{4,}/g, '\n\n\n').trim() + '\n'

    progressMsg.value = '生成文件...'
    progress.value = 95

    if (!allText.trim()) throw new Error('未提取到任何文本')

    const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' })
    if (blob.size === 0) throw new Error('输出为空')

    const outName = replaceExt(file.value.name, '.txt')
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]

    preview.value = allText.length > 5000 ? allText.slice(0, 5000) + '\n\n...(预览截断)' : allText
    stats.value = {
      chapters: chapterCount,
      chars: allText.length,
      bytes: blob.size
    }

    progress.value = 100
    progressMsg.value = '完成'

    try { book.destroy() } catch (e) {}
  }, 'EPUB转TXT失败')

  processing.value = false
}

function extractTextFromChapter(doc) {
  if (!doc) return ''
  const body = doc.body || doc.documentElement
  if (!body) return ''
  const walk = (node) => {
    let text = ''
    node.childNodes.forEach(child => {
      if (child.nodeType === 3) { // Text
        text += child.textContent
      } else if (child.nodeType === 1) { // Element
        const tag = child.tagName.toLowerCase()
        if (['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr'].includes(tag)) {
          text += '\n' + walk(child) + '\n'
        } else if (tag === 'img' || tag === 'svg') {
          // 跳过图片
        } else {
          text += walk(child)
        }
      }
    })
    return text
  }
  let text = walk(body)
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}
</script>

<template>
  <ToolLayout title="EPUB转TXT" desc="提取EPUB电子书的所有文本" icon="T">
    <FileDrop accept=".epub,application/epub+zip"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传 .epub 文件" icon="T" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ file.name }}</strong>
          <span class="file-meta"> · {{ formatBytes(file.size) }}</span>
        </div>
      </div>
    </div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">提取选项</h3>
      <div class="options mt-16">
        <label class="nb-label">
          <input type="checkbox" v-model="includeChapterMarkers" /> 添加章节标记
        </label>
        <label class="nb-label">
          <input type="checkbox" v-model="includeBlankLines" /> 章节间空行
        </label>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressMsg }}</span>
        <span v-else>T 提取文本</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-label">{{ progress }}% - {{ progressMsg }}</div>
    </div>

    <div v-if="stats" class="nb-card mt-16">
      <h3 class="nb-h3">📊 统计</h3>
      <div class="stats-grid mt-16">
        <span class="nb-tag accent">章节: {{ stats.chapters }}</span>
        <span class="nb-tag cyan">字符: {{ stats.chars.toLocaleString() }}</span>
        <span class="nb-tag">大小: {{ formatBytes(stats.bytes) }}</span>
      </div>
    </div>

    <div v-if="preview" class="nb-card mt-16">
      <h3 class="nb-h3">📋 预览</h3>
      <pre class="preview-box mt-16">{{ preview }}</pre>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.options {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 8px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
}
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
.stats-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.preview-box {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  border: 3px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

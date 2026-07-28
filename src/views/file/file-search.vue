<script setup>
/**
 * 文件内容搜索 - 上传多文件, 输入关键词
 * 全文搜索, 高亮匹配, 用 Web Worker 加速
 */
import { ref, computed, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { getExt } from '../../utils/download.js'

const files = ref([])
const keyword = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const regexMode = ref(false)
const maxResultsPerFile = ref(50)
const processing = ref(false)
const progress = ref({ current: 0, total: 0, name: '' })
const results = ref([])
const error = ref('')

const TEXT_EXTS = ['txt','csv','json','xml','html','htm','md','yaml','yml','js','ts','ts','jsx','tsx','css','scss','less','vue','py','java','c','cpp','h','hpp','go','rs','rb','php','sql','log','ini','conf','cfg','sh','bat','ps1','svg','srt','vtt','tex','rtf']

function isTextFile(name) {
  const ext = getExt(name)
  return TEXT_EXTS.includes(ext)
}

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
  }
  files.value = [...files.value, ...arr]
}

function removeFile(idx) { files.value.splice(idx, 1) }

// === Web Worker 内联实现 ===
const workerCode = `
self.onmessage = async function(e) {
  const { files, keyword, caseSensitive, wholeWord, regexMode, maxResultsPerFile } = e.data
  const results = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    self.postMessage({ type: 'progress', current: i + 1, total: files.length, name: f.name })
    try {
      const text = await f.text()
      const lines = text.split(/\\r?\\n/)
      const matches = []
      let pattern
      if (regexMode) {
        try {
          pattern = new RegExp(keyword, caseSensitive ? 'g' : 'gi')
        } catch (e) {
          results.push({ name: f.name, error: '正则表达式无效: ' + e.message })
          continue
        }
      } else {
        let kw = keyword.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')
        if (wholeWord) kw = '\\\\b' + kw + '\\\\b'
        pattern = new RegExp(kw, caseSensitive ? 'g' : 'gi')
      }
      let totalMatches = 0
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum]
        pattern.lastIndex = 0
        const matchesOnLine = [...line.matchAll(pattern)]
        if (matchesOnLine.length > 0) {
          totalMatches += matchesOnLine.length
          if (matches.length < maxResultsPerFile) {
            // 高亮处理
            let highlighted = ''
            let lastIdx = 0
            for (const m of matchesOnLine) {
              highlighted += escapeHtml(line.slice(lastIdx, m.index))
              highlighted += '<<HIGHLIGHT>>' + escapeHtml(m[0]) + '<</HIGHLIGHT>>'
              lastIdx = m.index + m[0].length
            }
            highlighted += escapeHtml(line.slice(lastIdx))
            matches.push({ line: lineNum + 1, content: highlighted, count: matchesOnLine.length })
          }
        }
      }
      results.push({ name: f.name, totalMatches, matches, size: f.size })
    } catch (e) {
      results.push({ name: f.name, error: e.message })
    }
  }
  self.postMessage({ type: 'done', results })
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}
`

let worker = null
let workerUrl = null

function getWorker() {
  if (worker) return worker
  const blob = new Blob([workerCode], { type: 'application/javascript' })
  workerUrl = URL.createObjectURL(blob)
  worker = new Worker(workerUrl)
  return worker
}

function destroyWorker() {
  if (worker) { worker.terminate(); worker = null }
  if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl = null }
}

onUnmounted(destroyWorker)

const totalMatches = computed(() => {
  return results.value.reduce((s, r) => s + (r.totalMatches || 0), 0)
})

async function search() {
  if (!files.value.length) { showError('请先选择文件'); return }
  if (!keyword.value.trim()) { showError('请输入关键词'); return }
  error.value = ''
  results.value = []
  processing.value = true
  progress.value = { current: 0, total: files.value.length, name: '' }

  await safeRun(async () => {
    // 过滤可读文本文件 (其他文件跳过)
    const textFiles = files.value.filter(f => isTextFile(f.name) || f.type.startsWith('text/'))
    if (!textFiles.length) {
      throw new Error('没有可搜索的文本文件。仅支持文本类文件（txt/csv/json/xml/html/md/code 等）')
    }
    if (textFiles.length < files.value.length) {
      error.value = `已跳过 ${files.value.length - textFiles.length} 个非文本文件`
    }

    return new Promise((resolve, reject) => {
      const w = getWorker()
      const timeout = setTimeout(() => {
        destroyWorker()
        reject(new Error('搜索超时'))
      }, 60_000)

      w.onmessage = (e) => {
        const msg = e.data
        if (msg.type === 'progress') {
          progress.value = { current: msg.current, total: msg.total, name: msg.name }
        } else if (msg.type === 'done') {
          clearTimeout(timeout)
          results.value = msg.results
          processing.value = false
          progress.value = { current: 0, total: 0, name: '' }
          resolve()
        }
      }
      w.onerror = (e) => {
        clearTimeout(timeout)
        destroyWorker()
        reject(new Error('Worker 错误: ' + e.message))
      }
      w.postMessage({
        files: textFiles,
        keyword: keyword.value,
        caseSensitive: caseSensitive.value,
        wholeWord: wholeWord.value,
        regexMode: regexMode.value,
        maxResultsPerFile: maxResultsPerFile.value
      })
    })
  }, '搜索失败')
  processing.value = false
}

function renderHighlight(html) {
  return html
    .replace(/&lt;&lt;HIGHLIGHT&gt;&gt;/g, '<mark>')
    .replace(/&lt;&lt;\/HIGHLIGHT&gt;&gt;/g, '</mark>')
}

function clearAll() {
  files.value = []
  results.value = []
  error.value = ''
}
</script>

<template>
  <ToolLayout title="文件内容搜索" desc="全文检索多个文件，高亮匹配关键词，Web Worker 加速" icon="🔍">
    <FileDrop accept="*" :multiple="true" hint="支持文本类文件（txt/csv/json/xml/html/md/代码等）"
              @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div v-if="files.length" class="mt-16 nb-card">
      <div class="nb-grid cols-2">
        <div>
          <label class="nb-label">搜索关键词</label>
          <input v-model="keyword" class="nb-input" placeholder="输入关键词或正则表达式" @keyup.enter="search">
        </div>
        <div>
          <label class="nb-label">每文件最大结果数</label>
          <input type="number" v-model.number="maxResultsPerFile" min="1" max="500" class="nb-input">
        </div>
      </div>
      <div class="options mt-16">
        <label><input type="checkbox" v-model="caseSensitive"> 区分大小写</label>
        <label><input type="checkbox" v-model="wholeWord"> 全词匹配</label>
        <label><input type="checkbox" v-model="regexMode"> 正则表达式</label>
      </div>
      <div class="buttons mt-16">
        <button class="nb-btn primary lg" @click="search" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 搜索中...</span>
          <span v-else>🔍 开始搜索</span>
        </button>
        <button class="nb-btn sm" @click="clearAll">清空</button>
      </div>
    </div>

    <div v-if="processing && progress.total" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: (progress.current / progress.total * 100) + '%' }"></div>
      </div>
      <div class="progress-text">{{ progress.current }} / {{ progress.total }} - {{ progress.name }}</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="results.length" class="mt-16">
      <div class="nb-card summary-card">
        <span class="nb-h3">搜索结果</span>
        <span class="nb-tag neon">{{ totalMatches }} 处匹配</span>
        <span class="nb-tag">{{ results.length }} 个文件</span>
      </div>

      <div v-for="(r, idx) in results" :key="idx" class="nb-card mt-16 result-card">
        <div class="result-head">
          <strong>{{ r.name }}</strong>
          <span v-if="r.totalMatches !== undefined" class="nb-tag accent">{{ r.totalMatches }} 处匹配</span>
          <span class="nb-tag cyan">{{ formatBytes(r.size) }}</span>
        </div>
        <div v-if="r.error" class="nb-alert danger mt-16">{{ r.error }}</div>
        <div v-else-if="r.matches.length === 0" class="nb-alert mt-16">无匹配</div>
        <div v-else class="match-list mt-16">
          <div v-for="(m, mi) in r.matches" :key="mi" class="match-item">
            <span class="line-num">L{{ m.line }}</span>
            <span class="match-content" v-html="renderHighlight(m.content)"></span>
            <span v-if="m.count > 1" class="nb-tag">{{ m.count }}x</span>
          </div>
          <div v-if="r.totalMatches > r.matches.length" class="more-hint">
            ... 还有 {{ r.totalMatches - r.matches.length }} 处未显示，请缩小范围或增加最大结果数
          </div>
        </div>
      </div>
    </div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>使用说明：</strong> 仅支持文本类文件搜索。二进制文件（PDF/Office/图片等）需先用其他工具转换为文本。使用 Web Worker 不阻塞主线程。
    </div>
  </ToolLayout>
</template>

<style scoped>
.options { display: flex; gap: 16px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 13px; }
.options label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.buttons { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
.summary-card {
  display: flex; gap: 12px; align-items: center; padding: 12px 16px;
}
.result-card { padding: 14px; }
.result-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.match-list {
  max-height: 400px;
  overflow-y: auto;
  background: var(--ink);
  border: 2px solid var(--ink);
}
.match-item {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid #333;
  font-family: var(--font-mono);
  font-size: 12px;
  align-items: flex-start;
}
.match-item:last-child { border-bottom: none; }
.line-num {
  color: var(--neon);
  min-width: 60px;
  font-weight: 700;
}
.match-content {
  flex: 1;
  color: var(--paper-card);
  word-break: break-all;
  white-space: pre-wrap;
}
.match-content :deep(mark) {
  background: var(--accent);
  color: var(--paper-card);
  padding: 0 3px;
  font-weight: 700;
}
.more-hint {
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  background: var(--paper-bg);
  text-align: center;
}
</style>

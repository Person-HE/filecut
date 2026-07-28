<script setup>
/**
 * Word文档对比 - 上传两个 .docx，提取文本，做diff对比
 * 可视化显示差异(增/删/改)
 */
import { ref } from 'vue'
import mammoth from 'mammoth'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const fileA = ref(null)
const fileB = ref(null)
const processing = ref(false)
const error = ref('')
const diffResult = ref(null)
const diffStats = ref(null)

function onFileASelect(selected) {
  fileA.value = selected
  diffResult.value = null
  diffStats.value = null
  error.value = ''
}
function onFileBSelect(selected) {
  fileB.value = selected
  diffResult.value = null
  diffStats.value = null
  error.value = ''
}

function removeFileA() { fileA.value = null; diffResult.value = null }
function removeFileB() { fileB.value = null; diffResult.value = null }

// 简单 LCS diff 算法 (按行)
function diffLines(aLines, bLines) {
  const m = aLines.length
  const n = bLines.length
  // 构建 LCS 矩阵
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aLines[i - 1] === bLines[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  // 回溯
  const result = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      result.unshift({ type: 'equal', text: aLines[i - 1], lineA: i, lineB: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', text: bLines[j - 1], lineB: j })
      j--
    } else {
      result.unshift({ type: 'remove', text: aLines[i - 1], lineA: i })
      i--
    }
  }
  return result
}

async function process() {
  if (!fileA.value || !fileB.value) { showError('请选择两个文件进行对比'); return }
  if (fileA.value.size === 0 || fileB.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  diffResult.value = null
  processing.value = true

  await safeRun(async () => {
    const [bufA, bufB] = await Promise.all([
      readFileAsArrayBuffer(fileA.value),
      readFileAsArrayBuffer(fileB.value)
    ])
    const [resA, resB] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: bufA.slice(0) }),
      mammoth.extractRawText({ arrayBuffer: bufB.slice(0) })
    ])
    const textA = resA.value || ''
    const textB = resB.value || ''
    if (!textA.trim() && !textB.trim()) throw new Error('两个文档内容均为空')

    const aLines = textA.split(/\n/)
    const bLines = textB.split(/\n/)

    const diff = diffLines(aLines, bLines)
    diffResult.value = diff

    const added = diff.filter(d => d.type === 'add').length
    const removed = diff.filter(d => d.type === 'remove').length
    const unchanged = diff.filter(d => d.type === 'equal').length
    const total = aLines.length + bLines.length
    const similarity = total === 0 ? 100 : Math.round((unchanged * 2 / total) * 100)
    diffStats.value = { added, removed, unchanged, similarity }
  }, '对比失败')
  processing.value = false
}

function exportDiff() {
  if (!diffResult.value) return
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>文档对比结果</title>
<style>
body { font-family: "Microsoft YaHei", sans-serif; padding: 20px; max-width: 1000px; margin: auto; }
.diff-line { padding: 4px 8px; font-family: monospace; white-space: pre-wrap; word-break: break-all; }
.add { background: #e6ffed; color: #22863a; border-left: 3px solid #28a745; }
.remove { background: #ffeef0; color: #cb2431; border-left: 3px solid #d73a49; text-decoration: line-through; }
.equal { color: #666; }
.line-num { display: inline-block; width: 50px; color: #999; user-select: none; }
h1 { color: #ff5a1f; }
</style></head><body>
<h1>文档对比结果</h1>
<p>原始: ${fileA.value.name} | 修改: ${fileB.value.name}</p>
<p>新增 ${diffStats.value.added} 行 · 删除 ${diffStats.value.removed} 行 · 相似度 ${diffStats.value.similarity}%</p>
<hr>
<div>`
  diffResult.value.forEach(d => {
    const cls = d.type === 'add' ? 'add' : d.type === 'remove' ? 'remove' : 'equal'
    const sign = d.type === 'add' ? '+' : d.type === 'remove' ? '-' : ' '
    const lineNum = d.lineA || d.lineB || ''
    html += `<div class="diff-line ${cls}"><span class="line-num">${lineNum}</span>${sign} ${escapeHtml(d.text)}</div>`
  })
  html += `</div></body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const name = `diff-${getBaseName(fileA.value.name)}-vs-${getBaseName(fileB.value.name)}.html`
  downloadBlob(blob, name)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
</script>

<template>
  <ToolLayout title="Word文档对比" desc="对比两份文档差异，可视化显示增删改" icon="⇄">
    <div class="diff-files">
      <div class="diff-file-col">
        <h3 class="nb-h3 mb-16">原始文档 A</h3>
        <FileDrop accept=".docx" :multiple="false" icon="📘" hint="原始版本"
                  @select="onFileASelect" @error="showError" />
        <div v-if="fileA" class="file-tag mt-8">
          📘 {{ fileA.name }}
          <button class="nb-btn sm" @click="removeFileA">×</button>
        </div>
      </div>
      <div class="diff-arrow">⇄</div>
      <div class="diff-file-col">
        <h3 class="nb-h3 mb-16">修改文档 B</h3>
        <FileDrop accept=".docx" :multiple="false" icon="📘" hint="修改版本"
                  @select="onFileBSelect" @error="showError" />
        <div v-if="fileB" class="file-tag mt-8">
          📘 {{ fileB.name }}
          <button class="nb-btn sm" @click="removeFileB">×</button>
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="fileA && fileB">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 对比中...</span>
        <span v-else>开始对比</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="diffStats" class="mt-16">
      <div class="stats-grid nb-card">
        <div class="stat-item add">
          <div class="stat-value">{{ diffStats.added }}</div>
          <div class="stat-label">新增行</div>
        </div>
        <div class="stat-item remove">
          <div class="stat-value">{{ diffStats.removed }}</div>
          <div class="stat-label">删除行</div>
        </div>
        <div class="stat-item equal">
          <div class="stat-value">{{ diffStats.unchanged }}</div>
          <div class="stat-label">相同行</div>
        </div>
        <div class="stat-item simi">
          <div class="stat-value">{{ diffStats.similarity }}%</div>
          <div class="stat-label">相似度</div>
        </div>
      </div>
      <div class="mt-16">
        <button class="nb-btn" @click="exportDiff">⬇ 导出对比报告 (HTML)</button>
      </div>
    </div>

    <div v-if="diffResult" class="mt-16 nb-card diff-result">
      <h3 class="nb-h3 mb-16">差异详情</h3>
      <div class="diff-list">
        <div v-for="(d, i) in diffResult" :key="i" class="diff-line" :class="d.type">
          <span class="line-sign">{{ d.type === 'add' ? '+' : d.type === 'remove' ? '-' : ' ' }}</span>
          <span class="line-text">{{ d.text || ' ' }}</span>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.diff-files {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 16px;
  align-items: start;
}
.diff-file-col { min-width: 0; }
.diff-arrow {
  font-size: 2rem;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--accent);
  align-self: center;
  padding-top: 80px;
}
.file-tag {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--paper-card);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.stat-item {
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  padding: 16px;
  text-align: center;
}
.stat-item.add { background: #c8e6c9; }
.stat-item.remove { background: #ffcdd2; }
.stat-item.equal { background: var(--paper-card); }
.stat-item.simi { background: var(--neon); }
.stat-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}
.stat-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  text-transform: uppercase;
}
.diff-list {
  max-height: 500px;
  overflow: auto;
  background: var(--ink);
  border: 2px solid var(--ink);
}
.diff-line {
  padding: 4px 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  display: flex;
}
.diff-line.add { background: #1a3a1a; color: #88ff88; }
.diff-line.remove { background: #3a1a1a; color: #ff8888; text-decoration: line-through; }
.diff-line.equal { color: #888; }
.line-sign {
  display: inline-block;
  width: 24px;
  font-weight: 700;
  user-select: none;
}
.line-text { flex: 1; }
@media (max-width: 768px) {
  .diff-files { grid-template-columns: 1fr; }
  .diff-arrow { padding: 0; text-align: center; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>

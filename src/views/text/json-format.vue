<script setup>
/**
 * JSON格式化校验 - 格式化(美化)、压缩、校验
 * 显示错误位置，JSONPath查询
 */
import { ref, computed, watch } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const input = ref('')
const output = ref('')
const error = ref('')
const errorLine = ref(null)
const errorCol = ref(null)
const indent = ref(2)
const mode = ref('beautify') // beautify / minify / validate
const jsonPath = ref('')
const pathResult = ref('')
const stats = ref(null)

const inputStats = computed(() => {
  if (!input.value) return null
  return {
    chars: input.value.length,
    lines: input.value.split('\n').length
  }
})

function findErrorPosition(text, msg) {
  // 尝试从错误信息中提取 position
  const m = msg.match(/position\s+(\d+)/i)
  if (m) {
    const pos = +m[1]
    const before = text.slice(0, pos)
    const lines = before.split('\n')
    return { line: lines.length, col: lines[lines.length - 1].length + 1 }
  }
  const m2 = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  if (m2) return { line: +m2[1], col: +m2[2] }
  return null
}

function process() {
  if (!input.value.trim()) {
    showError('请输入JSON内容')
    return
  }
  error.value = ''
  output.value = ''
  errorLine.value = null
  errorCol.value = null
  stats.value = null
  pathResult.value = ''

  try {
    const parsed = JSON.parse(input.value)
    stats.value = {
      type: Array.isArray(parsed) ? 'Array' : typeof parsed,
      length: Array.isArray(parsed) ? parsed.length : (typeof parsed === 'object' ? Object.keys(parsed).length : 1),
      bytes: new Blob([input.value]).size
    }

    if (mode.value === 'beautify') {
      output.value = JSON.stringify(parsed, null, +indent.value || 2)
    } else if (mode.value === 'minify') {
      output.value = JSON.stringify(parsed)
    } else if (mode.value === 'validate') {
      output.value = '✓ JSON 格式有效'
    }
  } catch (e) {
    error.value = e.message
    const pos = findErrorPosition(input.value, e.message)
    if (pos) {
      errorLine.value = pos.line
      errorCol.value = pos.col
    }
  }
}

function applyJsonPath() {
  if (!jsonPath.value.trim()) {
    pathResult.value = ''
    return
  }
  pathResult.value = ''
  try {
    const parsed = JSON.parse(input.value)
    const result = queryJsonPath(parsed, jsonPath.value)
    pathResult.value = JSON.stringify(result, null, 2)
  } catch (e) {
    pathResult.value = '查询失败: ' + e.message
  }
}

function queryJsonPath(obj, path) {
  // 简易 JSONPath: $.store.book[0].title 或 $..title
  if (path.startsWith('$..')) {
    const key = path.slice(3)
    const results = []
    const walk = (v) => {
      if (v && typeof v === 'object') {
        if (Array.isArray(v)) v.forEach(walk)
        else {
          Object.entries(v).forEach(([k, val]) => {
            if (k === key) results.push(val)
            walk(val)
          })
        }
      }
    }
    walk(obj)
    return results
  }
  // 标准点语法
  const parts = path.replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

function loadFile() {
  const input_el = document.createElement('input')
  input_el.type = 'file'
  input_el.accept = '.json,application/json'
  input_el.onchange = e => {
    const f = e.target.files[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => { input.value = r.result }
    r.readAsText(f)
  }
  input_el.click()
}

function downloadOutput() {
  if (!output.value) return
  const blob = new Blob([output.value], { type: 'application/json;charset=utf-8' })
  downloadBlob(blob, 'formatted.json')
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value).then(() => {
    showError('已复制到剪贴板')
  }).catch(() => showError('复制失败'))
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
  stats.value = null
  pathResult.value = ''
  jsonPath.value = ''
}

function formatSample() {
  input.value = '{"name":"FileCut","version":"1.0","features":["pdf","word","excel"],"meta":{"author":"Team","year":2024,"tags":["tool","online"],"nested":{"deep":true}}}'
  process()
}
</script>

<template>
  <ToolLayout title="JSON格式化校验" desc="JSON美化/压缩/校验，显示错误位置，JSONPath查询" icon="{}">
    <div class="nb-card">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="nb-btn sm" @click="loadFile">📂 加载文件</button>
          <button class="nb-btn sm" @click="formatSample">📝 示例</button>
          <button class="nb-btn sm" @click="clearAll">✕ 清空</button>
        </div>
        <div v-if="inputStats" class="stats">
          <span class="nb-tag">{{ inputStats.chars }} 字符</span>
          <span class="nb-tag">{{ inputStats.lines }} 行</span>
        </div>
      </div>

      <div class="opt-row mt-16">
        <div>
          <label class="nb-label">模式</label>
          <select v-model="mode" class="nb-select">
            <option value="beautify">美化 (Beautify)</option>
            <option value="minify">压缩 (Minify)</option>
            <option value="validate">仅校验</option>
          </select>
        </div>
        <div v-if="mode === 'beautify'">
          <label class="nb-label">缩进</label>
          <select v-model.number="indent" class="nb-select">
            <option :value="2">2 空格</option>
            <option :value="4">4 空格</option>
            <option :value="0">Tab</option>
          </select>
        </div>
        <div class="actions-cell">
          <button class="nb-btn primary" @click="process">▶ 执行</button>
        </div>
      </div>

      <textarea v-model="input" class="nb-textarea mt-16 input-area"
                placeholder='粘贴或输入 JSON... 如 {"name":"test","value":123}' spellcheck="false"></textarea>
    </div>

    <div v-if="stats" class="nb-card mt-16">
      <h3 class="nb-h3">📊 统计</h3>
      <div class="stats-grid mt-16">
        <span class="nb-tag accent">类型: {{ stats.type }}</span>
        <span class="nb-tag cyan">{{ stats.length }} 项</span>
        <span class="nb-tag">{{ stats.bytes }} 字节</span>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">
      <strong>✗ 错误:</strong> {{ error }}
      <div v-if="errorLine" class="mt-8">
        位置: 第 {{ errorLine }} 行 第 {{ errorCol }} 列
      </div>
    </div>

    <div v-if="output" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">✓ 输出</h3>
        <div class="actions">
          <button class="nb-btn sm" @click="copyOutput">📋 复制</button>
          <button class="nb-btn sm" @click="downloadOutput">⬇ 下载</button>
        </div>
      </div>
      <pre class="output-area mt-16">{{ output }}</pre>
    </div>

    <div class="nb-card mt-16">
      <h3 class="nb-h3">🔍 JSONPath 查询</h3>
      <div class="path-input mt-16">
        <input v-model="jsonPath" class="nb-input" placeholder="$.store.book[0].title 或 $..title"
               @keyup.enter="applyJsonPath" />
        <button class="nb-btn primary" @click="applyJsonPath">查询</button>
      </div>
      <pre v-if="pathResult" class="output-area mt-16">{{ pathResult }}</pre>
      <div class="hint mt-16">
        <p>💡 支持: $.key, $.a.b.c, $[0], $[0].name, $..key (递归)</p>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.stats { display: flex; gap: 6px; flex-wrap: wrap; }
.opt-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  align-items: end;
}
.actions-cell { display: flex; align-items: end; }
.input-area {
  min-height: 200px;
  font-family: var(--font-mono);
  font-size: 13px;
}
.output-area {
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
.stats-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.path-input { display: flex; gap: 8px; align-items: center; }
.path-input .nb-input { flex: 1; }
.actions { display: flex; gap: 6px; }
.hint {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  background: var(--paper-bg);
  padding: 8px;
  border-left: 3px solid var(--accent);
}
.mt-8 { margin-top: 8px; }
</style>

<script setup>
/**
 * 文本比对Diff - 上传两段文本，可视化对比
 * 增/删/改不同颜色标注
 * 基于行级 LCS 算法实现
 */
import { ref, computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import { readFileAsText } from '../../utils/fileReader.js'
import { showError } from '../../utils/common.js'

const textA = ref('')
const textB = ref('')
const labelA = ref('原始')
const labelB = ref('修改')
const result = ref(null)  // { lines: [{ type, a, b, aLine, bLine }], stats }
const ignoreCase = ref(false)
const ignoreWhitespace = ref(false)
const showOnlyDiff = ref(false)

async function onFileSelectA(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  await loadFile(f, 'A')
}
async function onFileSelectB(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  await loadFile(f, 'B')
}

async function loadFile(f, target) {
  try {
    if (f.size === 0) throw new Error('文件为空')
    const text = await readFileAsText(f)
    if (target === 'A') {
      textA.value = text
      labelA.value = f.name
    } else {
      textB.value = text
      labelB.value = f.name
    }
  } catch (e) {
    showError('读取文件失败: ' + e.message)
  }
}

function normalize(s) {
  let r = s
  if (ignoreCase.value) r = r.toLowerCase()
  if (ignoreWhitespace.value) r = r.replace(/\s+/g, ' ').trim()
  return r
}

function computeDiff() {
  if (!textA.value && !textB.value) {
    showError('请输入两段文本')
    return
  }
  const a = textA.value.split('\n')
  const b = textB.value.split('\n')

  // LCS 动态规划
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (normalize(a[i - 1]) === normalize(b[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯生成 diff
  const lines = []
  let i = n, j = m
  while (i > 0 && j > 0) {
    if (normalize(a[i - 1]) === normalize(b[j - 1])) {
      lines.unshift({ type: 'equal', content: a[i - 1], aLine: i, bLine: j })
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      lines.unshift({ type: 'removed', content: a[i - 1], aLine: i, bLine: null })
      i--
    } else {
      lines.unshift({ type: 'added', content: b[j - 1], aLine: null, bLine: j })
      j--
    }
  }
  while (i > 0) { lines.unshift({ type: 'removed', content: a[i - 1], aLine: i, bLine: null }); i-- }
  while (j > 0) { lines.unshift({ type: 'added', content: b[j - 1], aLine: null, bLine: j }); j-- }

  // 统计
  const stats = {
    added: lines.filter(l => l.type === 'added').length,
    removed: lines.filter(l => l.type === 'removed').length,
    equal: lines.filter(l => l.type === 'equal').length,
    total: lines.length
  }

  result.value = { lines, stats }
}

function clearAll() {
  textA.value = ''
  textB.value = ''
  result.value = null
  labelA.value = '原始'
  labelB.value = '修改'
}

function loadSample() {
  textA.value = `第一行：FileCut 文档工具站
第二行：支持多种文件格式
第三行：浏览器本地处理
第四行：文件永不上传
第五行：免费使用`
  textB.value = `第一行：FileCut 文档工具站
第二行：支持多种文件格式 (PDF/Word/Excel)
第三行：浏览器本地处理，零延迟
第四行：文件永不上传
新增行：100% 隐私安全
第五行：免费使用`
  labelA.value = '原始'
  labelB.value = '修改'
}

const filteredLines = computed(() => {
  if (!result.value) return []
  if (!showOnlyDiff.value) return result.value.lines
  // 包含 diff 行 + 上下文 1 行
  const lines = result.value.lines
  const result = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'equal') {
      if (i > 0 && lines[i - 1].type === 'equal' && !result.includes(lines[i - 1])) {
        result.push(lines[i - 1])
      }
      result.push(lines[i])
      if (i < lines.length - 1 && lines[i + 1].type === 'equal') {
        result.push(lines[i + 1])
      }
    }
  }
  return result
})
</script>

<template>
  <ToolLayout title="文本比对Diff" desc="对比两段文本差异，增/删/改颜色标注" icon="⇄">
    <div class="nb-card">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="nb-btn sm" @click="loadSample">📝 示例</button>
          <button class="nb-btn sm" @click="clearAll">✕ 清空</button>
        </div>
        <div class="options">
          <label class="nb-label">
            <input type="checkbox" v-model="ignoreCase" /> 忽略大小写
          </label>
          <label class="nb-label">
            <input type="checkbox" v-model="ignoreWhitespace" /> 忽略空白
          </label>
          <label class="nb-label">
            <input type="checkbox" v-model="showOnlyDiff" /> 仅显示差异
          </label>
        </div>
      </div>

      <div class="dual-pane mt-16">
        <div class="pane">
          <label class="nb-label">A: {{ labelA }}</label>
          <textarea v-model="textA" class="nb-textarea code-area"
                    placeholder="左侧文本 (原始)..." spellcheck="false"></textarea>
          <FileDrop accept=".txt,.md,.log,.csv,.json,.yaml,.yml,.xml,.html,.js,.ts,.py,text/*"
                    :multiple="false" @select="onFileSelectA" @error="showError"
                    hint="或拖拽文件到此处" icon="A" />
        </div>
        <div class="pane">
          <label class="nb-label">B: {{ labelB }}</label>
          <textarea v-model="textB" class="nb-textarea code-area"
                    placeholder="右侧文本 (修改)..." spellcheck="false"></textarea>
          <FileDrop accept=".txt,.md,.log,.csv,.json,.yaml,.yml,.xml,.html,.js,.ts,.py,text/*"
                    :multiple="false" @select="onFileSelectB" @error="showError"
                    hint="或拖拽文件到此处" icon="B" />
        </div>
      </div>
    </div>

    <div class="mt-16">
      <button class="nb-btn primary lg" @click="computeDiff">
        🔍 比对
      </button>
    </div>

    <div v-if="result" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">📊 比对结果</h3>
        <div class="stats">
          <span class="nb-tag cyan">相同 {{ result.stats.equal }}</span>
          <span class="nb-tag" style="background:#c8f5b8">+ 新增 {{ result.stats.added }}</span>
          <span class="nb-tag" style="background:#f5b8b8">- 删除 {{ result.stats.removed }}</span>
          <span class="nb-tag">总 {{ result.stats.total }}</span>
        </div>
      </div>

      <div class="diff-table mt-16">
        <div v-for="(line, idx) in filteredLines" :key="idx" class="diff-line" :class="line.type">
          <span class="line-marker">
            <template v-if="line.type === 'added'">+</template>
            <template v-else-if="line.type === 'removed'">-</template>
            <template v-else>=</template>
          </span>
          <span class="line-num">{{ line.aLine || '' }}</span>
          <span class="line-num">{{ line.bLine || '' }}</span>
          <span class="line-content">{{ line.content }}</span>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.options { display: flex; gap: 12px; flex-wrap: wrap; }
.dual-pane {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pane { display: flex; flex-direction: column; gap: 8px; }
.code-area {
  min-height: 200px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  padding: 12px;
  border: 3px solid var(--ink);
  background: var(--paper-card);
}
.stats { display: flex; gap: 6px; flex-wrap: wrap; }
.diff-table {
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  max-height: 600px;
  overflow: auto;
}
.diff-line {
  display: grid;
  grid-template-columns: 28px 50px 50px 1fr;
  gap: 8px;
  padding: 2px 12px;
  align-items: center;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.diff-line.added { background: #c8f5b8; }
.diff-line.removed { background: #f5b8b8; }
.diff-line.equal { color: var(--ink-soft); }
.line-marker {
  font-weight: 700;
  text-align: center;
  color: var(--ink);
}
.diff-line.added .line-marker { color: var(--neon-deep); }
.diff-line.removed .line-marker { color: var(--danger); }
.line-num {
  color: var(--ink-muted);
  font-size: 11px;
  text-align: right;
}
.line-content {
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 768px) {
  .dual-pane { grid-template-columns: 1fr; }
  .diff-line {
    grid-template-columns: 20px 40px 40px 1fr;
    font-size: 11px;
  }
}
</style>

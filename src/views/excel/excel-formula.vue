<script setup>
/**
 * Excel公式校验 - SheetJS 解析所有公式
 * 检测错误公式(#REF!/#DIV/0!等)
 * 列出所有公式及错误
 */
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const formulas = ref([])
const errorFormulas = ref([])
const stats = ref(null)

// Excel 错误值
const ERROR_VALUES = ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A', '#NULL!', '#NUM!']

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  formulas.value = []
  errorFormulas.value = []
  stats.value = null
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  formulas.value = []
  errorFormulas.value = []
  stats.value = null
}

function colName(idx) {
  let s = ''
  idx += 1
  while (idx > 0) {
    const rem = (idx - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    idx = Math.floor((idx - 1) / 26)
  }
  return s
}

function isFormula(v) {
  return typeof v === 'string' && v.startsWith('=')
}

function isErrorValue(v) {
  if (typeof v !== 'string') return false
  return ERROR_VALUES.some(e => v.includes(e))
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  formulas.value = []
  errorFormulas.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array', cellFormula: true })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    const allFormulas = []
    const errs = []
    let totalCells = 0
    let formulaCount = 0
    let errorCount = 0

    wb.SheetNames.forEach(sheetName => {
      const ws = wb.Sheets[sheetName]
      if (!ws['!ref']) return
      const range = XLSX.utils.decode_range(ws['!ref'])

      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C })
          const cell = ws[addr]
          if (!cell) continue
          totalCells++

          // 公式单元格
          if (cell.f) {
            formulaCount++
            const item = {
              sheet: sheetName,
              cell: addr,
              col: colName(C) + (R + 1),
              formula: cell.f.startsWith('=') ? cell.f : '=' + cell.f,
              value: cell.v,
              isError: false,
              errorType: null
            }
            if (isErrorValue(cell.v) || isErrorValue(cell.w)) {
              item.isError = true
              const errMatch = ERROR_VALUES.find(e => String(cell.v || cell.w || '').includes(e))
              item.errorType = errMatch
              errorCount++
              errs.push(item)
            }
            allFormulas.push(item)
          } else if (isErrorValue(cell.v) || isErrorValue(cell.w)) {
            // 非公式但显示错误值
            errorCount++
            errs.push({
              sheet: sheetName,
              cell: addr,
              col: colName(C) + (R + 1),
              formula: '(直接值)',
              value: cell.v,
              isError: true,
              errorType: ERROR_VALUES.find(e => String(cell.v || cell.w || '').includes(e))
            })
          }
        }
      }
    })

    formulas.value = allFormulas
    errorFormulas.value = errs
    stats.value = {
      sheets: wb.SheetNames.length,
      totalCells,
      formulaCount,
      errorCount,
      formulaRatio: totalCells === 0 ? 0 : (formulaCount / totalCells * 100).toFixed(1)
    }

    // 输出报告
    let report = `Excel 公式校验报告
============================
文件: ${file.value.name}
扫描时间: ${new Date().toLocaleString('zh-CN')}

【统计】
工作表数: ${wb.SheetNames.length}
总单元格: ${totalCells}
公式数: ${formulaCount} (${stats.value.formulaRatio}%)
错误数: ${errorCount}

【公式列表】
${allFormulas.map(f => `[${f.sheet}] ${f.col} = ${f.formula}  →  ${f.value}${f.isError ? ' ⚠ ' + f.errorType : ''}`).join('\n')}

${errs.length ? `【错误详情】\n${errs.map(e => `[${e.sheet}] ${e.col}: ${e.errorType}  值=${e.value}  公式=${e.formula}`).join('\n')}` : '无错误'}
`
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    const name = replaceExt(file.value.name, '-formula-report.txt')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '校验失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}

const visibleFormulas = computed(() => {
  return formulas.value.slice(0, 200)
})
</script>

<template>
  <ToolLayout title="Excel公式校验" desc="校验Excel公式错误，列出所有公式" icon="ƒ">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式 · 检测 #REF!/#DIV/0! 等错误" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 扫描中...</span>
        <span v-else>开始扫描</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="stats" class="stats-grid mt-16">
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.sheets }}</div>
        <div class="stat-label">工作表数</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.totalCells.toLocaleString() }}</div>
        <div class="stat-label">总单元格</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value accent">{{ stats.formulaCount.toLocaleString() }}</div>
        <div class="stat-label">公式数 ({{ stats.formulaRatio }}%)</div>
      </div>
      <div class="stat-card nb-card" :class="{ danger: stats.errorCount > 0 }">
        <div class="stat-value" :class="{ danger: stats.errorCount > 0 }">{{ stats.errorCount.toLocaleString() }}</div>
        <div class="stat-label">错误数</div>
      </div>
    </div>

    <div v-if="errorFormulas.length" class="nb-card mt-16 error-card">
      <h3 class="nb-h3 mb-16">⚠ 错误公式 ({{ errorFormulas.length }})</h3>
      <div class="formula-list">
        <div v-for="(f, i) in errorFormulas.slice(0, 100)" :key="i" class="formula-item error">
          <span class="nb-tag accent">{{ f.sheet }}</span>
          <span class="formula-cell">{{ f.col }}</span>
          <span class="formula-error">{{ f.errorType }}</span>
          <span class="formula-text">{{ f.formula }}</span>
          <span class="formula-value">值: {{ f.value }}</span>
        </div>
        <p v-if="errorFormulas.length > 100" class="more-hint">... 还有 {{ errorFormulas.length - 100 }} 条错误，详见下载的报告</p>
      </div>
    </div>

    <div v-if="formulas.length" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">所有公式 ({{ formulas.length }}) - 显示前200条</h3>
      <div class="formula-list">
        <div v-for="(f, i) in visibleFormulas" :key="i" class="formula-item" :class="{ error: f.isError }">
          <span class="nb-tag">{{ f.sheet }}</span>
          <span class="formula-cell">{{ f.col }}</span>
          <span class="formula-text">{{ f.formula }}</span>
          <span class="formula-value" :class="{ error: f.isError }">= {{ f.value }}</span>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.stat-card {
  text-align: center;
  padding: 20px 12px;
}
.stat-card.danger {
  background: var(--danger);
  color: var(--paper-card);
}
.stat-value {
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
}
.stat-value.accent { color: var(--accent); }
.stat-value.danger { color: var(--danger); }
.stat-card.danger .stat-value { color: var(--paper-card); }
.stat-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 8px;
  text-transform: uppercase;
}
.error-card {
  border-color: var(--danger);
}
.formula-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 500px;
  overflow: auto;
}
.formula-item {
  display: grid;
  grid-template-columns: 80px 80px auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
}
.formula-item.error {
  background: #ffeef0;
  border-color: var(--danger);
}
.formula-cell {
  font-weight: 700;
  color: var(--accent);
}
.formula-error {
  color: var(--danger);
  font-weight: 700;
  background: #fff;
  padding: 2px 6px;
  border: 1px solid var(--danger);
}
.formula-text {
  color: var(--ink);
  word-break: break-all;
}
.formula-value {
  color: var(--cyan);
  font-style: italic;
  white-space: nowrap;
}
.formula-value.error {
  color: var(--danger);
  font-weight: 700;
}
.more-hint {
  padding: 12px;
  text-align: center;
  color: var(--ink-soft);
  font-style: italic;
}
@media (max-width: 768px) {
  .formula-item {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>

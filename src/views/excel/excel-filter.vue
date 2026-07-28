<script setup>
/**
 * Excel筛选排序 - 加载 .xlsx，显示列头
 * 选择列、条件、排序方式
 * 输出筛选后结果
 */
import { ref, computed, watch } from 'vue'
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
const headers = ref([])
const allRows = ref([])  // 数据行 (不含表头)
const sheetNames = ref([])
const currentSheet = ref('')

// 筛选条件
const filterCol = ref('')
const filterOp = ref('contains')  // contains | equals | startsWith | endsWith | gt | lt | gte | lte | notEmpty | empty
const filterValue = ref('')
const filters = ref([])  // 多个筛选条件

// 排序
const sortCol = ref('')
const sortOrder = ref('asc')  // asc | desc
const sorts = ref([])  // 多个排序

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  headers.value = []
  allRows.value = []
  sheetNames.value = []
  filters.value = []
  sorts.value = []
  error.value = ''
  loadExcel()
}

function removeFile() {
  file.value = null
  result.value = []
  headers.value = []
  allRows.value = []
  sheetNames.value = []
}

async function loadExcel() {
  if (!file.value) return
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    sheetNames.value = wb.SheetNames
    currentSheet.value = wb.SheetNames[0]
    loadSheet()
  }, 'Excel加载失败')
  processing.value = false
}

function loadSheet() {
  if (!file.value || !currentSheet.value) return
  // 重新解析
  readFileAsArrayBuffer(file.value).then(async (buf) => {
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[currentSheet.value]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (data.length) {
      headers.value = data[0].map((h, i) => h || `列${i + 1}`)
      allRows.value = data.slice(1).map(row => {
        const obj = {}
        headers.value.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : '' })
        return obj
      })
    } else {
      headers.value = []
      allRows.value = []
    }
    filters.value = []
    sorts.value = []
    filterCol.value = ''
    sortCol.value = ''
  })
}

watch(currentSheet, loadSheet)

function addFilter() {
  if (!filterCol.value) { showError('请选择筛选列'); return }
  filters.value.push({
    col: filterCol.value,
    op: filterOp.value,
    value: filterValue.value
  })
  filterValue.value = ''
}

function removeFilter(idx) { filters.value.splice(idx, 1) }

function addSort() {
  if (!sortCol.value) { showError('请选择排序列'); return }
  // 替换同列排序
  const existIdx = sorts.value.findIndex(s => s.col === sortCol.value)
  if (existIdx >= 0) {
    sorts.value[existIdx].order = sortOrder.value
  } else {
    sorts.value.push({ col: sortCol.value, order: sortOrder.value })
  }
}

function removeSort(idx) { sorts.value.splice(idx, 1) }

function matchFilter(row, f) {
  const val = String(row[f.col] ?? '')
  const target = String(f.value ?? '')
  switch (f.op) {
    case 'contains': return val.includes(target)
    case 'equals': return val === target
    case 'startsWith': return val.startsWith(target)
    case 'endsWith': return val.endsWith(target)
    case 'gt': return parseFloat(val) > parseFloat(target)
    case 'lt': return parseFloat(val) < parseFloat(target)
    case 'gte': return parseFloat(val) >= parseFloat(target)
    case 'lte': return parseFloat(val) <= parseFloat(target)
    case 'notEmpty': return val.trim() !== ''
    case 'empty': return val.trim() === ''
    default: return true
  }
}

const filteredRows = computed(() => {
  let rows = allRows.value
  if (filters.value.length) {
    rows = rows.filter(row => filters.value.every(f => matchFilter(row, f)))
  }
  if (sorts.value.length) {
    rows = [...rows].sort((a, b) => {
      for (const s of sorts.value) {
        const av = a[s.col] ?? ''
        const bv = b[s.col] ?? ''
        const an = parseFloat(av)
        const bn = parseFloat(bv)
        let cmp
        if (!isNaN(an) && !isNaN(bn) && String(av).trim() !== '' && String(bv).trim() !== '') {
          cmp = an - bn
        } else {
          cmp = String(av).localeCompare(String(bv), 'zh-CN')
        }
        if (cmp !== 0) return s.order === 'desc' ? -cmp : cmp
      }
      return 0
    })
  }
  return rows
})

const previewRows = computed(() => filteredRows.value.slice(0, 50))

async function exportResult() {
  if (!filteredRows.value.length) { showError('筛选结果为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const data = [headers.value, ...filteredRows.value.map(r => headers.value.map(h => r[h]))]
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Filtered')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (blob.size === 0) throw new Error('生成文件为空')

    const name = replaceExt(file.value.name, '-filtered.xlsx')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '导出失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="Excel筛选排序" desc="在线筛选排序Excel数据" icon="⇅">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="sheetNames.length" class="mt-16 nb-card">
      <label class="nb-label">工作表</label>
      <select v-model="currentSheet" class="nb-select">
        <option v-for="n in sheetNames" :key="n" :value="n">{{ n }}</option>
      </select>
    </div>

    <div v-if="headers.length" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">添加筛选条件</h3>
      <div class="filter-row">
        <select v-model="filterCol" class="nb-select">
          <option value="">选择列</option>
          <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
        </select>
        <select v-model="filterOp" class="nb-select">
          <option value="contains">包含</option>
          <option value="equals">等于</option>
          <option value="startsWith">以...开头</option>
          <option value="endsWith">以...结尾</option>
          <option value="gt">大于</option>
          <option value="lt">小于</option>
          <option value="gte">大于等于</option>
          <option value="lte">小于等于</option>
          <option value="notEmpty">非空</option>
          <option value="empty">为空</option>
        </select>
        <input v-model="filterValue" class="nb-input" placeholder="值" />
        <button class="nb-btn primary sm" @click="addFilter">+ 添加</button>
      </div>

      <div v-if="filters.length" class="filter-list mt-16">
        <div v-for="(f, i) in filters" :key="i" class="filter-item">
          <span class="nb-tag accent">{{ f.col }}</span>
          <span class="filter-op">{{ f.op }}</span>
          <span class="filter-val">"{{ f.value }}"</span>
          <button class="nb-btn sm danger" @click="removeFilter(i)">×</button>
        </div>
      </div>
    </div>

    <div v-if="headers.length" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">添加排序</h3>
      <div class="filter-row">
        <select v-model="sortCol" class="nb-select">
          <option value="">选择列</option>
          <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
        </select>
        <select v-model="sortOrder" class="nb-select">
          <option value="asc">升序 ↑</option>
          <option value="desc">降序 ↓</option>
        </select>
        <button class="nb-btn primary sm" @click="addSort">+ 添加</button>
      </div>
      <div v-if="sorts.length" class="filter-list mt-16">
        <div v-for="(s, i) in sorts" :key="i" class="filter-item">
          <span class="nb-tag cyan">{{ s.col }}</span>
          <span class="filter-op">{{ s.order === 'asc' ? '↑ 升序' : '↓ 降序' }}</span>
          <button class="nb-btn sm danger" @click="removeSort(i)">×</button>
        </div>
      </div>
    </div>

    <div v-if="headers.length" class="mt-16">
      <button class="nb-btn primary lg" @click="exportResult" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span></span> 导出筛选结果 ({{ filteredRows.length }} 行)
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="headers.length" class="nb-card mt-16 table-card">
      <p class="stats-line">显示前 {{ previewRows.length }} 行 / 共 {{ filteredRows.length }} 行 (原 {{ allRows.length }} 行)</p>
      <div class="table-scroll">
        <table class="preview-table">
          <thead>
            <tr>
              <th>#</th>
              <th v-for="h in headers" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in previewRows" :key="ri">
              <td class="row-num">{{ ri + 1 }}</td>
              <td v-for="h in headers" :key="h">{{ row[h] }}</td>
            </tr>
            <tr v-if="!previewRows.length">
              <td :colspan="headers.length + 1" class="empty">无匹配数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr 2fr auto;
  gap: 8px;
}
.filter-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
}
.filter-op {
  color: var(--accent);
  font-weight: 700;
}
.filter-val {
  flex: 1;
  word-break: break-all;
}
.stats-line {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-bottom: 12px;
  color: var(--ink-soft);
}
.table-card { padding: 12px; }
.table-scroll {
  overflow: auto;
  max-height: 60vh;
  border: 2px solid var(--ink);
  background: #fff;
}
.preview-table {
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  width: max-content;
  min-width: 100%;
}
.preview-table th, .preview-table td {
  border: 1px solid #ccc;
  padding: 4px 8px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-table th { background: var(--paper-darker); position: sticky; top: 0; }
.preview-table .row-num { background: var(--paper-bg); font-weight: 700; }
.preview-table .empty { text-align: center; padding: 24px; color: var(--ink-muted); }
@media (max-width: 768px) {
  .filter-row { grid-template-columns: 1fr; }
}
</style>

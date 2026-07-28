<script setup>
/**
 * Excel预览 - SheetJS 解析，渲染为HTML表格
 * 支持多sheet切换、分页
 */
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const processing = ref(false)
const error = ref('')
const workbook = ref(null)
const sheets = ref([])
const currentSheet = ref('')
const currentPage = ref(1)
const pageSize = ref(50)
const sheetData = ref([])
const sheetRange = ref({ rows: 0, cols: 0 })

function onFileSelect(selected) {
  file.value = selected
  workbook.value = null
  sheets.value = []
  sheetData.value = []
  error.value = ''
  loadExcel()
}

function removeFile() {
  file.value = null
  workbook.value = null
  sheets.value = []
  sheetData.value = []
  currentSheet.value = ''
}

async function loadExcel() {
  if (!file.value) return
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array', cellStyles: true, cellDates: true })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    workbook.value = wb
    sheets.value = wb.SheetNames
    currentSheet.value = wb.SheetNames[0]
    currentPage.value = 1
    loadSheetData()
  }, 'Excel加载失败')
  processing.value = false
}

function loadSheetData() {
  if (!workbook.value || !currentSheet.value) return
  const ws = workbook.value.Sheets[currentSheet.value]
  if (!ws) {
    sheetData.value = []
    sheetRange.value = { rows: 0, cols: 0 }
    return
  }

  // 获取范围
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const rows = range.e.r - range.s.r + 1
  const cols = range.e.c - range.s.c + 1
  sheetRange.value = { rows, cols }

  // 转为二维数组 (header:1)
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  sheetData.value = data
}

watch(currentSheet, () => {
  currentPage.value = 1
  loadSheetData()
})

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return sheetData.value.slice(start, start + pageSize.value)
})

const totalPages = computed(() => {
  if (!sheetData.value.length) return 1
  return Math.max(1, Math.ceil(sheetData.value.length / pageSize.value))
})

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

function changePage(delta) {
  const newPage = currentPage.value + delta
  if (newPage >= 1 && newPage <= totalPages.value) {
    currentPage.value = newPage
  }
}
</script>

<template>
  <ToolLayout title="Excel预览" desc="在线预览Excel，支持多Sheet切换、分页" icon="👁">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="workbook" class="mt-16 nb-card">
      <div class="preview-toolbar">
        <div class="toolbar-left">
          <span class="nb-tag accent">{{ formatBytes(file.size) }}</span>
          <span class="nb-tag">共 {{ sheets.length }} 个工作表</span>
          <span class="nb-tag">行: {{ sheetRange.rows }} · 列: {{ sheetRange.cols }}</span>
        </div>
        <div class="toolbar-right">
          <span v-if="processing" class="nb-tag cyan"><span class="nb-spinner"></span></span>
        </div>
      </div>
    </div>

    <div v-if="sheets.length" class="mt-16 nb-card">
      <div class="sheet-tabs">
        <button v-for="name in sheets" :key="name"
                class="nb-btn sm sheet-tab"
                :class="{ active: currentSheet === name }"
                @click="currentSheet = name">
          📊 {{ name }}
        </button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="sheetData.length" class="mt-16">
      <div class="nb-card table-card">
        <div class="table-toolbar">
          <div class="page-info">
            第 {{ currentPage }} / {{ totalPages }} 页 · 每页 {{ pageSize }} 行
          </div>
          <div class="page-controls">
            <button class="nb-btn sm" @click="changePage(-1)" :disabled="currentPage === 1">上一页</button>
            <button class="nb-btn sm" @click="changePage(1)" :disabled="currentPage === totalPages">下一页</button>
          </div>
        </div>
        <div class="table-scroll">
          <table class="excel-table">
            <thead>
              <tr>
                <th class="row-num">#</th>
                <th v-for="c in sheetRange.cols" :key="c">{{ colName(c - 1) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in pagedData" :key="ri">
                <td class="row-num">{{ (currentPage - 1) * pageSize + ri + 1 }}</td>
                <td v-for="c in sheetRange.cols" :key="c">{{ row[c - 1] !== undefined ? row[c - 1] : '' }}</td>
              </tr>
              <tr v-if="!pagedData.length">
                <td :colspan="sheetRange.cols + 1" class="empty">无数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar-left, .toolbar-right { display: flex; gap: 6px; flex-wrap: wrap; }
.sheet-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sheet-tab.active {
  background: var(--neon);
  border-color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}
.table-card { padding: 0; overflow: hidden; }
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--paper-bg);
  border-bottom: 3px solid var(--ink);
  flex-wrap: wrap;
  gap: 8px;
}
.page-info {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
.page-controls { display: flex; gap: 6px; }
.table-scroll {
  overflow: auto;
  max-height: 70vh;
  background: #fff;
}
.excel-table {
  border-collapse: collapse;
  width: 100%;
  font-family: var(--font-mono);
  font-size: 12px;
}
.excel-table th, .excel-table td {
  border: 1px solid #ccc;
  padding: 4px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
}
.excel-table th {
  background: var(--paper-darker);
  font-weight: 700;
  position: sticky;
  top: 0;
  z-index: 1;
}
.excel-table .row-num {
  background: var(--paper-bg);
  color: var(--ink-soft);
  font-weight: 700;
  text-align: center;
  width: 50px;
}
.excel-table td:not(.row-num):not(.empty) {
  color: var(--ink);
}
.excel-table .empty {
  text-align: center;
  padding: 24px;
  color: var(--ink-muted);
}
.excel-table tbody tr:hover { background: var(--accent-soft); }
</style>

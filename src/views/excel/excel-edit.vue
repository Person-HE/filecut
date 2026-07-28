<script setup>
/**
 * Excel在线编辑 - SheetJS 解析，渲染为可编辑表格(contenteditable)
 * 保存时用 SheetJS 写回 .xlsx
 */
import { ref, computed, nextTick } from 'vue'
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
const saving = ref(false)
const error = ref('')
const sheets = ref([])
const currentSheet = ref('')
const sheetData = ref([])  // 二维数组
const editing = ref(false)
const containerRef = ref(null)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  sheetData.value = []
  sheets.value = []
  error.value = ''
  loadExcel()
}

function removeFile() {
  file.value = null
  result.value = []
  sheetData.value = []
  sheets.value = []
  currentSheet.value = ''
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

    // 保存所有 sheet 数据
    sheets.value = wb.SheetNames.map(name => ({
      name,
      data: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    }))
    currentSheet.value = wb.SheetNames[0]
    loadCurrentSheet()
  }, 'Excel加载失败')
  processing.value = false
}

function loadCurrentSheet() {
  const sh = sheets.value.find(s => s.name === currentSheet.value)
  if (sh) sheetData.value = sh.data
}

function switchSheet(name) {
  currentSheet.value = name
  loadCurrentSheet()
}

const cols = computed(() => {
  if (!sheetData.value.length) return 0
  return Math.max(...sheetData.value.map(r => r.length))
})

const colNames = computed(() => {
  const arr = []
  for (let i = 0; i < cols.value; i++) {
    let s = ''
    let n = i
    n += 1
    while (n > 0) {
      const rem = (n - 1) % 26
      s = String.fromCharCode(65 + rem) + s
      n = Math.floor((n - 1) / 26)
    }
    arr.push(s)
  }
  return arr
})

function addRow() {
  const newRow = new Array(cols.value).fill('')
  sheetData.value.push(newRow)
}

function addCol() {
  sheetData.value.forEach(row => {
    row.push('')
  })
}

function removeRow(idx) {
  if (confirm(`确定删除第 ${idx + 1} 行?`)) {
    sheetData.value.splice(idx, 1)
  }
}

async function save() {
  if (!sheetData.value.length) { showError('无数据可保存'); return }
  error.value = ''
  result.value = []
  saving.value = true

  await safeRun(async () => {
    // 同步当前编辑的数据
    const sh = sheets.value.find(s => s.name === currentSheet.value)
    if (sh) sh.data = sheetData.value

    const wb = XLSX.utils.book_new()
    sheets.value.forEach(sh => {
      // 清理空行尾
      const data = sh.data.filter(row => row.some(c => String(c).trim() !== ''))
      const ws = XLSX.utils.aoa_to_sheet(data.length ? data : [['']])
      // 列宽
      const colWidths = []
      data.forEach(row => {
        row.forEach((cell, ci) => {
          const len = String(cell || '').length * 1.5
          if (!colWidths[ci] || colWidths[ci].wch < len) {
            colWidths[ci] = { wch: Math.min(Math.max(len, 8), 40) }
          }
        })
      })
      ws['!cols'] = colWidths
      const safeName = sh.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 31) || 'Sheet'
      XLSX.utils.book_append_sheet(wb, ws, safeName)
    })

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (blob.size === 0) throw new Error('生成的Excel为空')

    const name = replaceExt(file.value.name, '-edited.xlsx')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '保存失败')
  saving.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Excel在线编辑" desc="在线编辑Excel，增删行列、修改单元格" icon="✎">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式 · 加载后可直接修改" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="sheets.length" class="mt-16 nb-card">
      <div class="toolbar">
        <div class="sheet-tabs">
          <button v-for="sh in sheets" :key="sh.name"
                  class="nb-btn sm"
                  :class="{ primary: currentSheet === sh.name }"
                  @click="switchSheet(sh.name)">{{ sh.name }}</button>
        </div>
        <div class="action-group">
          <button class="nb-btn sm" @click="addRow">+ 行</button>
          <button class="nb-btn sm" @click="addCol">+ 列</button>
          <button class="nb-btn primary sm" @click="save" :disabled="saving">
            <span v-if="saving"><span class="nb-spinner"></span></span> 💾 保存
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="sheetData.length" class="nb-card mt-16 table-card">
      <div class="table-scroll">
        <table class="edit-table">
          <thead>
            <tr>
              <th class="row-num">#</th>
              <th v-for="(c, ci) in colNames" :key="ci">{{ c }}</th>
              <th class="op-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in sheetData" :key="ri">
              <td class="row-num">{{ ri + 1 }}</td>
              <td v-for="(cell, ci) in row" :key="ci">
                <input v-model="sheetData[ri][ci]" class="cell-input" />
              </td>
              <td class="op-col">
                <button class="nb-btn sm danger" @click="removeRow(ri)">删行</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.sheet-tabs, .action-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.table-card { padding: 0; overflow: hidden; }
.table-scroll {
  overflow: auto;
  max-height: 65vh;
  background: #fff;
}
.edit-table {
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  width: max-content;
  min-width: 100%;
}
.edit-table th, .edit-table td {
  border: 1px solid #ccc;
  padding: 0;
}
.edit-table th {
  background: var(--paper-darker);
  font-weight: 700;
  padding: 6px 10px;
  position: sticky;
  top: 0;
  z-index: 1;
}
.edit-table .row-num {
  background: var(--paper-bg);
  color: var(--ink-soft);
  font-weight: 700;
  text-align: center;
  padding: 6px 8px;
  width: 50px;
}
.edit-table .op-col {
  width: 60px;
  text-align: center;
  background: var(--paper-card);
}
.cell-input {
  width: 120px;
  min-width: 60px;
  border: none;
  background: transparent;
  padding: 6px 8px;
  font: inherit;
  outline: none;
}
.cell-input:focus {
  background: var(--neon);
  outline: 2px solid var(--accent);
}
</style>

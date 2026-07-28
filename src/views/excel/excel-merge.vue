<script setup>
/**
 * 多Excel合并 - 上传多个 .xlsx，按sheet合并或追加
 * 处理列对齐问题
 */
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const mergeMode = ref('append')  // append | bySheet | alignColumns
const outputSheetName = ref('合并数据')
const fileInfos = ref([])

function onFileSelect(selected) {
  if (Array.isArray(selected)) {
    files.value = [...files.value, ...selected]
  } else {
    files.value.push(selected)
  }
  result.value = []
  error.value = ''
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

async function process() {
  if (!files.value.length) { showError('请先选择至少2个文件'); return }
  if (files.value.length < 2) { showError('至少需要2个文件才能合并'); return }
  for (const f of files.value) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); return }
  }
  error.value = ''
  result.value = []
  fileInfos.value = []
  processing.value = true

  await safeRun(async () => {
    // 解析所有文件
    const parsed = []
    for (const f of files.value) {
      const buf = await readFileAsArrayBuffer(f)
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.map(name => ({
        name,
        data: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
      }))
      parsed.push({ file: f, workbook: wb, sheets })
      fileInfos.value.push({
        name: f.name,
        sheets: wb.SheetNames.length,
        rows: sheets.reduce((sum, s) => sum + Math.max(0, s.data.length - 1), 0)
      })
    }

    let mergedData = []
    let outSheetName = outputSheetName.value || '合并数据'

    if (mergeMode.value === 'append') {
      // 追加模式：所有数据垂直堆叠（保留表头一次）
      let headerSet = false
      for (const p of parsed) {
        for (const sh of p.sheets) {
          if (!sh.data.length) continue
          if (!headerSet) {
            mergedData.push(sh.data[0])  // 第一个文件的表头
            headerSet = true
          }
          // 添加后续行
          for (let i = 1; i < sh.data.length; i++) {
            mergedData.push(sh.data[i])
          }
        }
      }
    } else if (mergeMode.value === 'bySheet') {
      // 按Sheet合并：每个原sheet单独保留，文件名前缀
      const wb = XLSX.utils.book_new()
      for (const p of parsed) {
        for (const sh of p.sheets) {
          if (!sh.data.length) continue
          const ws = XLSX.utils.aoa_to_sheet(sh.data)
          const prefix = parsed.length > 1 ? getSafeName(p.file.name).slice(0, 20) + '-' : ''
          const sheetName = (prefix + sh.name).slice(0, 31) || 'Sheet'
          XLSX.utils.book_append_sheet(wb, ws, sheetName)
        }
      }
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      if (blob.size === 0) throw new Error('生成文件为空')
      const name = replaceExt(files.value[0].name, '-merged.xlsx')
      result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
      processing.value = false
      return
    } else if (mergeMode.value === 'alignColumns') {
      // 列对齐模式：合并所有列名，按列名对齐
      const allHeaders = new Set()
      parsed.forEach(p => p.sheets.forEach(sh => {
        if (sh.data.length) sh.data[0].forEach(h => allHeaders.add(h))
      }))
      const headerArr = Array.from(allHeaders)
      mergedData.push(headerArr)
      for (const p of parsed) {
        for (const sh of p.sheets) {
          if (!sh.data.length) continue
          const fileHeaders = sh.data[0]
          for (let i = 1; i < sh.data.length; i++) {
            const row = new Array(headerArr.length).fill('')
            fileHeaders.forEach((h, ci) => {
              const targetIdx = headerArr.indexOf(h)
              if (targetIdx >= 0) row[targetIdx] = sh.data[i][ci] ?? ''
            })
            mergedData.push(row)
          }
        }
      }
    }

    if (!mergedData.length) throw new Error('合并后无数据')

    const ws = XLSX.utils.aoa_to_sheet(mergedData)
    // 自动列宽
    const colWidths = []
    mergedData.forEach(row => {
      row.forEach((cell, ci) => {
        const len = String(cell || '').length * 1.5
        if (!colWidths[ci] || colWidths[ci].wch < len) {
          colWidths[ci] = { wch: Math.min(Math.max(len, 8), 40) }
        }
      })
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, getSafeName(outSheetName).slice(0, 31) || 'Sheet1')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (blob.size === 0) throw new Error('生成文件为空')

    const name = replaceExt(files.value[0].name, '-merged.xlsx')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '合并失败')
  processing.value = false
}

function getSafeName(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '_')
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="多Excel合并" desc="合并多个Excel文件，支持追加/按Sheet/列对齐" icon="+">
    <FileDrop accept=".xlsx,.xls" :multiple="true" hint="支持 .xlsx / .xls 格式 · 至少2个文件" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="files.length" :files="files" class="mt-16" @remove="removeFile" />

    <div v-if="files.length >= 2" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">合并方式</h3>
      <div class="mode-options">
        <label class="mode-item" :class="{ active: mergeMode === 'append' }">
          <input type="radio" v-model="mergeMode" value="append" />
          <div class="mode-info">
            <strong>追加合并</strong>
            <p>所有数据垂直堆叠，仅保留第一个表头</p>
          </div>
        </label>
        <label class="mode-item" :class="{ active: mergeMode === 'bySheet' }">
          <input type="radio" v-model="mergeMode" value="bySheet" />
          <div class="mode-info">
            <strong>按Sheet保留</strong>
            <p>每个工作表独立保留，文件名作前缀</p>
          </div>
        </label>
        <label class="mode-item" :class="{ active: mergeMode === 'alignColumns' }">
          <input type="radio" v-model="mergeMode" value="alignColumns" />
          <div class="mode-info">
            <strong>列对齐合并</strong>
            <p>合并所有列名，按列对齐数据</p>
          </div>
        </label>
      </div>
      <div class="mt-16" v-if="mergeMode !== 'bySheet'">
        <label class="nb-label">输出工作表名称</label>
        <input v-model="outputSheetName" class="nb-input" placeholder="合并数据" maxlength="31" />
      </div>
    </div>

    <div class="mt-16" v-if="files.length >= 2">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 合并中...</span>
        <span v-else>开始合并 ({{ files.length }} 个文件)</span>
      </button>
    </div>

    <div v-if="fileInfos.length" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">文件信息</h3>
      <table class="info-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>工作表数</th>
            <th>总行数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(info, i) in fileInfos" :key="i">
            <td>{{ info.name }}</td>
            <td>{{ info.sheets }}</td>
            <td>{{ info.rows }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.mode-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.mode-item {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  cursor: pointer;
  transition: all 0.15s ease;
}
.mode-item:hover { background: var(--accent-soft); }
.mode-item.active {
  background: var(--neon);
  box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-2px, -2px);
}
.mode-item input { margin-top: 4px; }
.mode-info strong {
  display: block;
  font-family: var(--font-mono);
  font-size: 14px;
  margin-bottom: 4px;
}
.mode-info p {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.4;
}
.info-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
}
.info-table th, .info-table td {
  border: 1px solid var(--ink);
  padding: 6px 10px;
  text-align: left;
}
.info-table th { background: var(--paper-darker); }
</style>

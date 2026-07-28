<script setup>
/**
 * CSV/JSON/Excel互转 - 三种格式任意互转
 * 用 PapaParse + SheetJS
 */
import { ref, computed } from 'vue'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, replaceExt, getExt } from '../../utils/download.js'
import { readFileAsArrayBuffer, readFileAsText } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const targetFormat = ref('json')
const csvDelimiter = ref(',')
const hasHeader = ref(true)
const result = ref([])
const processing = ref(false)
const error = ref('')
const preview = ref('')
const detectedFormat = ref('')

const formats = [
  { value: 'csv', label: 'CSV (逗号分隔)' },
  { value: 'tsv', label: 'TSV (Tab分隔)' },
  { value: 'json', label: 'JSON' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
  { value: 'xls', label: 'Excel (老版XLS)' }
]

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  preview.value = ''
  error.value = ''
  detectedFormat.value = detectFormat(f.name)
  // 智能默认目标格式
  if (detectedFormat.value === 'csv' || detectedFormat.value === 'tsv') targetFormat.value = 'json'
  else if (detectedFormat.value === 'json') targetFormat.value = 'xlsx'
  else if (detectedFormat.value === 'xlsx' || detectedFormat.value === 'xls') targetFormat.value = 'csv'
}

function detectFormat(name) {
  const ext = getExt(name)
  if (ext === 'csv') return 'csv'
  if (ext === 'tsv') return 'tsv'
  if (ext === 'json') return 'json'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'xls') return 'xls'
  return ''
}

async function parseInput() {
  const fmt = detectedFormat.value
  if (!fmt) throw new Error('不支持的输入格式，请使用 CSV/TSV/JSON/XLSX')

  let data
  if (fmt === 'csv' || fmt === 'tsv') {
    const text = await readFileAsText(file.value)
    const delim = fmt === 'tsv' ? '\t' : csvDelimiter.value
    const r = Papa.parse(text, {
      delimiter: delim,
      header: hasHeader.value,
      skipEmptyLines: true
    })
    if (r.errors.length) {
      console.warn('CSV parse warnings:', r.errors)
    }
    data = hasHeader.value ? r.data : arrayToObjects(r.data)
  } else if (fmt === 'json') {
    const text = await readFileAsText(file.value)
    data = JSON.parse(text)
    if (!Array.isArray(data)) {
      if (typeof data === 'object' && data !== null) data = [data]
      else throw new Error('JSON 必须是数组或对象')
    }
  } else if (fmt === 'xlsx' || fmt === 'xls') {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) throw new Error('Excel 文件无工作表')
    data = XLSX.utils.sheet_to_json(ws, { header: hasHeader.value ? 1 : 0 })
    if (!hasHeader.value) data = arrayToObjects(data)
  }
  if (!Array.isArray(data)) throw new Error('解析结果非数组')
  if (!data.length) throw new Error('文件为空或无数据行')
  return data
}

function arrayToObjects(arr) {
  if (!arr.length) return []
  // 第一行作为字段名 1,2,3...
  return arr.map(row => {
    const obj = {}
    row.forEach((v, i) => { obj[`col${i + 1}`] = v })
    return obj
  })
}

function objectsToArrays(data) {
  if (!data.length) return []
  const keys = Object.keys(data[0])
  return [keys, ...data.map(r => keys.map(k => r[k]))]
}

async function buildOutput(data) {
  const fmt = targetFormat.value
  let blob, name

  if (fmt === 'csv') {
    const text = Papa.unparse(data, { delimiter: csvDelimiter.value })
    blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
    name = replaceExt(file.value.name, '.csv')
  } else if (fmt === 'tsv') {
    const text = Papa.unparse(data, { delimiter: '\t' })
    blob = new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' })
    name = replaceExt(file.value.name, '.tsv')
  } else if (fmt === 'json') {
    const text = JSON.stringify(data, null, 2)
    blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    name = replaceExt(file.value.name, '.json')
  } else if (fmt === 'xlsx' || fmt === 'xls') {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const wbout = XLSX.write(wb, {
      bookType: fmt, type: 'array', compression: true
    })
    blob = new Blob([wbout], {
      type: fmt === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/vnd.ms-excel'
    })
    name = replaceExt(file.value.name, '.' + fmt)
  } else {
    throw new Error('不支持的目标格式: ' + fmt)
  }

  if (!blob || blob.size === 0) throw new Error('输出为空')
  return { blob, name }
}

function makePreview(data) {
  const fmt = targetFormat.value
  if (fmt === 'json') {
    const text = JSON.stringify(data, null, 2)
    return text.length > 5000 ? text.slice(0, 5000) + '\n...(预览截断)' : text
  }
  if (fmt === 'csv' || fmt === 'tsv') {
    const delim = fmt === 'tsv' ? '\t' : ','
    const text = Papa.unparse(data, { delimiter: delim })
    return text.length > 5000 ? text.slice(0, 5000) + '\n...(预览截断)' : text
  }
  // excel - 显示前几行
  const preview_data = data.slice(0, 10)
  return Papa.unparse(preview_data, { delimiter: '\t' })
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  error.value = ''
  result.value = []
  preview.value = ''
  processing.value = true

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    const data = await parseInput()
    if (!data || !data.length) throw new Error('解析后无数据')
    const { blob, name } = await buildOutput(data)
    const url = URL.createObjectURL(blob)
    result.value = [{ name, blob, url, size: blob.size }]
    preview.value = makePreview(data)
  }, '转换失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="CSV/JSON/Excel互转" desc="三种格式任意互转，可配置分隔符、表头" icon="⇄">
    <FileDrop accept=".csv,.tsv,.json,.xlsx,.xls,text/csv,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="支持 CSV/TSV/JSON/XLSX/XLS" icon="⇄" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ file.name }}</strong>
          <span class="file-meta"> · 检测到: {{ detectedFormat || '未知' }}</span>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">转换选项</h3>
      <div class="opt-grid mt-16">
        <div>
          <label class="nb-label">目标格式</label>
          <select v-model="targetFormat" class="nb-select">
            <option v-for="f in formats" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>
        </div>
        <div v-if="targetFormat === 'csv' || detectedFormat === 'csv'">
          <label class="nb-label">CSV 分隔符</label>
          <select v-model="csvDelimiter" class="nb-select">
            <option value=",">, 逗号</option>
            <option value=";">; 分号</option>
            <option value="\t">\t 制表符</option>
            <option value="|">| 竖线</option>
          </select>
        </div>
        <div>
          <label class="nb-label">
            <input type="checkbox" v-model="hasHeader" /> 第一行为表头
          </label>
        </div>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>⇄ 转换为 {{ targetFormat.toUpperCase() }}</span>
      </button>
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
.opt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  align-items: end;
}
.preview-box {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  border: 3px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

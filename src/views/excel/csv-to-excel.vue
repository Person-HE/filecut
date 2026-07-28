<script setup>
/**
 * CSV转Excel - PapaParse 解析 CSV，SheetJS 生成 xlsx
 * 处理编码(GBK/UTF-8)、分隔符(逗号/分号/Tab)
 */
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsText, readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const previewData = ref(null)
const delimiter = ref('auto') // auto | , | ; | \t | |
const encoding = ref('auto') // auto | utf-8 | gbk
const sheetName = ref('Sheet1')

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  previewData.value = null
  error.value = ''
  // 自动检测
  autoDetect()
}

function removeFile() {
  file.value = null
  result.value = []
  previewData.value = null
}

// 简易编码检测
function detectEncoding(buf) {
  // BOM 检测
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf-8'
  if (buf[0] === 0xFF && buf[1] === 0xFE) return 'utf-16le'
  if (buf[0] === 0xFE && buf[0] === 0xFF) return 'utf-16be'
  // 检测是否包含GBK 特征字节
  const arr = new Uint8Array(buf.slice(0, 4096))
  let gbkScore = 0, utf8Score = 0
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= 0x81 && arr[i] <= 0xFE && i + 1 < arr.length) {
      const next = arr[i + 1]
      if (next >= 0x40 && next <= 0xFE && next !== 0x7F) {
        gbkScore++
        i++
      }
    }
    if (arr[i] < 0x80) utf8Score++
  }
  // 如果有大量GBK 双字节特征，可能是GBK
  return gbkScore > utf8Score * 0.1 ? 'gbk' : 'utf-8'
}

async function autoDetect() {
  if (!file.value) return
  const buf = await readFileAsArrayBuffer(file.value)
  const enc = detectEncoding(buf)
  encoding.value = enc
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    let text
    if (encoding.value === 'auto') {
      const buf = await readFileAsArrayBuffer(file.value)
      const enc = detectEncoding(buf)
      text = await readFileAsText(file.value, enc)
    } else if (encoding.value === 'gbk') {
      // iconv-lite 不在浏览器中可用，回退到 GBK 解码 - 使用 TextDecoder
      const buf = await readFileAsArrayBuffer(file.value)
      try {
        text = new TextDecoder('gbk').decode(new Uint8Array(buf))
      } catch (e) {
        // 如果不支持 GBK，使用 UTF-8
        text = await readFileAsText(file.value, 'utf-8')
      }
    } else {
      text = await readFileAsText(file.value, encoding.value)
    }

    if (!text.trim()) throw new Error('文件内容为空')

    // 解析 CSV
    const config = {
      skipEmptyLines: true,
      delimitersToGuess: [',', ';', '\t', '|', '\n']
    }
    if (delimiter.value !== 'auto') {
      config.delimiter = delimiter.value === '\\t' ? '\t' : delimiter.value
    }

    const parsed = Papa.parse(text, config)
    if (parsed.errors && parsed.errors.length > 0) {
      console.warn('CSV解析有警告', parsed.errors)
    }

    const rows = parsed.data
    if (!rows.length) throw new Error('CSV无有效数据')

    previewData.value = {
      rows: rows.slice(0, 10),
      totalRows: rows.length,
      cols: rows[0]?.length || 0
    }

    // 转 SheetJS 工作表
    const ws = XLSX.utils.aoa_to_sheet(rows)
    // 自动列宽
    const colWidths = []
    rows.forEach(row => {
      row.forEach((cell, ci) => {
        const len = String(cell || '').length * 2 // 中文按2倍宽度
        if (!colWidths[ci] || colWidths[ci].wch < len) {
          colWidths[ci] = { wch: Math.min(Math.max(len, 8), 50) }
        }
      })
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    const safeSheetName = sheetName.value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 31) || 'Sheet1'
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName)

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (blob.size === 0) throw new Error('生成的Excel为空')

    const name = replaceExt(file.value.name, '.xlsx')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'CSV转Excel失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="CSV转Excel" desc="CSV转Excel，自动识别编码和分隔符" icon="X">
    <FileDrop accept=".csv,.txt" :multiple="false" hint="支持 .csv / .txt 格式 · 自动检测编码" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">转换选项</h3>
      <div class="options-grid">
        <div>
          <label class="nb-label">文件编码</label>
          <select v-model="encoding" class="nb-select">
            <option value="auto">自动检测</option>
            <option value="utf-8">UTF-8</option>
            <option value="gbk">GBK (中文Windows)</option>
            <option value="utf-16le">UTF-16 LE</option>
            <option value="utf-16be">UTF-16 BE</option>
          </select>
        </div>
        <div>
          <label class="nb-label">分隔符</label>
          <select v-model="delimiter" class="nb-select">
            <option value="auto">自动检测</option>
            <option value=",">逗号 (,)</option>
            <option value=";">分号 (;)</option>
            <option value="\t">制表符 (Tab)</option>
            <option value="|">竖线 (|)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">工作表名称</label>
          <input v-model="sheetName" class="nb-input" placeholder="Sheet1" maxlength="31" />
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="previewData" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">数据预览 (前10行)</h3>
      <p class="stats-line">共 {{ previewData.totalRows }} 行 · {{ previewData.cols }} 列</p>
      <div class="preview-table-wrap">
        <table class="preview-table">
          <thead>
            <tr>
              <th>#</th>
              <th v-for="c in previewData.cols" :key="c">列{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in previewData.rows" :key="ri">
              <td class="row-num">{{ ri + 1 }}</td>
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.stats-line {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-bottom: 12px;
  color: var(--ink-soft);
}
.preview-table-wrap {
  overflow-x: auto;
  max-height: 400px;
  border: 2px solid var(--ink);
}
.preview-table {
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  width: 100%;
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
.preview-table .row-num { background: var(--paper-bg); font-weight: 700; color: var(--ink-soft); }
</style>

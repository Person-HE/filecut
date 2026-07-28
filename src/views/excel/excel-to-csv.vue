<script setup>
/**
 * Excel转CSV - SheetJS sheet_to_csv
 * 多sheet时输出多个CSV或合并
 */
import { ref } from 'vue'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt, getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const mergeMode = ref('separate') // separate | merge
const delimiter = ref(',')
const encoding = ref('utf8')
const withBOM = ref(true)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    const FS = delimiter.value === '\\t' ? '\t' : delimiter.value
    const RS = '\n'
    const outputs = []

    if (mergeMode.value === 'separate') {
      // 每个工作表输出一个 CSV
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]
        const csv = XLSX.utils.sheet_to_csv(ws, { FS, RS })
        if (csv && csv.trim()) {
          const content = withBOM.value && encoding.value === 'utf8' ? '\ufeff' + csv : csv
          const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
          const safeName = name.replace(/[\\/:*?"<>|]/g, '_')
          outputs.push({
            name: `${getBaseName(file.value.name)}-${safeName}.csv`,
            blob,
            url: URL.createObjectURL(blob),
            size: blob.size
          })
        }
      })
    } else {
      // 合并到一个 CSV
      let merged = ''
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]
        const csv = XLSX.utils.sheet_to_csv(ws, { FS, RS })
        if (csv && csv.trim()) {
          merged += `# ${name}\n${csv}\n\n`
        }
      })
      if (merged) {
        const content = withBOM.value && encoding.value === 'utf8' ? '\ufeff' + merged : merged
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
        outputs.push({
          name: replaceExt(file.value.name, '.csv'),
          blob,
          url: URL.createObjectURL(blob),
          size: blob.size
        })
      }
    }

    if (!outputs.length) throw new Error('所有工作表均为空')

    result.value = outputs
  }, 'Excel转CSV失败')
  processing.value = false
}

function downloadAll() {
  result.value.forEach(r => downloadBlob(r.blob, r.name))
}
</script>

<template>
  <ToolLayout title="Excel转CSV" desc="Excel导出为CSV，支持多Sheet" icon="C">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">输出选项</h3>
      <div class="options-grid">
        <div>
          <label class="nb-label">多Sheet处理</label>
          <select v-model="mergeMode" class="nb-select">
            <option value="separate">每个Sheet单独输出</option>
            <option value="merge">合并为一个CSV</option>
          </select>
        </div>
        <div>
          <label class="nb-label">分隔符</label>
          <select v-model="delimiter" class="nb-select">
            <option value=",">逗号 (,)</option>
            <option value=";">分号 (;)</option>
            <option value="\t">制表符 (Tab)</option>
            <option value="|">竖线 (|)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">编码</label>
          <select v-model="encoding" class="nb-select">
            <option value="utf8">UTF-8</option>
            <option value="gbk">GBK (中文Windows)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">BOM</label>
          <select v-model="withBOM" class="nb-select">
            <option :value="true">添加 BOM (推荐)</option>
            <option :value="false">不添加</option>
          </select>
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

    <ResultViewer :files="result" />
    <div v-if="result.length > 1" class="mt-16">
      <button class="nb-btn primary" @click="downloadAll">⬇ 全部下载 ({{ result.length }} 个文件)</button>
    </div>
  </ToolLayout>
</template>

<style scoped>
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
</style>

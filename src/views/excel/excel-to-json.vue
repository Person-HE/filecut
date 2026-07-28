<script setup>
/**
 * Excel转JSON - SheetJS sheet_to_json
 * 提供 header 选项(第一行作为key)
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
const jsonPreview = ref('')
const headerMode = ref('first') // first | none | auto
const prettyPrint = ref(true)
const mergeMode = ref('separate') // separate | merge

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  jsonPreview.value = ''
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  jsonPreview.value = ''
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  jsonPreview.value = ''
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    const outputs = []
    const previews = []

    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name]
      let data
      if (headerMode.value === 'first') {
        // 第一行作为对象的 key
        data = XLSX.utils.sheet_to_json(ws, { defval: null })
      } else if (headerMode.value === 'none') {
        // 数组方式: 每行作为一个数组
        data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
      } else {
        // auto: 自动判断 - 如果第一行所有值都是字符串，作为 header
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        if (allRows.length > 0 && allRows[0].every(c => typeof c === 'string' && c.trim())) {
          data = XLSX.utils.sheet_to_json(ws, { defval: null })
        } else {
          data = allRows
        }
      }

      const jsonStr = prettyPrint.value ? JSON.stringify(data, null, 2) : JSON.stringify(data)
      const safeName = name.replace(/[\\/:*?"<>|]/g, '_')

      if (mergeMode.value === 'separate') {
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
        outputs.push({
          name: `${getBaseName(file.value.name)}-${safeName}.json`,
          blob,
          url: URL.createObjectURL(blob),
          size: blob.size
        })
      }
      previews.push(`// Sheet: ${name}\n${jsonStr.slice(0, 2000)}${jsonStr.length > 2000 ? '\n... (内容较长，请下载完整文件)' : ''}`)
    })

    if (mergeMode.value === 'merge') {
      // 合并所有 sheet 到一个对象
      const merged = {}
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name]
        let data
        if (headerMode.value === 'first') {
          data = XLSX.utils.sheet_to_json(ws, { defval: null })
        } else if (headerMode.value === 'none') {
          data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        } else {
          const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
          if (allRows.length > 0 && allRows[0].every(c => typeof c === 'string' && c.trim())) {
            data = XLSX.utils.sheet_to_json(ws, { defval: null })
          } else {
            data = allRows
          }
        }
        merged[name] = data
      })
      const jsonStr = prettyPrint.value ? JSON.stringify(merged, null, 2) : JSON.stringify(merged)
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' })
      outputs.push({
        name: replaceExt(file.value.name, '.json'),
        blob,
        url: URL.createObjectURL(blob),
        size: blob.size
      })
      previews.push(jsonStr.slice(0, 3000))
    }

    if (!outputs.length) throw new Error('所有工作表均为空')

    jsonPreview.value = previews.join('\n\n')
    result.value = outputs
  }, 'Excel转JSON失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Excel转JSON" desc="Excel转JSON数据，API友好" icon="J">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">输出选项</h3>
      <div class="options-grid">
        <div>
          <label class="nb-label">表头模式</label>
          <select v-model="headerMode" class="nb-select">
            <option value="first">第一行作为Key (对象)</option>
            <option value="none">纯数组 (无Key)</option>
            <option value="auto">自动判断</option>
          </select>
        </div>
        <div>
          <label class="nb-label">格式化</label>
          <select v-model="prettyPrint" class="nb-select">
            <option :value="true">美化 (缩进2空格)</option>
            <option :value="false">紧凑 (单行)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">多Sheet合并</label>
          <select v-model="mergeMode" class="nb-select">
            <option value="separate">每Sheet单独输出</option>
            <option value="merge">合并为一个JSON对象</option>
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

    <div v-if="jsonPreview" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">JSON预览</h3>
      <pre class="json-preview">{{ jsonPreview }}</pre>
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
.json-preview {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border: 2px solid var(--ink);
}
</style>

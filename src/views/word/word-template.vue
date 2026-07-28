<script setup>
/**
 * Word模板填充 - docxtemplater + pizzip
 * 用户上传 .docx 模板，输入 JSON 数据，生成填充后的文档
 * 提供模板语法说明和示例
 */
import { ref } from 'vue'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
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
const jsonData = ref(`{
  "name": "张三",
  "company": "ACME 公司",
  "date": "2025年1月1日",
  "amount": "￥9,999",
  "items": [
    { "name": "商品A", "qty": 2, "price": "100" },
    { "name": "商品B", "qty": 1, "price": "200" }
  ]
}`)

const showHelp = ref(false)

const exampleSyntax = `模板语法示例（在 .docx 模板中使用）:

1. 简单变量: {name}        → 替换为 "张三"
2. 嵌套对象: {user.name}   → 替换为 user 对象的 name 字段
3. 循环列表:
   {#items}
   商品: {name}, 数量: {qty}, 单价: {price}
   {/items}
4. 条件显示:
   {#hasDiscount}折扣价: {discount}{/hasDiscount}
5. 反向条件:
   {^hasDiscount}无折扣{/hasDiscount}`

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
  if (!file.value) { showError('请先选择模板文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }

  let data
  try {
    data = JSON.parse(jsonData.value)
  } catch (e) {
    showError('JSON 数据格式错误: ' + e.message)
    return
  }

  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const zip = new PizZip(buf)

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => ''
    })

    try {
      doc.render(data)
    } catch (e) {
      const errs = e?.properties?.errors || [e]
      const msgs = errs.map(er => er?.message || String(er)).join('\n')
      throw new Error('模板渲染失败:\n' + msgs)
    }

    const out = doc.getZip().generate({
      type: 'uint8array',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE'
    })

    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    if (blob.size === 0) throw new Error('生成的文档为空')

    const name = replaceExt(file.value.name, '-filled.docx')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Word模板填充失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Word模板填充" desc="基于模板批量生成文档，支持变量/循环/条件" icon="▤">
    <FileDrop accept=".docx" :multiple="false" hint="上传 .docx 模板文件，使用 {变量名} 占位符" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div class="mt-16">
      <button class="nb-btn sm" @click="showHelp = !showHelp">
        {{ showHelp ? '隐藏' : '查看' }}模板语法说明
      </button>
    </div>

    <div v-if="showHelp" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">模板语法说明</h3>
      <pre class="syntax-help">{{ exampleSyntax }}</pre>
    </div>

    <div v-if="file" class="mt-16 nb-card">
      <label class="nb-label">JSON 数据</label>
      <textarea v-model="jsonData" class="nb-textarea" rows="14" placeholder="输入 JSON 格式数据..."></textarea>
      <div class="mt-16">
        <button class="nb-btn primary lg" @click="process" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 渲染中...</span>
          <span v-else>开始填充</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16 whitespace-pre">{{ error }}</div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.syntax-help {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-x: auto;
  border: 2px solid var(--ink);
}
.whitespace-pre {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

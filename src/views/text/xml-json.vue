<script setup>
/**
 * XML/JSON互转 - 用 fast-xml-parser
 * 双向转换
 */
import { ref } from 'vue'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, replaceExt, getExt } from '../../utils/download.js'
import { readFileAsText } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const input = ref('')
const inputFormat = ref('xml')  // 'xml' or 'json'
const output = ref('')
const outputFormat = ref('json')
const result = ref([])
const processing = ref(false)
const error = ref('')

// 选项
const trimValues = ref(true)
const ignoreAttributes = ref(false)
const attributeNamePrefix = ref('@_')
const indent = ref(2)

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  output.value = ''
  error.value = ''
  const ext = getExt(f.name)
  if (ext === 'xml') {
    inputFormat.value = 'xml'
    outputFormat.value = 'json'
  } else if (ext === 'json') {
    inputFormat.value = 'json'
    outputFormat.value = 'xml'
  }
  await safeRun(async () => {
    if (f.size === 0) throw new Error('文件为空')
    input.value = await readFileAsText(f)
  }, '读取文件失败')
}

function buildParser() {
  return new XMLParser({
    trimValues: trimValues.value,
    ignoreAttributes: ignoreAttributes.value,
    attributeNamePrefix: attributeNamePrefix.value,
    parseAttributeValue: true,
    parseTagValue: true,
    removeNSFromAlias: true
  })
}
function buildBuilder() {
  return new XMLBuilder({
    format: true,
    indentBy: ' '.repeat(+indent.value || 2),
    ignoreAttributes: ignoreAttributes.value,
    attributeNamePrefix: attributeNamePrefix.value,
    suppressEmptyNode: true
  })
}

async function process() {
  if (!input.value.trim()) {
    showError('请输入内容')
    return
  }
  error.value = ''
  output.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    let text, blob, name
    if (inputFormat.value === 'xml' && outputFormat.value === 'json') {
      const parser = buildParser()
      const obj = parser.parse(input.value)
      text = JSON.stringify(obj, null, 2)
      blob = new Blob([text], { type: 'application/json;charset=utf-8' })
      name = file.value ? replaceExt(file.value.name, '.json') : 'output.json'
    } else if (inputFormat.value === 'json' && outputFormat.value === 'xml') {
      const obj = JSON.parse(input.value)
      const builder = buildBuilder()
      text = '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build(obj)
      blob = new Blob([text], { type: 'application/xml;charset=utf-8' })
      name = file.value ? replaceExt(file.value.name, '.xml') : 'output.xml'
    } else {
      throw new Error('不支持的转换方向')
    }
    if (!text) throw new Error('输出为空')
    output.value = text
    const url = URL.createObjectURL(blob)
    result.value = [{ name, blob, url, size: blob.size }]
  }, '转换失败')

  processing.value = false
}

function swapFormats() {
  const tmp = inputFormat.value
  inputFormat.value = outputFormat.value
  outputFormat.value = tmp
  if (output.value) {
    input.value = output.value
    output.value = ''
    result.value = []
  }
}

function loadSample() {
  file.value = null
  input.value = `<?xml version="1.0" encoding="UTF-8"?>
<bookstore>
  <book category="children">
    <title lang="en">Harry Potter</title>
    <author>J K. Rowling</author>
    <year>2005</year>
    <price>29.99</price>
  </book>
  <book category="web">
    <title lang="en">Learning XML</title>
    <author>Erik T. Ray</title>
    <year>2003</year>
    <price>39.95</price>
  </book>
</bookstore>`
  inputFormat.value = 'xml'
  outputFormat.value = 'json'
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
  result.value = []
  file.value = null
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value).then(() => showError('已复制'))
    .catch(() => showError('复制失败'))
}
</script>

<template>
  <ToolLayout title="XML/JSON互转" desc="XML 与 JSON 双向转换，可配置解析选项" icon="⇄">
    <FileDrop accept=".xml,.json,application/xml,text/xml,application/json"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传 XML 或 JSON 文件" icon="⇄" />

    <div class="nb-card mt-16">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="nb-btn sm" @click="loadSample">📝 示例</button>
          <button class="nb-btn sm" @click="clearAll">✕ 清空</button>
        </div>
        <div class="format-selector">
          <div>
            <label class="nb-label">源格式</label>
            <select v-model="inputFormat" class="nb-select">
              <option value="xml">XML</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <button class="nb-btn sm" @click="swapFormats">⇄</button>
          <div>
            <label class="nb-label">目标格式</label>
            <select v-model="outputFormat" class="nb-select">
              <option value="xml">XML</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>
      </div>

      <div class="options mt-16">
        <label class="nb-label">
          <input type="checkbox" v-model="trimValues" /> 去除空白
        </label>
        <label class="nb-label">
          <input type="checkbox" v-model="ignoreAttributes" /> 忽略属性
        </label>
        <label class="nb-label">
          属性前缀: <input v-model="attributeNamePrefix" class="nb-input" style="width:80px;display:inline-block" />
        </label>
        <label class="nb-label" v-if="inputFormat === 'json'">
          缩进:
          <select v-model.number="indent" class="nb-select" style="width:80px;display:inline-block">
            <option :value="2">2</option>
            <option :value="4">4</option>
          </select>
        </label>
      </div>

      <div class="dual-pane mt-16">
        <div class="pane">
          <label class="nb-label">输入 ({{ inputFormat }})</label>
          <textarea v-model="input" class="nb-textarea code-area"
                    :placeholder="`输入 ${inputFormat} 内容...`" spellcheck="false"></textarea>
        </div>
        <div class="pane">
          <label class="nb-label">输出 ({{ outputFormat }})</label>
          <pre class="code-area output-area">{{ output || '(执行后显示)' }}</pre>
          <button v-if="output" class="nb-btn sm mt-8" @click="copyOutput">📋 复制</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>⇄ {{ inputFormat }} → {{ outputFormat }}</span>
      </button>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.format-selector { display: flex; gap: 8px; align-items: end; }
.options {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
}
.dual-pane {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pane { display: flex; flex-direction: column; }
.code-area {
  min-height: 320px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  padding: 12px;
  border: 3px solid var(--ink);
  background: var(--paper-card);
}
.output-area {
  background: var(--ink);
  color: var(--neon);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.mt-8 { margin-top: 8px; }
@media (max-width: 768px) {
  .dual-pane { grid-template-columns: 1fr; }
  .format-selector { flex-direction: column; align-items: stretch; }
}
</style>

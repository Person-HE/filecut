<script setup>
/**
 * YAML/JSON互转 - 用 js-yaml
 * 双向转换
 */
import { ref } from 'vue'
import yaml from 'js-yaml'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, replaceExt, getExt } from '../../utils/download.js'
import { readFileAsText } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const input = ref('')
const inputFormat = ref('')  // 'yaml' or 'json'
const output = ref('')
const outputFormat = ref('json')  // 'yaml' or 'json'
const result = ref([])
const processing = ref(false)
const error = ref('')

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  output.value = ''
  error.value = ''
  const ext = getExt(f.name)
  if (ext === 'yaml' || ext === 'yml') {
    inputFormat.value = 'yaml'
    outputFormat.value = 'json'
  } else if (ext === 'json') {
    inputFormat.value = 'json'
    outputFormat.value = 'yaml'
  } else {
    inputFormat.value = 'yaml'
    outputFormat.value = 'json'
  }
  await safeRun(async () => {
    if (f.size === 0) throw new Error('文件为空')
    input.value = await readFileAsText(f)
  }, '读取文件失败')
}

function detectInputFormat(text) {
  const trimmed = text.trim()
  if (!trimmed) return 'yaml'
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  // JSON 严格特征
  try {
    JSON.parse(trimmed)
    return 'json'
  } catch (e) {
    return 'yaml'
  }
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
    const srcFormat = inputFormat.value || detectInputFormat(input.value)
    let parsed
    if (srcFormat === 'json') {
      parsed = JSON.parse(input.value)
    } else {
      parsed = yaml.load(input.value)
    }
    if (parsed === undefined || parsed === null) throw new Error('解析结果为空')

    let text, blob, name
    if (outputFormat.value === 'json') {
      text = JSON.stringify(parsed, null, 2)
      blob = new Blob([text], { type: 'application/json;charset=utf-8' })
      name = file.value ? replaceExt(file.value.name, '.json') : 'output.json'
    } else {
      text = yaml.dump(parsed, { indent: 2, lineWidth: 120 })
      blob = new Blob([text], { type: 'text/yaml;charset=utf-8' })
      name = file.value ? replaceExt(file.value.name, '.yaml') : 'output.yaml'
    }
    if (!text) throw new Error('输出为空')
    output.value = text
    const url = URL.createObjectURL(blob)
    result.value = [{ name, blob, url, size: blob.size }]
  }, '转换失败')

  processing.value = false
}

function loadSample() {
  file.value = null
  input.value = `name: FileCut
version: 1.0.0
description: 纯前端文档工具站
features:
  - pdf工具
  - word工具
  - excel工具
  - ppt工具
  - 图片工具
meta:
  author: Team
  year: 2024
  tags:
    - tool
    - online
    - browser
config:
  retry: 3
  timeout: 30
  debug: false
`
  inputFormat.value = 'yaml'
  outputFormat.value = 'json'
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
  result.value = []
  file.value = null
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

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value).then(() => showError('已复制'))
    .catch(() => showError('复制失败'))
}
</script>

<template>
  <ToolLayout title="YAML/JSON互转" desc="YAML 与 JSON 双向转换" icon="⇄">
    <FileDrop accept=".yaml,.yml,.json,text/yaml,application/json"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传 YAML 或 JSON 文件" icon="⇄" />

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
              <option value="yaml">YAML</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <button class="nb-btn sm" @click="swapFormats" title="交换">⇄</button>
          <div>
            <label class="nb-label">目标格式</label>
            <select v-model="outputFormat" class="nb-select">
              <option value="yaml">YAML</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>
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
.format-selector {
  display: flex;
  gap: 8px;
  align-items: end;
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

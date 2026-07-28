<script setup>
/**
 * 文本编码转换 - 检测原编码，转换到目标编码
 * UTF-8/GBK/UTF-16/Big5/Shift_JIS
 * 用 iconv-lite
 */
import { ref, computed, onMounted } from 'vue'
import * as iconv from 'iconv-lite'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, replaceExt } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const sourceEncoding = ref('auto')
const targetEncoding = ref('utf-8')
const detectedEncoding = ref('')
const detectedConfidence = ref(0)
const previewText = ref('')
const result = ref([])
const processing = ref(false)
const error = ref('')

const encodings = [
  { value: 'auto', label: '自动检测' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK / GB2312 / GB18030' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'utf-16be', label: 'UTF-16 BE' },
  { value: 'big5', label: 'Big5 (繁体中文)' },
  { value: 'shift_jis', label: 'Shift_JIS (日文)' },
  { value: 'euc-jp', label: 'EUC-JP (日文)' },
  { value: 'euc-kr', label: 'EUC-KR (韩文)' },
  { value: 'iso-8859-1', label: 'ISO-8859-1 (西欧)' },
  { value: 'windows-1252', label: 'Windows-1252' }
]

const targetEncodings = encodings.filter(e => e.value !== 'auto')

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  error.value = ''
  detectedEncoding.value = ''
  detectedConfidence.value = 0
  previewText.value = ''
  await detectAndPreview()
}

function detectBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return 'utf-8'
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return 'utf-16le'
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return 'utf-16be'
  return ''
}

function detectEncoding(buf) {
  const bom = detectBom(buf)
  if (bom) return { encoding: bom, confidence: 100, hasBom: true }

  // 简易启发式
  let utf8Valid = 0, utf8Invalid = 0
  let highBytes = 0
  for (let i = 0; i < Math.min(buf.length, 4096); i++) {
    const b = buf[i]
    if (b < 0x80) continue
    highBytes++
    if ((b & 0xE0) === 0xC0) {
      if (i + 1 < buf.length && (buf[i+1] & 0xC0) === 0x80) { utf8Valid++; i++ }
      else utf8Invalid++
    } else if ((b & 0xF0) === 0xE0) {
      if (i + 2 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80) { utf8Valid += 2; i += 2 }
      else utf8Invalid++
    } else if ((b & 0xF8) === 0xF0) {
      if (i + 3 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80 && (buf[i+3] & 0xC0) === 0x80) { utf8Valid += 3; i += 3 }
      else utf8Invalid++
    } else {
      utf8Invalid++
    }
  }
  if (highBytes === 0) return { encoding: 'utf-8', confidence: 90, hasBom: false }
  if (utf8Invalid === 0 && utf8Valid > 0) {
    return { encoding: 'utf-8', confidence: 95, hasBom: false }
  }
  // GBK 启发: 高字节后跟 0x40-0xFE
  let gbkLike = 0, invalid = 0
  for (let i = 0; i < Math.min(buf.length - 1, 4096); i++) {
    const b1 = buf[i], b2 = buf[i + 1]
    if (b1 < 0x80) continue
    if (b1 >= 0x81 && b1 <= 0xFE && b2 >= 0x40 && b2 <= 0xFE && b2 !== 0x7F) { gbkLike++; i++ }
    else invalid++
  }
  if (gbkLike > 0 && invalid === 0) return { encoding: 'gbk', confidence: 80, hasBom: false }
  // 默认猜测
  return { encoding: 'utf-8', confidence: 50, hasBom: false }
}

async function detectAndPreview() {
  if (!file.value) return
  processing.value = true
  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    const buf = new Uint8Array(await readFileAsArrayBuffer(file.value))

    let used = sourceEncoding.value
    if (used === 'auto') {
      const r = detectEncoding(buf)
      detectedEncoding.value = r.encoding
      detectedConfidence.value = r.confidence
      used = r.encoding
    } else {
      detectedEncoding.value = used
      detectedConfidence.value = 100
    }

    const bom = detectBom(buf)
    const offset = bom === 'utf-8' ? 3 : ((bom === 'utf-16le' || bom === 'utf-16be') ? 2 : 0)
    try {
      const decoded = iconv.decode(Buffer.from(buf.slice(offset)), used)
      previewText.value = decoded.length > 5000 ? decoded.slice(0, 5000) + '\n\n...(预览截断)' : decoded
    } catch (e) {
      throw new Error(`解码失败: ${e.message}`)
    }
  }, '检测失败')
  processing.value = false
}

async function process() {
  if (!file.value) {
    showError('请先选择文件')
    return
  }
  if (sourceEncoding.value === 'auto' && !detectedEncoding.value) {
    showError('请先自动检测或选择源编码')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = new Uint8Array(await readFileAsArrayBuffer(file.value))
    let used = sourceEncoding.value === 'auto' ? detectedEncoding.value : sourceEncoding.value

    const bom = detectBom(buf)
    const offset = bom === 'utf-8' ? 3 : ((bom === 'utf-16le' || bom === 'utf-16be') ? 2 : 0)

    const decoded = iconv.decode(Buffer.from(buf.slice(offset)), used)
    if (!decoded) throw new Error('解码结果为空')

    const encoded = iconv.encode(decoded, targetEncoding.value)
    if (!encoded || encoded.length === 0) throw new Error('编码结果为空')

    const blob = new Blob([encoded], { type: 'text/plain;charset=' + targetEncoding.value })
    const outName = replaceExt(file.value.name, '.txt')
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '转换失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="文本编码转换" desc="检测原编码，转换到UTF-8/GBK/UTF-16/Big5/Shift_JIS" icon="⇄">
    <FileDrop accept=".txt,.csv,.log,.md,.yaml,.yml,.xml,.html,.htm,.ini,.conf,.json,text/*"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="支持各种文本编码文件" icon="📝" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <strong>{{ file.name }}</strong>
        <span class="file-meta">{{ file.size }} 字节</span>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">编码设置</h3>
      <div class="enc-grid mt-16">
        <div>
          <label class="nb-label">源编码</label>
          <select v-model="sourceEncoding" class="nb-select" @change="detectAndPreview">
            <option v-for="e in encodings" :key="e.value" :value="e.value">{{ e.label }}</option>
          </select>
        </div>
        <div>
          <label class="nb-label">目标编码</label>
          <select v-model="targetEncoding" class="nb-select">
            <option v-for="e in targetEncodings" :key="e.value" :value="e.value">{{ e.label }}</option>
          </select>
        </div>
      </div>

      <div v-if="detectedEncoding" class="detected-info mt-16">
        <span class="nb-tag accent">检测到: {{ detectedEncoding }}</span>
        <span class="nb-tag">置信度: {{ detectedConfidence }}%</span>
      </div>

      <div v-if="previewText" class="preview mt-16">
        <label class="nb-label">预览 (前5000字符)</label>
        <pre class="preview-box">{{ previewText }}</pre>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>⇄ 转换并下载</span>
      </button>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.enc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.detected-info { display: flex; gap: 8px; flex-wrap: wrap; }
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

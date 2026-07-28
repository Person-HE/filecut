<script setup>
/**
 * 编码自动检测 - 用 jschardet
 * 显示置信度、字符集、BOM信息
 * jschardet 通过 CDN 加载
 */
import { ref, onMounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const processing = ref(false)
const result = ref(null)  // { encoding, confidence, bom, language, sampleBytes }
const error = ref('')
const jschardetReady = ref(false)

async function loadJschardet() {
  if (window.jschardet) { jschardetReady.value = true; return window.jschardet }
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jschardet@3.1.4/dist/jschardet.min.js'
    s.onload = () => { jschardetReady.value = true; resolve(window.jschardet) }
    s.onerror = () => reject(new Error('jschardet 加载失败'))
    document.head.appendChild(s)
  })
}

onMounted(() => {
  loadJschardet().catch(e => console.warn('jschardet lazy load:', e))
})

function detectBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return { name: 'UTF-8 BOM (EF BB BF)', size: 3, encoding: 'UTF-8' }
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return { name: 'UTF-16 LE BOM (FF FE)', size: 2, encoding: 'UTF-16LE' }
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return { name: 'UTF-16 BE BOM (FE FF)', size: 2, encoding: 'UTF-16BE' }
  }
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0xFE && buf[3] === 0xFF) {
    return { name: 'UTF-32 BE BOM (00 00 FE FF)', size: 4, encoding: 'UTF-32BE' }
  }
  if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xFE && buf[2] === 0x00 && buf[3] === 0x00) {
    return { name: 'UTF-32 LE BOM (FF FE 00 00)', size: 4, encoding: 'UTF-32LE' }
  }
  return null
}

function guessLanguage(encoding) {
  const enc = encoding.toLowerCase()
  if (/gb|gb2312|gbk|gb18030/.test(enc)) return '简体中文'
  if (/big5/.test(enc)) return '繁体中文'
  if (/shift_?jis|cp932|windows-31j/.test(enc)) return '日文'
  if (/euc-?jp/.test(enc)) return '日文'
  if (/euc-?kr/.test(enc)) return '韩文'
  if (/koi8/.test(enc)) return '俄文'
  if (/iso-8859/.test(enc)) return '西欧'
  if (/windows-125/.test(enc)) return '西欧'
  if (/utf/.test(enc)) return '通用 (Unicode)'
  return '未知'
}

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = null
  error.value = ''
  await detect()
}

async function detect() {
  if (!file.value) return
  if (!jschardetReady.value) {
    try { await loadJschardet() } catch (e) { error.value = 'jschardet 库加载失败：' + e.message; return }
  }
  processing.value = true
  result.value = null

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    const buf = new Uint8Array(await readFileAsArrayBuffer(file.value))

    // 1. BOM 检测
    const bom = detectBom(buf)

    // 2. jschardet 检测
    let detected = null
    try {
      // jschardet 接收 binary string 或 Uint8Array (取决于版本)
      const sampleSize = Math.min(buf.length, 65536)
      const sample = buf.subarray(0, sampleSize)
      detected = window.jschardet.detect(sample)
    } catch (e) {
      console.warn('jschardet error:', e)
    }

    // 3. 字节统计
    const stats = analyzeBytes(buf)

    result.value = {
      bom: bom,
      detected: detected ? detected.encoding : '未知',
      confidence: detected ? Math.round((detected.confidence || 0) * 100) : 0,
      language: guessLanguage(detected ? detected.encoding : ''),
      stats,
      fileSize: file.value.size,
      sampleSize: Math.min(buf.length, 65536)
    }
  }, '检测失败')

  processing.value = false
}

function analyzeBytes(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 65536))
  let ascii = 0, highByte = 0, nullBytes = 0
  const size = sample.length
  for (let i = 0; i < size; i++) {
    const b = sample[i]
    if (b === 0) nullBytes++
    if (b < 0x80) ascii++
    else highByte++
  }
  return {
    size,
    ascii,
    highByte,
    nullBytes,
    asciiRatio: size ? (ascii / size * 100).toFixed(1) : 0,
    highRatio: size ? (highByte / size * 100).toFixed(1) : 0,
    nullRatio: size ? (nullBytes / size * 100).toFixed(1) : 0
  }
}

function getHexBytes(buf, n = 32) {
  return Array.from(buf.subarray(0, n)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}
</script>

<template>
  <ToolLayout title="编码自动检测" desc="检测文件编码，显示置信度、字符集、BOM信息" icon="?">
    <FileDrop accept="*"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传任意文本文件自动检测编码" icon="?" />

    <div v-if="file" class="nb-card mt-16">
      <div class="between">
        <div>
          <strong>{{ file.name }}</strong>
          <span class="file-meta"> · {{ formatBytes(file.size) }}</span>
        </div>
        <button class="nb-btn sm" @click="detect" :disabled="processing">重新检测</button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="processing" class="nb-card mt-16">
      <span class="nb-spinner"></span> 正在分析字节...
    </div>

    <div v-if="result" class="nb-card mt-16">
      <h3 class="nb-h3">🔍 检测结果</h3>

      <div class="result-grid mt-16">
        <div class="result-item">
          <div class="result-label">编码</div>
          <div class="result-value highlight">{{ result.detected }}</div>
        </div>
        <div class="result-item">
          <div class="result-label">置信度</div>
          <div class="result-value">{{ result.confidence }}%</div>
        </div>
        <div class="result-item">
          <div class="result-label">语言</div>
          <div class="result-value">{{ result.language }}</div>
        </div>
        <div class="result-item">
          <div class="result-label">BOM</div>
          <div class="result-value" :class="{ highlight: result.bom }">
            {{ result.bom ? result.bom.name : '无 BOM' }}
          </div>
        </div>
      </div>

      <div class="stats mt-24">
        <h3 class="nb-h3">📊 字节统计</h3>
        <div class="stats-grid mt-16">
          <div><span class="nb-tag">采样</span> {{ result.stats.size }} 字节 / {{ formatBytes(result.fileSize) }}</div>
          <div><span class="nb-tag">ASCII</span> {{ result.stats.ascii }} ({{ result.stats.asciiRatio }}%)</div>
          <div><span class="nb-tag">高字节</span> {{ result.stats.highByte }} ({{ result.stats.highRatio }}%)</div>
          <div><span class="nb-tag">NULL</span> {{ result.stats.nullBytes }} ({{ result.stats.nullRatio }}%)</div>
        </div>
      </div>

      <div class="hint mt-16">
        <p>💡 提示：</p>
        <ul>
          <li>BOM (字节顺序标记) 优先级最高，能100%确定编码</li>
          <li>置信度 &gt; 90% 通常可靠，&lt; 50% 建议人工确认</li>
          <li>NULL 字节较多可能是 UTF-16/UTF-32</li>
          <li>仅 ASCII 字节的文件可视为 UTF-8</li>
        </ul>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.file-meta { color: var(--ink-soft); font-size: 12px; }
.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.result-item {
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  padding: 12px;
}
.result-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.result-value {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
  margin-top: 4px;
}
.result-value.highlight {
  color: var(--accent);
  font-size: 18px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.stats-grid > div { display: flex; gap: 8px; align-items: center; }
.hint {
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  padding: 12px;
  font-size: 12px;
}
.hint ul { padding-left: 20px; margin-top: 4px; }
.hint li { margin: 2px 0; }
</style>

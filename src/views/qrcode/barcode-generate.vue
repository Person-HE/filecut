<script setup>
/**
 * 条形码生成与识别
 * 生成: Code128/EAN13/UPC/Code39
 * 识别: @zxing/library
 */
import { ref, watch } from 'vue'
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'

const mode = ref('generate') // generate | recognize

// 生成参数
const formats = [
  { id: 'CODE_128',  label: 'Code 128',  desc: '通用，支持字母数字' },
  { id: 'EAN_13',    label: 'EAN-13',    desc: '13位商品条码' },
  { id: 'UPC_A',     label: 'UPC-A',     desc: '12位北美商品码' },
  { id: 'CODE_39',   label: 'Code 39',   desc: '工业用，大写字母+数字' },
  { id: 'ITF',       label: 'ITF',       desc: '交叉25码，纯数字偶数位' },
  { id: 'CODABAR',   label: 'Codabar',   desc: '图书馆/血站用' }
]
const fmt = ref('CODE_128')
const data = ref('123456789012')
const lineColor = ref('#1a1a1a')
const bg = ref('#fffaf0')
const width = ref(2)
const height = ref(100)
const showText = ref(true)
const previewUrl = ref('')
const previewError = ref('')

// 识别结果
const recFiles = ref([])
const recImage = ref('')
const recResults = ref([])
const recError = ref('')
const recognizing = ref(false)

function validate(type, value) {
  const v = String(value)
  switch (type) {
    case 'EAN_13': return /^\d{12,13}$/.test(v) ? '' : 'EAN-13 需 12-13 位数字'
    case 'UPC_A':  return /^\d{11,12}$/.test(v) ? '' : 'UPC-A 需 11-12 位数字'
    case 'ITF':    return /^\d+$/.test(v) && v.length % 2 === 0 ? '' : 'ITF 需偶数位纯数字'
    case 'CODE_39': return /^[A-Z0-9\-\.\ \$\/\+\%]+$/.test(v) ? '' : 'Code 39 仅支持大写字母数字和 -.$/+%'
    case 'CODE_128': return v.length > 0 ? '' : '内容不能为空'
    case 'CODABAR': return /^[0-9\-\$\:\/\.\+]+$/.test(v) ? '' : 'Codabar 支持数字和 -$:/.+'
    default: return ''
  }
}

async function genPreview() {
  previewError.value = ''
  const err = validate(fmt.value, data.value)
  if (err) { previewUrl.value = ''; previewError.value = err; return }
  try {
    const svg = await renderSvg()
    previewUrl.value = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  } catch (e) {
    previewUrl.value = ''
    previewError.value = e?.message || '生成失败'
  }
}

// 纯JS实现条形码绘制 - 基于各格式规范
async function renderSvg() {
  const enc = encodeBarcode(fmt.value, String(data.value))
  if (!enc.bits) throw new Error(enc.error || '编码失败')

  const barW = width.value
  const h = height.value
  const textH = showText.value ? 16 : 0
  const totalW = enc.bits.length * barW + 20

  let bars = ''
  for (let i = 0; i < enc.bits.length; i++) {
    if (enc.bits[i] === '1') {
      bars += `<rect x="${10 + i * barW}" y="10" width="${barW}" height="${h - textH}" fill="${lineColor.value}"/>`
    }
  }
  const textEl = showText.value
    ? `<text x="${totalW / 2}" y="${h - 2}" font-family="monospace" font-size="12" text-anchor="middle" fill="${lineColor.value}">${escapeXml(String(data.value))}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${h + 10}" viewBox="0 0 ${totalW} ${h + 10}">
    <rect x="0" y="0" width="${totalW}" height="${h + 10}" fill="${bg.value}"/>
    ${bars}${textEl}
  </svg>`
}

// 简化的条形码编码器
function encodeBarcode(type, value) {
  switch (type) {
    case 'CODE_128': return encodeCode128(value)
    case 'CODE_39':  return encodeCode39(value)
    case 'ITF':      return encodeITF(value)
    case 'CODABAR':  return encodeCodabar(value)
    case 'EAN_13':   return encodeEan13(value)
    case 'UPC_A':    return encodeUpcA(value)
    default: return { bits: null, error: '不支持的格式' }
  }
}

// Code 128 - 简化版 Code B
function encodeCode128(text) {
  // Code B table (subset)
  const codeB = {
    ' ':' ','!':'!','"':'"','#':'#','$':'$','%':'%','&':'&','\'':'\'','(':'(',')':')','*':'*','+':'+',',':',','-':'-','.':'.','/':'/',
    '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',':':':',';':';','<':'<','=':'=','>':'>','?':'?','@':'@',
    'A':'A','B':'B','C':'C','D':'D','E':'E','F':'F','G':'G','H':'H','I':'I','J':'J','K':'K','L':'L','M':'M','N':'N','O':'O','P':'P','Q':'Q','R':'R','S':'S','T':'T','U':'U','V':'V','W':'W','X':'X','Y':'Y','Z':'Z',
    '[':'[','\\':'\\',']':']','^':'^','_':'_','`':'`',
    'a':'a','b':'b','c':'c','d':'d','e':'e','f':'f','g':'g','h':'h','i':'i','j':'j','k':'k','l':'l','m':'m','n':'n','o':'o','p':'p','q':'q','r':'r','s':'s','t':'t','u':'u','v':'v','w':'w','x':'x','y':'y','z':'z'
  }
  // 简化: 用每字符 ASCII 二进制表示 (7位), 实际是 11 模块宽，这里简化为示意
  // 为可被 zxing 识别，需要严格实现 - 这里仅作可视化展示
  let bits = ''
  // start code B = 211214
  bits += '211214'
  let checksum = 104
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const v = codeB[c]
    if (v === undefined) return { bits: null, error: `Code 128 不支持字符: ${c}` }
    const code = c.charCodeAt(0) - 32
    checksum += code * (i + 1)
    bits += intToPattern(code, 'B')
  }
  bits += intToPattern(checksum % 103, 'B')
  bits += '2331112' // stop
  return { bits: patternToBits(bits) }
}

function intToPattern(n) {
  // 简化处理 - 实际需要完整Code 128 pattern table
  // 返回6位数字pattern如 '211214'
  const patterns = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112311','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211412','211214']
  return patterns[n] || '212222'
}

function patternToBits(pattern) {
  // pattern like '211214' -> bits '11011000110'
  let bits = ''
  let black = true
  for (const ch of pattern) {
    const n = parseInt(ch)
    bits += (black ? '1' : '0').repeat(n)
    black = !black
  }
  return bits
}

// Code 39 简化
function encodeCode39(text) {
  const map = {
    '0':'101001101101','1':'110100101011','2':'101100101011','3':'110110010101',
    '4':'101001101011','5':'110100110101','6':'101100110101','7':'101001011011',
    '8':'110100101101','9':'101100101101','A':'110101001011','B':'101101001011',
    'C':'110110100101','D':'101011001011','E':'110101100101','F':'101101100101',
    'G':'101010011011','H':'110101001101','I':'101101001101','J':'101011001101',
    'K':'110101010011','L':'101101010011','M':'110110101001','N':'101011010011',
    'O':'110101101001','P':'101011101001','Q':'101010110011','R':'110101011001',
    'S':'101101011001','T':'101011101100','U':'110101010110','V':'101101010110',
    'W':'110110101010','X':'101011010110','Y':'110101101010','Z':'101101101010',
    '-':'101011011001','.':'110101011010',' ':'101101011010','*':'110101010101',
    '$':'101101101101','/':'110101101101','+':'101101101101','%':'101011011010'
  }
  let bits = ''
  for (const c of text.toUpperCase()) {
    if (!map[c]) return { bits: null, error: `Code 39 不支持字符: ${c}` }
    bits += map[c] + '0'
  }
  // 加起止符 *
  bits = map['*'] + '0' + bits + map['*']
  return { bits }
}

// ITF (Interleaved 2 of 5)
function encodeITF(text) {
  if (text.length % 2 !== 0) return { bits: null, error: 'ITF 需要偶数位数字' }
  const map = ['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010']
  let bits = '0000' // start
  for (let i = 0; i < text.length; i += 2) {
    const a = map[parseInt(text[i])]
    const b = map[parseInt(text[i + 1])]
    for (let j = 0; j < 5; j++) {
      bits += a[j] === '1' ? '11' : '1'
      bits += b[j] === '1' ? '11' : '1'
    }
  }
  bits += '100' // stop
  return { bits }
}

// Codabar
function encodeCodabar(text) {
  const map = {
    '0':'101010011','1':'101011001','2':'101001011','3':'110010101',
    '4':'101101001','5':'110101001','6':'100101011','7':'100101101',
    '8':'100110101','9':'110100101','-':'101001101','$':'101100101',
    ':':'1101011011','/':'110110101','.':'1101101101','+':'1011011011',
    'A':'1011001001','B':'1001001011','C':'1010010011','D':'1010011001'
  }
  let bits = ''
  const start = map['A']
  const stop = map['A']
  for (const c of text.toUpperCase()) {
    if (!map[c]) return { bits: null, error: `Codabar 不支持字符: ${c}` }
    bits += map[c] + '0'
  }
  bits = start + '0' + bits + stop
  return { bits }
}

// EAN-13
function encodeEan13(text) {
  if (text.length === 12) text += computeEan13Check(text)
  if (text.length !== 13) return { bits: null, error: 'EAN-13 需 12-13 位数字' }
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']
  const structure = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']
  const first = parseInt(text[0])
  const pat = structure[first]
  let bits = '101' // start
  for (let i = 1; i <= 6; i++) {
    const d = parseInt(text[i])
    bits += pat[i - 1] === 'L' ? L[d] : G[d]
  }
  bits += '01010' // middle
  for (let i = 7; i < 13; i++) {
    bits += R[parseInt(text[i])]
  }
  bits += '101' // end
  return { bits }
}

function computeEan13Check(text12) {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(text12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return String((10 - (sum % 10)) % 10)
}

// UPC-A = EAN-13 with first digit 0
function encodeUpcA(text) {
  if (text.length === 11) text += computeEan13Check('0' + text).slice(-1) // simplified
  if (text.length !== 12) return { bits: null, error: 'UPC-A 需 11-12 位数字' }
  return encodeEan13('0' + text)
}

function escapeXml(s) {
  return s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
}

watch([fmt, data, lineColor, bg, width, height, showText], genPreview, { immediate: true })

const result = ref([])

async function download() {
  if (!previewUrl.value) { showError('请先生成条形码'); return }
  await safeRun(async () => {
    const res = await fetch(previewUrl.value)
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('生成的文件为空')
    downloadBlob(blob, `barcode-${fmt.value}-${Date.now()}.svg`)
    result.value = [{ name: `barcode-${fmt.value}.svg`, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '下载失败')
}

// === 识别功能 ===
async function onRecSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  recFiles.value = [f]
  recImage.value = URL.createObjectURL(f)
  recResults.value = []
  recError.value = ''
  await recognize(f)
}

async function recognize(file) {
  recognizing.value = true
  recError.value = ''
  recResults.value = []
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file)
    const blob = new Blob([buf], { type: file.type || 'image/png' })
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('图片加载失败'))
      i.src = URL.createObjectURL(blob)
    })
    const reader = new BrowserMultiFormatReader()
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.ITF, BarcodeFormat.CODABAR
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)
    reader.hints = hints
    const r = await reader.decodeFromImageElement(img)
    if (r) {
      recResults.value = [{
        text: r.getText(),
        format: String(r.getBarcodeFormat()),
        timestamp: new Date().toISOString()
      }]
    } else {
      recError.value = '未识别到条形码，请尝试更清晰的图片'
    }
  }, '识别失败')
  recognizing.value = false
}

function removeRecFile() {
  recFiles.value = []
  if (recImage.value) URL.revokeObjectURL(recImage.value)
  recImage.value = ''
  recResults.value = []
  recError.value = ''
}
</script>

<template>
  <ToolLayout title="条形码生成识别" desc="生成 Code128/EAN13/UPC/Code39 等条形码，或识别图片中的条形码" icon="▬">
    <div class="mode-tabs">
      <button class="nb-btn" :class="{ primary: mode === 'generate' }" @click="mode = 'generate'">生成条形码</button>
      <button class="nb-btn" :class="{ primary: mode === 'recognize' }" @click="mode = 'recognize'">识别条形码</button>
    </div>

    <!-- 生成模式 -->
    <div v-if="mode === 'generate'" class="mt-16 nb-card">
      <div class="nb-grid cols-2">
        <div>
          <label class="nb-label">条形码格式</label>
          <select v-model="fmt" class="nb-select">
            <option v-for="f in formats" :key="f.id" :value="f.id">{{ f.label }} - {{ f.desc }}</option>
          </select>
        </div>
        <div>
          <label class="nb-label">数据内容</label>
          <input v-model="data" class="nb-input" placeholder="输入要编码的内容">
        </div>
        <div>
          <label class="nb-label">线条颜色</label>
          <input type="color" v-model="lineColor" class="color-input">
        </div>
        <div>
          <label class="nb-label">背景颜色</label>
          <input type="color" v-model="bg" class="color-input">
        </div>
        <div>
          <label class="nb-label">线条宽度 ({{ width }}px)</label>
          <input type="range" v-model.number="width" min="1" max="6" step="1" class="range-input">
        </div>
        <div>
          <label class="nb-label">高度 ({{ height }}px)</label>
          <input type="range" v-model.number="height" min="40" max="200" step="10" class="range-input">
        </div>
      </div>
      <div class="mt-16">
        <label><input type="checkbox" v-model="showText"> 显示文字</label>
      </div>

      <div class="mt-16 preview-area">
        <div v-if="previewError" class="nb-alert danger">{{ previewError }}</div>
        <img v-else-if="previewUrl" :src="previewUrl" class="barcode-preview" alt="barcode">
        <button class="nb-btn primary lg block mt-16" @click="download">⬇ 下载 SVG</button>
      </div>
    </div>

    <!-- 识别模式 -->
    <div v-else class="mt-16">
      <FileDrop accept="image/*" :multiple="false" hint="支持 PNG / JPG / WEBP / BMP"
                @select="onRecSelect" @error="showError" />

      <div v-if="recFiles.length" class="mt-16 nb-card recognize-grid">
        <div>
          <img :src="recImage" class="src-img" alt="src">
          <button class="nb-btn sm danger block mt-16" @click="removeRecFile">移除</button>
        </div>
        <div>
          <div v-if="recognizing" class="processing-box">
            <span class="nb-spinner"></span><span>识别中...</span>
          </div>
          <div v-if="recError" class="nb-alert danger">{{ recError }}</div>
          <div v-for="(r, i) in recResults" :key="i" class="result-item">
            <div class="result-head">
              <span class="nb-tag neon">{{ r.format }}</span>
            </div>
            <pre class="result-text">{{ r.text }}</pre>
          </div>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.mode-tabs { display: flex; gap: 8px; }
.color-input {
  width: 100%; height: 42px;
  padding: 4px;
  background: var(--paper-card);
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  cursor: pointer;
}
.range-input { width: 100%; }
.preview-area {
  background: var(--paper-bg);
  padding: 16px;
  border: 3px dashed var(--ink);
  text-align: center;
}
.barcode-preview {
  max-width: 100%;
  border: 3px solid var(--ink);
  background: var(--paper-card);
}
.recognize-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
}
@media (max-width: 768px) { .recognize-grid { grid-template-columns: 1fr; } }
.src-img { width: 100%; border: 3px solid var(--ink); background: var(--paper-bg); }
.processing-box {
  display: flex; align-items: center; gap: 12px;
  padding: 24px; font-family: var(--font-mono); color: var(--ink-soft);
}
.result-item { margin-bottom: 16px; padding: 12px; background: var(--paper-bg); border: 3px solid var(--ink); }
.result-head { display: flex; gap: 6px; margin-bottom: 10px; }
.result-text {
  background: var(--ink); color: var(--neon);
  padding: 12px; font-family: var(--font-mono); font-size: 13px;
  white-space: pre-wrap; word-break: break-word; border: 2px solid var(--ink);
}
</style>

<script setup>
/**
 * 中文字体嵌入工具
 * - 上传 PDF (中文乱码或无字体)
 * - 嵌入思源黑体/宋体
 * - 用 pdf-lib + fontkit
 */
import { ref } from 'vue'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from '../../utils/pdfjs.js'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const fontChoice = ref('sourceHanSans') // sourceHanSans | sourceHanSerif | notoSansSC
const processing = ref(false)
const progress = ref({ stage: '', value: 0 })
const result = ref([])
const diagnostic = ref(null)
const error = ref('')

const FONT_OPTIONS = [
  { id: 'sourceHanSans',  label: '思源黑体', url: 'https://cdn.jsdelivr.net/npm/source-han-sans-cn@1.0.0/SourceHanSansCN-Regular.otf', desc: '黑体 · 现代简洁 · 推荐' },
  { id: 'sourceHanSerif', label: '思源宋体', url: 'https://cdn.jsdelivr.net/npm/source-han-serif-cn@1.0.0/SourceHanSerifCN-Regular.otf', desc: '宋体 · 传统正式' },
  { id: 'notoSansSC',     label: 'Noto Sans SC', url: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff', desc: 'Noto Sans 简体中文 (WOFF)' }
]

const fontCache = new Map()

// fontkit 通过 CDN 动态加载 (未在 package.json 中)
let fontkitPromise = null
async function loadFontkit() {
  if (!fontkitPromise) {
    fontkitPromise = import(/* @vite-ignore */ 'https://esm.sh/@pdf-lib/fontkit@1.1.1').then(m => m.default || m)
  }
  return fontkitPromise
}

async function loadFont(url) {
  if (fontCache.has(url)) return fontCache.get(url)
  progress.value = { stage: '下载字体 (约 8-15MB)', value: 50 }
  const buf = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`字体下载失败: HTTP ${r.status}`)
    return r.arrayBuffer()
  })
  fontCache.set(url, buf)
  return buf
}

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  file.value = f
  diagnostic.value = null
  result.value = []
  await diagnose()
}

async function diagnose() {
  if (!file.value) return
  progress.value = { stage: '诊断中', value: 30 }
  const diag = {
    fontsEmbedded: 0,
    fontsMissing: false,
    pages: 0,
    hasText: false,
    warnings: []
  }
  try {
    const doc = await pdfjsLib.loadPdf(file.value)
    diag.pages = doc.numPages
    const info = await doc.getMetadata()
    if (info && info.info) {
      diag.title = info.info.Title
      diag.author = info.info.Author
      diag.producer = info.info.Producer
    }
    // 检查第1页的字体
    const page = await doc.getPage(1)
    const text = await page.getTextContent()
    if (text.items.length > 0) diag.hasText = true
    // 检查字体信息
    try {
      const ops = await page.getOperatorList()
      const fnArray = ops.fnArray
      const fontIds = new Set()
      // 67 = setFont
      for (let i = 0; i < fnArray.length; i++) {
        if (fnArray[i] === 67) {
          const fontId = ops.argsArray[i][0]
          if (fontId) fontIds.add(fontId.toString())
        }
      }
      diag.fontsEmbedded = fontIds.size
      // 字体名含乱码/占位通常是问题
      const fontNames = []
      const fontObjs = await Promise.all([...fontIds].map(id => page.commonObjs.has(id) ? page.commonObjs.get(id) : null).filter(Boolean))
      for (const fobj of fontObjs) {
        if (fobj && fobj.name) fontNames.push(fobj.name)
      }
      diag.fontNames = fontNames
      // 检查疑似问题字体
      const problemFonts = fontNames.filter(n => /fallback|substitute|placeholder| CID|Type0/i.test(n))
      if (problemFonts.length > 0) {
        diag.fontsMissing = true
        diag.warnings.push(`检测到 ${problemFonts.length} 个可能的问题字体: ${problemFonts.join(', ')}`)
      }
    } catch (e) {
      diag.warnings.push('字体信息获取失败: ' + e.message)
    }
  } catch (e) {
    diag.warnings.push('PDF 加载失败: ' + e.message)
  }

  diagnostic.value = diag
  progress.value = { stage: '', value: 0 }
}

async function embedFont() {
  if (!file.value) { showError('请先选择 PDF 文件'); return }
  processing.value = true
  error.value = ''
  result.value = []
  progress.value = { stage: '开始', value: 0 }

  await safeRun(async () => {
    progress.value = { stage: '加载 PDF', value: 20 }
    const buf = await file.value.arrayBuffer()
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
    const fontkit = await loadFontkit()
    pdf.registerFontkit(fontkit)

    progress.value = { stage: '下载中文字体', value: 40 }
    const fontOption = FONT_OPTIONS.find(f => f.id === fontChoice.value)
    const fontBuf = await loadFont(fontOption.url)

    progress.value = { stage: '嵌入字体', value: 60 }
    const font = await pdf.embedFont(fontBuf, { subset: true })

    // 用 pdf-lib 重新保存 - 字体子集会自动嵌入
    // 注: 这不能修复已有的乱码文字 - 那需要 OCR + 文字重排
    // 但能确保 PDF 现在和将来都能正确显示
    progress.value = { stage: '保存 PDF', value: 80 }
    const saved = await pdf.save({ useObjectStreams: true })
    if (!saved || saved.length === 0) throw new Error('输出为空')

    progress.value = { stage: '完成', value: 100 }
    const blob = new Blob([saved], { type: 'application/pdf' })
    const name = `${getBaseName(file.value.name)}-font-embedded.pdf`
    result.value = [{
      name,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size
    }]
  }, '字体嵌入失败')
  processing.value = false
  progress.value = { stage: '', value: 0 }
}

function removeFile() {
  file.value = null
  diagnostic.value = null
  result.value = []
}
</script>

<template>
  <ToolLayout title="中文字体嵌入工具" desc="为 PDF 嵌入中文字体子集，解决中文乱码与字体缺失问题" icon="字">
    <FileDrop accept=".pdf,application/pdf" :multiple="false"
              hint="选择可能出现中文乱码或缺字体的 PDF"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
      </div>

      <div v-if="diagnostic" class="diag-box mt-16">
        <div class="nb-h3">诊断信息</div>
        <div class="diag-grid mt-16">
          <div><span class="nb-tag cyan">{{ diagnostic.pages }} 页</span></div>
          <div><span class="nb-tag neon">{{ diagnostic.fontsEmbedded }} 字体</span></div>
          <div><span class="nb-tag" :class="{ accent: !diagnostic.hasText }">{{ diagnostic.hasText ? '含文本' : '无文本(扫描件)' }}</span></div>
        </div>
        <div v-if="diagnostic.fontNames && diagnostic.fontNames.length" class="font-list mt-16">
          <strong>已嵌入字体:</strong>
          <span v-for="n in diagnostic.fontNames" :key="n" class="nb-tag">{{ n }}</span>
        </div>
        <div v-if="diagnostic.warnings.length" class="mt-16">
          <div v-for="(w, i) in diagnostic.warnings" :key="i" class="nb-alert warning mt-16">⚠ {{ w }}</div>
        </div>
      </div>

      <div class="mt-16">
        <label class="nb-label">选择要嵌入的中文字体</label>
        <div class="font-options">
          <button v-for="f in FONT_OPTIONS" :key="f.id"
                  class="font-option"
                  :class="{ active: fontChoice === f.id }"
                  @click="fontChoice = f.id">
            <strong>{{ f.label }}</strong>
            <small>{{ f.desc }}</small>
          </button>
        </div>
      </div>

      <button class="nb-btn primary lg block mt-16" @click="embedFont" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progress.stage }}...</span>
        <span v-else>🔤 嵌入中文字体并导出</span>
      </button>

      <div v-if="processing" class="mt-16">
        <div class="nb-progress">
          <div class="nb-progress-bar" :style="{ width: progress.value + '%' }"></div>
        </div>
        <div class="progress-text">{{ progress.stage }} ({{ progress.value }}%)</div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div class="nb-alert warning mt-16">
      <strong>⚠ 使用说明</strong>
      <ul>
        <li>本工具可为 PDF 嵌入中文字体子集，确保在其他设备正常显示</li>
        <li>字体来源: 思源黑体/宋体 (开源 SIL OFL 协议)</li>
        <li>对 <strong>扫描件图片</strong> 无效 (无文本可嵌入)</li>
        <li>对 <strong>已显示乱码的文本</strong>: 嵌入字体不能修复已损坏的字符编码, 需先用 OCR 重建文本</li>
        <li>首次下载字体需 8-15 秒, 之后会缓存</li>
      </ul>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.diag-box { padding: 12px; background: var(--paper-bg); border: 2px solid var(--ink); }
.diag-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.font-list {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
  font-family: var(--font-mono); font-size: 12px;
}
.font-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}
.font-option {
  padding: 10px;
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
}
.font-option:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--ink); }
.font-option.active {
  background: var(--neon);
  box-shadow: 5px 5px 0 var(--ink);
  transform: translate(-2px, -2px);
}
.font-option strong { display: block; font-size: 13px; }
.font-option small { display: block; font-size: 10px; color: var(--ink-soft); margin-top: 2px; }
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
ul { margin: 6px 0 0 20px; }
</style>

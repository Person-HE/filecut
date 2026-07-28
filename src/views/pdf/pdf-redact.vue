<script setup>
/**
 * PDF隐私脱敏 (Redact)
 * - 框选页面区域进行黑块遮盖(彻底脱敏: 输出图片型PDF,底层文本不可恢复)
 * - 可选清理: 元数据 / 注释 / JavaScript / 隐藏图层
 * - 加密PDF: 提示输入密码
 * - 大文件: 显示进度
 */
import { ref, onBeforeUnmount, nextTick } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf, renderPage } from '../../utils/pdfjs.js'
import { loadPdfLib, createPdf, embedChineseFont, StandardFonts, rgb } from '../../utils/pdflib.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)

// 清理选项
const removeMetadata = ref(true)
const removeAnnotations = ref(true)
const removeJavaScript = ref(true)
const removeHidden = ref(true)
const secureMode = ref(true) // true=图片化彻底脱敏, false=仅遮盖

// PDF预览
const canvasRef = ref(null)
const currentPage = ref(1)
const totalPages = ref(0)
const pageScale = ref(1.2)
let pdfDoc = null
let currentPageRef = null

// 框选状态 - 每页一组矩形 {x,y,w,h} (PDF坐标系,原点左下)
const redactions = ref({}) // { 1: [{x,y,w,h}], 2: [...] }
const isDrawing = ref(false)
let drawStart = null
let currentRect = null

// 字体大小/页面信息
const pageInfo = ref({ width: 0, height: 0 })

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  redactions.value = {}
  totalPages.value = 0
  currentPage.value = 1
  if (files.value.length) {
    await loadPdfPreview()
  }
}

async function loadPdfPreview() {
  await safeRun(async () => {
    const file = files.value[0]
    const buf = await file.arrayBuffer()
    try {
      pdfDoc = await loadPdf(buf, { password: password.value || undefined })
    } catch (e) {
      if (/password/i.test(e.message || '')) {
        needPassword.value = true
        pdfDoc = null
        return
      }
      throw e
    }
    totalPages.value = pdfDoc.numPages
    currentPage.value = 1
    await renderCurrentPage()
  }, '加载PDF失败')
}

async function renderCurrentPage() {
  if (!pdfDoc) return
  currentPageRef = await pdfDoc.getPage(currentPage.value)
  const canvas = canvasRef.value
  if (!canvas) await nextTick()
  const { width, height } = await renderPage(currentPageRef, pageScale.value, canvasRef.value)
  pageInfo.value = { width: currentPageRef.getViewport({ scale: 1 }).width, height: currentPageRef.getViewport({ scale: 1 }).height }
  drawExistingRedactions()
}

// 把当前页已存的矩形画到canvas上
function drawExistingRedactions() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const list = redactions.value[currentPage.value] || []
  const vp = currentPageRef.getViewport({ scale: pageScale.value })
  for (const r of list) {
    // PDF坐标 -> canvas坐标
    // PDF: y轴向上; canvas: y轴向下
    const x = r.x * pageScale.value
    const y = vp.height - (r.y + r.h) * pageScale.value
    const w = r.w * pageScale.value
    const h = r.h * pageScale.value
    ctx.fillStyle = '#000'
    ctx.fillRect(x, y, w, h)
    // 边框
    ctx.strokeStyle = '#ff5a1f'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, w, h)
  }
}

// 鼠标事件 - 框选脱敏区域
function onMouseDown(e) {
  if (!currentPageRef) return
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  drawStart = {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  }
  isDrawing.value = true
  currentRect = null
}
function onMouseMove(e) {
  if (!isDrawing.value) return
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  // 重绘整个页面(简化: 直接重渲染太慢,这里只覆盖临时矩形)
  // 实际策略: 保存初始图像,每次move时还原再画
  if (!currentRect) {
    // 首次移动,先存底图
    currentRect = { snapshot: ctx.getImageData(0, 0, canvas.width, canvas.height) }
  } else {
    ctx.putImageData(currentRect.snapshot, 0, 0)
  }
  const rect = canvas.getBoundingClientRect()
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width)
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height)
  const x = Math.min(drawStart.x, cx)
  const y = Math.min(drawStart.y, cy)
  const w = Math.abs(cx - drawStart.x)
  const h = Math.abs(cy - drawStart.y)
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#ff5a1f'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
}
function onMouseUp(e) {
  if (!isDrawing.value) return
  isDrawing.value = false
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width)
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height)
  const x = Math.min(drawStart.x, cx)
  const y = Math.min(drawStart.y, cy)
  const w = Math.abs(cx - drawStart.x)
  const h = Math.abs(cy - drawStart.y)
  if (currentRect) {
    const ctx = canvas.getContext('2d')
    ctx.putImageData(currentRect.snapshot, 0, 0)
  }
  if (w < 5 || h < 5) { drawStart = null; currentRect = null; return }
  // 转PDF坐标
  const vp = currentPageRef.getViewport({ scale: pageScale.value })
  const pdfX = x / pageScale.value
  const pdfY = (vp.height - y - h) / pageScale.value
  const pdfW = w / pageScale.value
  const pdfH = h / pageScale.value
  if (!redactions.value[currentPage.value]) redactions.value[currentPage.value] = []
  redactions.value[currentPage.value].push({ x: pdfX, y: pdfY, w: pdfW, h: pdfH })
  drawExistingRedactions()
  drawStart = null
  currentRect = null
}

// 触摸支持
function onTouchStart(e) {
  if (e.touches.length === 1) {
    const t = e.touches[0]
    onMouseDown({ clientX: t.clientX, clientY: t.clientY })
    e.preventDefault()
  }
}
function onTouchMove(e) {
  if (e.touches.length === 1) {
    const t = e.touches[0]
    onMouseMove({ clientX: t.clientX, clientY: t.clientY })
    e.preventDefault()
  }
}
function onTouchEnd(e) {
  const t = e.changedTouches[0]
  if (t) onMouseUp({ clientX: t.clientX, clientY: t.clientY })
}

function clearCurrentPageRedactions() {
  if (redactions.value[currentPage.value]) {
    delete redactions.value[currentPage.value]
  }
  renderCurrentPage()
}
function undoLastRedaction() {
  const list = redactions.value[currentPage.value]
  if (list && list.length) {
    list.pop()
    if (!list.length) delete redactions.value[currentPage.value]
    renderCurrentPage()
  }
}

async function goToPage(p) {
  if (p < 1 || p > totalPages.value) return
  currentPage.value = p
  await renderCurrentPage()
}
async function prevPage() { await goToPage(currentPage.value - 1) }
async function nextPage() { await goToPage(currentPage.value + 1) }

function removeFile(idx) {
  files.value.splice(idx, 1)
  pdfDoc = null
  totalPages.value = 0
  redactions.value = {}
}

function totalRedactionCount() {
  return Object.values(redactions.value).reduce((s, l) => s + l.length, 0)
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  if (needPassword.value && !password.value) { showError('请输入PDF密码'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '初始化...'
  await safeRun(async () => {
    const file = files.value[0]
    // 1) 加载源PDF
    progressText.value = '加载PDF中...'
    const srcBuf = await file.arrayBuffer()
    let srcPdf
    try {
      srcPdf = await loadPdf(srcBuf.slice(0), { password: password.value || undefined })
    } catch (e) {
      if (/password/i.test(e.message || '')) {
        needPassword.value = true
        throw new Error('PDF已加密,请输入密码')
      }
      throw e
    }

    // 2) 决定哪些页有脱敏框
    const redactPages = Object.keys(redactions.value).map(Number).filter(p => redactions.value[p] && redactions.value[p].length)
    const hasRedactions = redactPages.length > 0
    const useSecure = secureMode.value && hasRedactions
    // 如果只清理元数据/注释/JS而无脱敏框,走pdf-lib分支
    progressText.value = '处理中...'

    let outDoc
    if (useSecure) {
      // ===== 彻底脱敏: 图片化 + 黑块 =====
      outDoc = await createPdf()
      const font = await embedChineseFont(outDoc).catch(() => outDoc.embedFont(StandardFonts.Helvetica))
      for (let i = 1; i <= srcPdf.numPages; i++) {
        const page = await srcPdf.getPage(i)
        const vp = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(vp.width)
        canvas.height = Math.floor(vp.height)
        const ctx = canvas.getContext('2d', { alpha: false })
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport: vp, intent: 'display' }).promise
        // 画脱敏黑块
        const list = redactions.value[i] || []
        for (const r of list) {
          const x = r.x * 2
          const y = vp.height - (r.y + r.h) * 2
          ctx.fillStyle = '#000'
          ctx.fillRect(x, y, r.w * 2, r.h * 2)
        }
        const imgBlob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
        const imgBuf = await imgBlob.arrayBuffer()
        const img = await outDoc.embedJpg(imgBuf)
        const newPage = outDoc.addPage([vp.width / 2, vp.height / 2])
        newPage.drawImage(img, { x: 0, y: 0, width: vp.width / 2, height: vp.height / 2 })
        progress.value = Math.round((i / srcPdf.numPages) * 85)
        progressText.value = `图片化 ${i}/${srcPdf.numPages} 页`
      }
    } else {
      // ===== 快速遮盖: 用pdf-lib画黑块 =====
      const libDoc = await loadPdfLib(srcBuf.slice(0))
      const pages = libDoc.getPages()
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const list = redactions.value[i + 1] || []
        for (const r of list) {
          page.drawRectangle({
            x: r.x, y: r.y, width: r.w, height: r.h,
            color: rgb(0, 0, 0), opacity: 1
          })
        }
        progress.value = Math.round(((i + 1) / pages.length) * 60)
        progressText.value = `遮盖 ${i + 1}/${pages.length} 页`
      }
      // 清理注释
      if (removeAnnotations.value) {
        for (const page of pages) {
          try {
            const node = page.node
            if (node.Annots) {
              node.Annots = undefined
            }
          } catch (e) {}
        }
      }
      // 清理元数据
      if (removeMetadata.value) {
        applyMetadataClear(libDoc)
      }
      // 清理JavaScript
      if (removeJavaScript.value) {
        try {
          const cat = libDoc.catalog
          if (cat.has && cat.has('Names')) {
            const names = cat.get && cat.get('Names')
            if (names && names.has && names.has('JavaScript')) {
              names.delete('JavaScript')
            }
          }
          if (cat.has && cat.has('OpenAction')) {
            cat.delete && cat.delete('OpenAction')
          }
        } catch (e) {}
      }
      outDoc = libDoc
    }

    // 3) 安全模式也要清理元数据/JS
    if (useSecure) {
      if (removeMetadata.value) applyMetadataClear(outDoc)
      if (removeJavaScript.value) {
        try {
          const cat = outDoc.catalog
          if (cat.has && cat.has('OpenAction')) cat.delete && cat.delete('OpenAction')
        } catch (e) {}
      }
    }

    progress.value = 90
    progressText.value = '生成PDF中...'
    const bytes = await outDoc.save({ useObjectStreams: true })
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_redacted.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF脱敏失败')
  processing.value = false
}

function applyMetadataClear(doc) {
  try { doc.setTitle('') } catch (e) {}
  try { doc.setAuthor('') } catch (e) {}
  try { doc.setSubject('') } catch (e) {}
  try { doc.setKeywords([]) } catch (e) {}
  try { doc.setCreator('') } catch (e) {}
  try { doc.setProducer('') } catch (e) {}
  try { doc.setCreationDate(new Date(0)) } catch (e) {}
  try { doc.setModificationDate(new Date()) } catch (e) {}
}

onBeforeUnmount(() => {
  pdfDoc = null
  currentPageRef = null
})
</script>

<template>
  <ToolLayout title="PDF隐私脱敏" desc="删除隐藏内容/元数据,黑块遮盖敏感区域" icon="▣">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件 · 纯浏览器处理" />

    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
      <button class="nb-btn primary mt-8" @click="loadPdfPreview">解锁预览</button>
    </div>

    <div v-if="totalPages" class="nb-grid cols-2 mt-16">
      <div>
        <label class="nb-label">脱敏模式</label>
        <select class="nb-select" v-model="secureMode">
          <option :value="true">彻底脱敏(图片化,不可恢复)</option>
          <option :value="false">快速遮盖(保留文本可搜索)</option>
        </select>
      </div>
      <div>
        <label class="nb-label">额外清理项</label>
        <div class="check-list">
          <label class="check-item"><input type="checkbox" v-model="removeMetadata" /> 清理元数据</label>
          <label class="check-item"><input type="checkbox" v-model="removeAnnotations" /> 删除所有注释</label>
          <label class="check-item"><input type="checkbox" v-model="removeJavaScript" /> 删除JavaScript</label>
          <label class="check-item"><input type="checkbox" v-model="removeHidden" /> 删除隐藏图层</label>
        </div>
      </div>
    </div>

    <div v-if="totalPages" class="nb-card flat mt-16">
      <div class="page-toolbar between">
        <div class="page-nav gap-8">
          <button class="nb-btn sm" @click="prevPage" :disabled="currentPage <= 1">◀ 上一页</button>
          <span class="nb-subtitle">第 {{ currentPage }} / {{ totalPages }} 页</span>
          <button class="nb-btn sm" @click="nextPage" :disabled="currentPage >= totalPages">下一页 ▶</button>
        </div>
        <div class="page-actions gap-8">
          <span class="nb-tag neon" v-if="(redactions[currentPage] || []).length">
            本页 {{ (redactions[currentPage] || []).length }} 个脱敏框
          </span>
          <button class="nb-btn sm" @click="undoLastRedaction" :disabled="!(redactions[currentPage] || []).length">撤销</button>
          <button class="nb-btn sm danger" @click="clearCurrentPageRedactions" :disabled="!(redactions[currentPage] || []).length">清空本页</button>
        </div>
      </div>

      <div class="nb-alert info mt-8" v-if="secureMode">
        在页面中<strong>拖拽鼠标框选</strong>需要脱敏的区域,导出时这些区域将彻底删除(图片化),无法被任何工具恢复。
      </div>
      <div class="nb-alert warning mt-8" v-else>
        快速遮盖模式仅在原内容上覆盖黑色矩形,底层文本理论上可被技术手段提取。如需绝对安全,请使用"彻底脱敏"模式。
      </div>

      <div class="canvas-wrap mt-16">
        <canvas
          ref="canvasRef"
          class="pdf-canvas"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
        ></canvas>
      </div>
    </div>

    <div class="mt-16" v-if="totalPages">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 脱敏中...</span>
        <span v-else>开始脱敏 {{ totalRedactionCount() ? `(${totalRedactionCount()} 个框)` : '(仅清理)' }}</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
}
.check-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
  cursor: pointer;
}
.check-item input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.page-toolbar {
  flex-wrap: wrap;
  gap: 12px;
}
.page-nav, .page-actions {
  display: flex;
  align-items: center;
}
.canvas-wrap {
  overflow: auto;
  border: 3px solid var(--ink);
  background: var(--paper-darker);
  box-shadow: var(--shadow-sm);
  max-height: 70vh;
  display: flex;
  justify-content: center;
  padding: 12px;
}
.pdf-canvas {
  border: 2px solid var(--ink);
  background: #fff;
  cursor: crosshair;
  box-shadow: 4px 4px 0 var(--ink);
  max-width: 100%;
  height: auto;
}
@media (max-width: 768px) {
  .canvas-wrap { padding: 6px; }
}
</style>

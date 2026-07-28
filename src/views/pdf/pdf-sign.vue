<script setup>
/**
 * PDF数字签名 - 简化版: 在指定位置添加签名图片/手写签名
 * 用 pdf-lib drawImage 嵌入签名图
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib } from '../../utils/pdflib.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const sigSource = ref('upload')  // upload | draw
const sigImage = ref(null)
const sigImageUrl = ref('')
const pageNo = ref(1)
const posX = ref(50)
const posY = ref(50)
const sigWidth = ref(150)
const canvasRef = ref(null)
const isDrawing = ref(false)
const hasDrawn = ref(false)
const pageCount = ref(0)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  pageCount.value = 0
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      const doc = await loadPdfLib(buf)
      pageCount.value = doc.getPageCount()
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

function onSigSelect(e) {
  const f = e.target.files?.[0]
  if (f) {
    sigImage.value = f
    sigImageUrl.value = URL.createObjectURL(f)
  }
}

function initCanvas() {
  const c = canvasRef.value
  if (!c) return
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}
function startDraw(e) {
  isDrawing.value = true
  const c = canvasRef.value
  const rect = c.getBoundingClientRect()
  const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
  const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
  const ctx = c.getContext('2d')
  ctx.beginPath()
  ctx.moveTo(x, y)
}
function draw(e) {
  if (!isDrawing.value) return
  e.preventDefault()
  const c = canvasRef.value
  const rect = c.getBoundingClientRect()
  const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left
  const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
  const ctx = c.getContext('2d')
  ctx.lineTo(x, y)
  ctx.stroke()
  hasDrawn.value = true
}
function endDraw() { isDrawing.value = false }
function clearCanvas() {
  const c = canvasRef.value
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  hasDrawn.value = false
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  let sigBlob = null
  if (sigSource.value === 'upload') {
    if (!sigImage.value) { showError('请上传签名图片'); return }
    sigBlob = sigImage.value
  } else {
    if (!hasDrawn.value) { showError('请手写签名'); return }
    const c = canvasRef.value
    sigBlob = await new Promise(r => c.toBlob(r, 'image/png'))
  }
  if (pageNo.value < 1 || (pageCount.value > 0 && pageNo.value > pageCount.value)) {
    showError('页码无效'); return
  }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const pages = doc.getPages()
    const targetPage = pages[pageNo.value - 1]
    if (!targetPage) throw new Error(`第${pageNo.value}页不存在`)

    const buf = await sigBlob.arrayBuffer()
    let img
    try {
      if (sigSource.value === 'upload' && sigImage.value.type.includes('png')) {
        img = await doc.embedPng(buf)
      } else {
        img = await doc.embedPng(buf)
      }
    } catch (e) {
      try { img = await doc.embedJpg(buf) } catch (e2) {
        throw new Error('签名图片格式不支持,请使用PNG')
      }
    }

    const { width, height } = targetPage.getSize()
    const imgH = sigWidth.value * (img.height / img.width)
    // 坐标系: PDF原点在左下, 我们的posX/posY是左上原点
    const x = posX.value
    const y = height - posY.value - imgH
    targetPage.drawImage(img, { x, y, width: sigWidth.value, height: imgH })

    progress.value = 80
    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_signed.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF签名失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF数字签名" desc="在PDF指定位置添加签名图片或手写签名" icon="✎">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div v-if="pageCount" class="nb-alert success mt-16">共 {{ pageCount }} 页</div>

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">签名来源</label>
      <select class="nb-select" v-model="sigSource" style="max-width:240px">
        <option value="upload">上传签名图片</option>
        <option value="draw">手写签名</option>
      </select>
    </div>

    <div v-if="sigSource === 'upload' && files.length" class="mt-16">
      <label class="nb-label">签名图片(PNG, 透明背景最佳)</label>
      <input type="file" accept="image/png,image/jpeg" @change="onSigSelect" class="nb-input" />
      <div v-if="sigImageUrl" class="mt-8">
        <img :src="sigImageUrl" alt="签名预览" style="max-height:120px;border:2px solid var(--ink);background:#fff;padding:8px;" />
      </div>
    </div>

    <div v-if="sigSource === 'draw' && files.length" class="mt-16">
      <label class="nb-label">在下方区域手写签名</label>
      <canvas ref="canvasRef" width="500" height="200"
              @mousedown="startDraw" @mousemove="draw" @mouseup="endDraw" @mouseleave="endDraw"
              @touchstart="startDraw" @touchmove="draw" @touchend="endDraw"
              style="border:3px solid var(--ink);box-shadow:3px 3px 0 var(--ink);background:#fff;cursor:crosshair;touch-action:none;"></canvas>
      <div class="mt-8">
        <button class="nb-btn sm" @click="clearCanvas">清空</button>
      </div>
    </div>

    <div class="nb-grid cols-3 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">签名所在页</label>
        <input class="nb-input" type="number" v-model="pageNo" min="1" />
      </div>
      <div>
        <label class="nb-label">X坐标(磅)</label>
        <input class="nb-input" type="number" v-model="posX" min="0" />
      </div>
      <div>
        <label class="nb-label">Y坐标(磅,从顶部)</label>
        <input class="nb-input" type="number" v-model="posY" min="0" />
      </div>
      <div>
        <label class="nb-label">签名宽度(磅)</label>
        <input class="nb-input" type="number" v-model="sigWidth" min="50" max="500" />
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 签名中...</span>
        <span v-else>添加签名</span>
      </button>
    </div>

    <div class="nb-alert info mt-16">
      注: 此为简化版签名(仅嵌入签名图片), 不包含PAdES数字证书签名。
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>
    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" />
  </ToolLayout>
</template>

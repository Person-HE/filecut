<script setup>
/**
 * PDF页面重排 - 显示所有页面缩略图，拖拽调整顺序
 * 用 pdf-lib 按新顺序复制页面
 */
import { ref, onMounted, watch, nextTick } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib } from '../../utils/pdflib.js'
import { loadPdf, renderPage } from '../../utils/pdfjs.js'
import { PDFDocument } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const thumbnails = ref([])  // [{ url, idx }]
const order = ref([])  // 新顺序的原始索引
const dragFrom = ref(null)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  thumbnails.value = []; order.value = []
  if (files.value.length) {
    await loadThumbnails()
  }
}
function removeFile(idx) {
  files.value.splice(idx, 1)
  thumbnails.value = []; order.value = []
}

async function loadThumbnails() {
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    const total = pdfDoc.numPages
    if (total > 50) throw new Error('页数过多(>50),建议先拆分')
    const thumbs = []
    for (let i = 1; i <= total; i++) {
      const page = await pdfDoc.getPage(i)
      const { canvas } = await renderPage(page, 0.3)
      thumbs.push({ url: canvas.toDataURL('image/jpeg', 0.7), idx: i - 1 })
      progress.value = Math.round((i / total) * 100)
      progressText.value = `生成缩略图 ${i}/${total}`
    }
    thumbnails.value = thumbs
    order.value = thumbs.map(t => t.idx)
  }, '加载缩略图失败')
}

function onDragStart(idx, e) {
  dragFrom.value = idx
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
function onDrop(toIdx, e) {
  e.preventDefault()
  const from = dragFrom.value
  if (from === null || from === toIdx) return
  const arr = [...order.value]
  const [moved] = arr.splice(from, 1)
  arr.splice(toIdx, 0, moved)
  order.value = arr
  dragFrom.value = null
}
function moveLeft(idx) {
  if (idx <= 0) return
  const arr = [...order.value]
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  order.value = arr
}
function moveRight(idx) {
  if (idx >= order.value.length - 1) return
  const arr = [...order.value]
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  order.value = arr
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  if (!order.value.length) { showError('请等待缩略图加载'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const srcDoc = await loadPdfLib(file)
    const outDoc = await PDFDocument.create()
    progressText.value = '按新顺序复制页面中...'
    for (let i = 0; i < order.value.length; i++) {
      const origIdx = order.value[i]
      const [page] = await outDoc.copyPages(srcDoc, [origIdx])
      outDoc.addPage(page)
      progress.value = Math.round(((i + 1) / order.value.length) * 90)
    }
    const bytes = await outDoc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_reordered.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF重排失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF页面重排" desc="拖拽缩略图调整页面顺序" icon="⇄">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件，建议≤50页" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
      <button class="nb-btn mt-8" @click="loadThumbnails">用密码加载</button>
    </div>

    <div v-if="thumbnails.length" class="mt-16">
      <h3 class="nb-h3 mb-8">拖拽调整顺序 (共 {{ order.length }} 页)</h3>
      <div class="thumb-grid">
        <div v-for="(origIdx, displayIdx) in order" :key="displayIdx"
             class="thumb-item"
             draggable="true"
             @dragstart="onDragStart(displayIdx, $event)"
             @dragover="onDragOver"
             @drop="onDrop(displayIdx, $event)">
          <div class="thumb-num">{{ displayIdx + 1 }}</div>
          <img :src="thumbnails[origIdx].url" :alt="`第${origIdx + 1}页`" />
          <div class="thumb-orig">原P{{ origIdx + 1 }}</div>
          <div class="thumb-actions">
            <button class="nb-btn sm" @click="moveLeft(displayIdx)" :disabled="displayIdx === 0">←</button>
            <button class="nb-btn sm" @click="moveRight(displayIdx)" :disabled="displayIdx === order.length - 1">→</button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="thumbnails.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 生成中...</span>
        <span v-else>生成重排后的PDF</span>
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
.thumb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}
.thumb-item {
  background: var(--paper-card);
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  padding: 6px;
  cursor: move;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.thumb-item:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
  background: var(--neon);
}
.thumb-num {
  position: absolute;
  top: 4px; left: 4px;
  background: var(--accent);
  color: var(--paper-card);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 11px;
  padding: 2px 6px;
  border: 2px solid var(--ink);
}
.thumb-item img {
  width: 100%;
  height: 140px;
  object-fit: contain;
  background: #fff;
  border: 1px solid #ccc;
}
.thumb-orig {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
}
.thumb-actions { display: flex; gap: 4px; }
</style>

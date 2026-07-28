<script setup>
/**
 * PDF合并 - 多文件按顺序合并，用 pdf-lib
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib } from '../../utils/pdflib.js'
import { PDFDocument } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const dragIdx = ref(null)

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  files.value = [...files.value, ...arr]
}
function removeFile(idx) { files.value.splice(idx, 1) }

function onDragStart(idx, e) {
  dragIdx.value = idx
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
function onDrop(idx, e) {
  e.preventDefault()
  const from = dragIdx.value
  if (from === null || from === idx) return
  const arr = [...files.value]
  const [moved] = arr.splice(from, 1)
  arr.splice(idx, 0, moved)
  files.value = arr
  dragIdx.value = null
}
function moveUp(idx) {
  if (idx <= 0) return
  const arr = [...files.value]
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  files.value = arr
}
function moveDown(idx) {
  if (idx >= files.value.length - 1) return
  const arr = [...files.value]
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  files.value = arr
}

async function process() {
  if (files.value.length < 2) { showError('至少选择2个PDF文件'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '准备合并...'
  await safeRun(async () => {
    const outDoc = await PDFDocument.create()
    const total = files.value.length
    for (let i = 0; i < total; i++) {
      const f = files.value[i]
      if (!f.size) { throw new Error(`文件 ${f.name} 为空`) }
      progressText.value = `合并 ${i + 1}/${total}: ${f.name}`
      const buf = await f.arrayBuffer()
      let srcDoc
      try {
        srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true })
      } catch (e) {
        throw new Error(`文件 ${f.name} 无法加载: ${e.message}`)
      }
      const indices = srcDoc.getPageIndices()
      const pages = await outDoc.copyPages(srcDoc, indices)
      pages.forEach(p => outDoc.addPage(p))
      progress.value = Math.round(((i + 1) / total) * 90)
    }
    progressText.value = '生成合并PDF中...'
    outDoc.setTitle('Merged Document')
    outDoc.setProducer('FileCut PDF Merge')
    outDoc.setCreator('FileCut')
    outDoc.setCreationDate(new Date())
    const pdfBytes = await outDoc.save()
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `merged_${Date.now()}.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF合并失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF合并" desc="多个PDF按顺序合并为一个文件" icon="+">
    <FileDrop accept=".pdf,application/pdf" :multiple="true" @select="onFileSelect" @error="showError" hint="支持多文件，按住拖拽调整顺序" />

    <div v-if="files.length" class="mt-16">
      <h3 class="nb-h3 mb-8">合并顺序 (拖拽调整)</h3>
      <div class="merge-list">
        <div v-for="(f, idx) in files" :key="idx"
             class="merge-item file-item"
             draggable="true"
             @dragstart="onDragStart(idx, $event)"
             @dragover="onDragOver"
             @drop="onDrop(idx, $event)">
          <span class="merge-idx">{{ idx + 1 }}</span>
          <span class="file-icon">📕</span>
          <span class="file-name">{{ f.name }}</span>
          <button class="nb-btn sm" @click="moveUp(idx)" :disabled="idx === 0">↑</button>
          <button class="nb-btn sm" @click="moveDown(idx)" :disabled="idx === files.length - 1">↓</button>
          <button class="file-remove" @click="removeFile(idx)">×</button>
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="files.length >= 2">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 合并中...</span>
        <span v-else>合并 {{ files.length }} 个文件</span>
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
.merge-list { display: flex; flex-direction: column; gap: 6px; }
.merge-item { cursor: move; user-select: none; }
.merge-idx {
  display: inline-flex;
  width: 28px; height: 28px;
  background: var(--accent);
  color: var(--paper-card);
  border: 2px solid var(--ink);
  align-items: center; justify-content: center;
  font-family: var(--font-mono); font-weight: 700;
  font-size: 13px;
}
</style>

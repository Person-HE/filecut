<script setup>
/**
 * Word预览 - 用 docx-preview 渲染 .docx 到 div
 * 支持缩放、打印
 */
import { ref, nextTick } from 'vue'
import { renderAsync } from 'docx-preview'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const processing = ref(false)
const error = ref('')
const zoom = ref(1)
const containerRef = ref(null)

function onFileSelect(selected) {
  file.value = selected
  error.value = ''
  // 自动加载
  nextTick(() => loadDoc())
}

function removeFile() {
  file.value = null
  if (containerRef.value) containerRef.value.innerHTML = ''
}

async function loadDoc() {
  if (!file.value) return
  if (file.value.size === 0) {
    showError('文件为空，请检查后重新选择')
    return
  }
  error.value = ''
  processing.value = true
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    if (containerRef.value) containerRef.value.innerHTML = ''
    await renderAsync(buf, containerRef.value, null, {
      className: 'docx-render',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      experimental: true,
      useBaseStyles: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true
    })
  }, 'Word文档加载失败，文件可能已损坏')
  processing.value = false
}

function zoomIn() { zoom.value = Math.min(2, +(zoom.value + 0.1).toFixed(2)) }
function zoomOut() { zoom.value = Math.max(0.5, +(zoom.value - 0.1).toFixed(2)) }
function resetZoom() { zoom.value = 1 }

function printDoc() {
  if (!containerRef.value || !containerRef.value.innerHTML) {
    showError('请先加载文档')
    return
  }
  const content = containerRef.value.innerHTML
  const win = window.open('', '_blank')
  if (!win) {
    showError('弹出窗口被拦截，请允许弹出窗口后重试')
    return
  }
  win.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>打印 - ${file.value?.name || 'doc'}</title>
    <style>
      body { font-family: -apple-system, "Microsoft YaHei", sans-serif; margin: 20px; }
      .docx-render { box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 30px; margin-bottom: 20px; background: #fff; }
      table { border-collapse: collapse; }
      td, th { border: 1px solid #999; padding: 4px; }
    </style></head>
    <body>${content}</body></html>
  `)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); }, 500)
}
</script>

<template>
  <ToolLayout title="Word预览" desc="高保真预览Word文档，支持缩放、打印" icon="👁">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式（不支持旧版 .doc）" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="preview-toolbar">
        <div class="toolbar-left">
          <span class="nb-tag">{{ formatBytes(file.size) }}</span>
          <span v-if="processing" class="nb-tag cyan"><span class="nb-spinner"></span> 加载中</span>
        </div>
        <div class="toolbar-right">
          <button class="nb-btn sm" @click="zoomOut" :disabled="!containerRef?.innerHTML">－</button>
          <span class="zoom-display">{{ Math.round(zoom * 100) }}%</span>
          <button class="nb-btn sm" @click="zoomIn" :disabled="!containerRef?.innerHTML">＋</button>
          <button class="nb-btn sm" @click="resetZoom" :disabled="!containerRef?.innerHTML">100%</button>
          <button class="nb-btn sm primary" @click="printDoc" :disabled="processing">🖨 打印</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div class="preview-container mt-16" v-if="file">
      <div class="preview-scroll">
        <div class="preview-zoom" :style="{ transform: `scale(${zoom})`, transformOrigin: 'top center' }">
          <div ref="containerRef" class="docx-container"></div>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 8px; }
.zoom-display {
  font-family: var(--font-mono);
  font-size: 13px;
  min-width: 50px;
  text-align: center;
  font-weight: 600;
}
.preview-container {
  background: var(--paper-darker);
  padding: 24px;
  border: var(--border-w-thick) solid var(--ink);
  box-shadow: var(--shadow-md);
  min-height: 400px;
}
.preview-scroll {
  overflow: auto;
  max-height: 75vh;
  display: flex;
  justify-content: center;
}
.preview-zoom {
  transition: transform 0.15s ease;
}
.docx-container {
  background: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  min-width: 600px;
}
.docx-container :deep(.docx-wrapper) {
  background: #fff;
  padding: 20px;
}
.docx-container :deep(.docx-wrapper) > section.docx {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}
</style>

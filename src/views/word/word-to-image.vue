<script setup>
/**
 * Word转图片 - docx-preview 渲染后用 html2canvas 转图片
 * 支持 JPG/PNG/WebP
 */
import { ref, nextTick } from 'vue'
import { renderAsync } from 'docx-preview'
import html2canvas from 'html2canvas'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const format = ref('png')
const scale = ref(2)
const containerRef = ref(null)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  if (containerRef.value) containerRef.value.innerHTML = ''
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    if (containerRef.value) containerRef.value.innerHTML = ''
    await renderAsync(buf, containerRef.value, null, {
      className: 'docx-render',
      inWrapper: false,
      breakPages: false,
      experimental: true,
      useBaseStyles: true
    })
    await nextTick()

    const canvas = await html2canvas(containerRef.value, {
      scale: scale.value,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    })

    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
    const mime = mimeMap[format.value] || 'image/png'
    const quality = format.value === 'png' ? undefined : 0.92

    const dataUrl = canvas.toDataURL(mime, quality)
    const base64 = dataUrl.split(',')[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const blob = new Blob([bytes], { type: mime })
    if (blob.size === 0) throw new Error('生成的图片为空')

    const name = replaceExt(file.value.name, '.' + format.value)
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Word转图片失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Word转图片" desc="Word文档转图片，支持JPG/PNG/WebP格式" icon="I">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 输出高清图片" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">输出选项</h3>
      <div class="options-grid">
        <div>
          <label class="nb-label">图片格式</label>
          <select v-model="format" class="nb-select">
            <option value="png">PNG (无损)</option>
            <option value="jpg">JPG (更小)</option>
            <option value="webp">WebP (现代)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">清晰度</label>
          <select v-model="scale" class="nb-select">
            <option :value="1">普通 (1x)</option>
            <option :value="2">高清 (2x)</option>
            <option :value="3">超清 (3x)</option>
          </select>
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div ref="containerRef" class="render-container" v-show="false"></div>

    <ResultViewer :files="result" :image-urls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.render-container {
  position: absolute;
  left: -9999px;
  top: 0;
  background: #fff;
  width: 800px;
  padding: 40px;
}
@media (max-width: 768px) {
  .options-grid { grid-template-columns: 1fr; }
}
</style>

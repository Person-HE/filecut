<script setup>
/**
 * PDF转图片 - 用 pdf.js 渲染每页为Canvas，输出 JPG/PNG/WebP
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { replaceExt, getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf, renderPageToImage } from '../../utils/pdfjs.js'
import JSZip from 'jszip'

const files = ref([])
const result = ref([])
const imageUrls = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const scale = ref(2)
const format = ref('image/png')
const quality = ref(0.92)
const zipMode = ref(false)

const fmtExt = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdf(buf)
    } catch (e) {
      if (/password/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; imageUrls.value = []
  processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    const total = pdfDoc.numPages
    const ext = fmtExt[format.value]
    const images = []
    for (let i = 1; i <= total; i++) {
      const page = await pdfDoc.getPage(i)
      const { blob } = await renderPageToImage(page, scale.value, format.value, quality.value)
      const name = `${getBaseName(file.name)}_page_${String(i).padStart(3, '0')}.${ext}`
      images.push({ name, blob, url: URL.createObjectURL(blob), size: blob.size })
      progress.value = Math.round((i / total) * 100)
      progressText.value = `渲染中 ${i}/${total} 页`
    }
    if (zipMode.value && images.length > 1) {
      const zip = new JSZip()
      for (const im of images) zip.file(im.name, im.blob)
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        progressText.value = `打包ZIP ${Math.round(meta.percent)}%`
      })
      result.value = [{ name: `${getBaseName(file.name)}_images.zip`, blob: zipBlob, url: URL.createObjectURL(zipBlob), size: zipBlob.size }]
      // 同时展示前3张预览
      imageUrls.value = images.slice(0, 3).map(im => im.url)
      result.value.push(...images.slice(0, 3))
    } else {
      result.value = images
      imageUrls.value = images.slice(0, 6).map(im => im.url)
    }
    progress.value = 100
    progressText.value = `完成 ${images.length} 张图片`
  }, 'PDF转图片失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转图片" desc="PDF每页转为高清JPG/PNG/WebP图片" icon="I">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div class="nb-grid cols-2 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">清晰度(缩放)</label>
        <select class="nb-select" v-model="scale">
          <option :value="1">1x 标清(快)</option>
          <option :value="2">2x 高清(推荐)</option>
          <option :value="3">3x 超高清(慢)</option>
          <option :value="4">4x 极清(很慢)</option>
        </select>
      </div>
      <div>
        <label class="nb-label">图片格式</label>
        <select class="nb-select" v-model="format">
          <option value="image/png">PNG 无损</option>
          <option value="image/jpeg">JPG 压缩</option>
          <option value="image/webp">WebP 现代格式</option>
        </select>
      </div>
      <div v-if="format !== 'image/png'">
        <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
        <input type="range" min="0.3" max="1" step="0.05" v-model="quality" class="nb-input" />
      </div>
      <div>
        <label class="nb-label">输出方式</label>
        <select class="nb-select" v-model="zipMode">
          <option :value="false">每页一张图(分别下载)</option>
          <option :value="true">打包为ZIP(多页时)</option>
        </select>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 渲染中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>
    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" :imageUrls="imageUrls" />
  </ToolLayout>
</template>

<script setup>
/**
 * PDF转PPT - 用 pdf.js 渲染每页为图片，用 pptxgenjs 嵌入为PPT页
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf, renderPageToImage } from '../../utils/pdfjs.js'
import pptxgen from 'pptxgenjs'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const scale = ref(2)
const fitMode = ref('cover')

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
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    const total = pdfDoc.numPages
    if (total > 200) throw new Error('PDF页数过多(>200)，请先拆分')

    const pptx = new pptxgen()
    pptx.layout = 'LAYOUT_WIDE'  // 13.33 x 7.5 inch (16:9)
    pptx.title = getBaseName(file.name)
    pptx.author = 'FileCut'

    for (let i = 1; i <= total; i++) {
      const page = await pdfDoc.getPage(i)
      const viewport1 = page.getViewport({ scale: 1 })
      // 计算适合16:9的尺寸
      const isLandscape = viewport1.width >= viewport1.height
      // 渲染图像
      const { canvas } = await renderPageToImage(page, scale.value, 'image/jpeg', 0.92)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      const slide = pptx.addSlide()
      // 16:9 slide: 13.33 x 7.5
      if (fitMode.value === 'cover') {
        // 拉伸铺满
        slide.addImage({ data: dataUrl, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'cover', w: 13.33, h: 7.5 } })
      } else {
        // contain 居中
        const ratio = viewport1.width / viewport1.height
        let w, h, x, y
        if (isLandscape) {
          w = 13.33; h = 13.33 / ratio
          if (h > 7.5) { h = 7.5; w = 7.5 * ratio }
          x = (13.33 - w) / 2; y = (7.5 - h) / 2
        } else {
          h = 7.5; w = 7.5 * ratio
          if (w > 13.33) { w = 13.33; h = 13.33 / ratio }
          x = (13.33 - w) / 2; y = (7.5 - h) / 2
        }
        slide.addImage({ data: dataUrl, x, y, w, h })
      }
      progress.value = Math.round((i / total) * 90)
      progressText.value = `渲染第 ${i}/${total} 页`
    }

    progressText.value = '生成PPT文件中...'
    const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' })
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    if (!blob.size) throw new Error('生成PPT失败')
    result.value = [{
      name: `${getBaseName(file.name)}.pptx`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF转PPT失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转PPT" desc="每页PDF作为图片插入PPT幻灯片" icon="P">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件，建议≤200页" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div class="nb-grid cols-2 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">清晰度</label>
        <select class="nb-select" v-model="scale">
          <option :value="1">1x 较低(文件小)</option>
          <option :value="2">2x 推荐</option>
          <option :value="3">3x 高清(文件大)</option>
        </select>
      </div>
      <div>
        <label class="nb-label">图片填充方式</label>
        <select class="nb-select" v-model="fitMode">
          <option value="cover">cover 铺满(可能裁切)</option>
          <option value="contain">contain 完整显示(留白)</option>
        </select>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>生成PPT</span>
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

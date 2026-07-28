<script setup>
/**
 * PPT 转图片
 * - JSZip 解析 .pptx
 * - 每页渲染为 HTML，html2canvas 转 Canvas，输出图片
 * - 支持 JPG/PNG/WebP + scale选择
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { replaceExt } from '../../utils/download.js'
import JSZip from 'jszip'
import html2canvas from 'html2canvas'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])
const renderStage = ref(null)

const format = ref('png')        // png | jpeg | webp
const scale = ref(1.5)          // 1 / 1.5 / 2
const quality = ref(0.92)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

async function parsePptxForRender(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)[1])
      const nb = parseInt(b.match(/slide(\d+)\.xml/)[1])
      return na - nb
    })

  if (!slideFiles.length) throw new Error('未找到任何幻灯片，可能不是有效的 .pptx 文件')

  const slides = []
  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i]
    const slideXml = await zip.file(slidePath).async('string')
    const slideNum = slidePath.match(/slide(\d+)\.xml/)[1]

    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
    const relsXml = await zip.file(relsPath)?.async('string') || ''
    const imgMap = {}
    const relRe = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/image"[^>]*\/>/g
    let rm
    while ((rm = relRe.exec(relsXml)) !== null) {
      let target = rm[2]
      if (!target.startsWith('ppt/')) {
        target = 'ppt/slides/' + target.replace(/^\.\//, '')
        target = target.replace(/\/[^/]+\/\.\.\//, '/')
      }
      const imgFile = zip.file(target)
      if (imgFile) {
        const blob = await imgFile.async('blob')
        const url = URL.createObjectURL(blob)
        objectUrls.value.push(url)
        imgMap[rm[1]] = url
      }
    }
    const { html } = buildSlideHTML(slideXml, imgMap)
    slides.push({ html })
  }
  return slides
}

function buildSlideHTML(xml, imgMap) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const textNodes = doc.getElementsByTagName('a:t')
  const texts = []
  for (let i = 0; i < textNodes.length; i++) {
    const t = textNodes[i].textContent
    if (t && t.trim()) texts.push(t)
  }
  const blips = doc.getElementsByTagName('a:blip')
  const images = []
  for (let i = 0; i < blips.length; i++) {
    const embed = blips[i].getAttribute('r:embed')
    if (embed && imgMap[embed]) images.push(imgMap[embed])
  }

  let html = ''
  if (texts.length === 0 && images.length === 0) {
    html = '<div style="text-align:center;padding:80px 0;color:#7a7a7a;font-family:monospace;">（空白幻灯片）</div>'
  } else {
    if (texts.length > 0) {
      html += `<h2 style="font-family:'Caveat',cursive;font-size:48px;font-weight:700;color:#ff5a1f;border-bottom:4px solid #1a1a1a;padding-bottom:12px;margin-bottom:24px;">${escapeHtml(texts[0])}</h2>`
    }
    if (texts.length > 1) {
      html += '<ul style="list-style:none;padding:0;margin:0;">'
      for (let i = 1; i < texts.length; i++) {
        html += `<li style="padding:8px 0 8px 32px;position:relative;font-size:20px;border-bottom:1px dashed #7a7a7a;"><span style="position:absolute;left:0;color:#ff5a1f;font-weight:700;">◆</span>${escapeHtml(texts[i])}</li>`
      }
      html += '</ul>'
    }
    if (images.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:24px;">'
      images.forEach(url => {
        html += `<img src="${url}" style="max-width:300px;max-height:300px;border:4px solid #1a1a1a;box-shadow:4px 4px 0 #1a1a1a;" />`
      })
      html += '</div>'
    }
  }
  return { html }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function process() {
  if (!file.value) {
    showError('请先选择文件')
    return
  }
  if (file.value.size === 0) {
    error.value = '文件为空'
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressText.value = '解析 PPT 中...'
  cleanupUrls()

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    progressText.value = '提取幻灯片内容...'
    const slides = await parsePptxForRender(buf)
    if (!slides.length) throw new Error('PPT中没有可转换的内容')

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' }
    const mime = mimeMap[format.value]
    const ext = extMap[format.value]
    const useQuality = format.value !== 'png'
    const baseName = replaceExt(file.value.name, '')

    const out = []
    for (let i = 0; i < slides.length; i++) {
      progressText.value = `渲染第 ${i+1} / ${slides.length} 页...`
      progress.value = Math.round((i / slides.length) * 100)

      const stage = renderStage.value
      stage.innerHTML = ''
      const slideEl = document.createElement('div')
      slideEl.style.cssText = `
        width: 960px; height: 540px; padding: 48px 64px;
        background: #fffaf0; box-sizing: border-box;
        font-family: 'IBM Plex Sans', system-ui, sans-serif;
        color: #1a1a1a; overflow: hidden;
      `
      slideEl.innerHTML = slides[i].html
      stage.appendChild(slideEl)

      const imgs = slideEl.querySelectorAll('img')
      await Promise.all(Array.from(imgs).map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      }))

      const canvas = await html2canvas(slideEl, {
        scale: scale.value,
        backgroundColor: '#fffaf0',
        logging: false,
        useCORS: true
      })

      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, useQuality ? quality.value : undefined))
      if (!blob || !blob.size) throw new Error(`第${i+1}页生成失败`)

      const url = URL.createObjectURL(blob)
      objectUrls.value.push(url)
      const name = `${baseName}_slide${String(i+1).padStart(2, '0')}.${ext}`
      out.push({ name, blob, url, size: blob.size })
    }

    progress.value = 100
    progressText.value = `完成，共生成 ${out.length} 张图片`
    result.value = out
  }, 'PPT转图片失败')

  processing.value = false
  if (renderStage.value) renderStage.value.innerHTML = ''
}
</script>

<template>
  <ToolLayout title="PPT转图片" desc="将PPT每页转为图片" icon="I">
    <FileDrop accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              :multiple="false" hint="仅支持 .pptx 格式"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="nb-card mt-16">
      <h3 class="nb-h3">输出选项</h3>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">格式</label>
          <select v-model="format" class="nb-select">
            <option value="png">PNG（无损透明）</option>
            <option value="jpeg">JPG（体积小）</option>
            <option value="webp">WebP（高压缩）</option>
          </select>
        </div>
        <div>
          <label class="nb-label">缩放</label>
          <select v-model="scale" class="nb-select">
            <option :value="1">1x (960×540)</option>
            <option :value="1.5">1.5x (1440×810)</option>
            <option :value="2">2x (1920×1080)</option>
            <option :value="3">3x (2880×1620)</option>
          </select>
        </div>
        <div v-if="format !== 'png'">
          <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input type="range" v-model.number="quality" min="0.3" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
      </div>
    </div>

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />

    <div ref="renderStage" style="position:fixed;left:-99999px;top:0;width:960px;height:540px;overflow:hidden;"></div>
  </ToolLayout>
</template>

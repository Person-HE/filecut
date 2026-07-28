<script setup>
/**
 * PPT 预览
 * - JSZip 解析 .pptx
 * - 提取每页 slide XML，渲染为简化 HTML（文字+图片）
 * - 支持多页切换
 */
import { ref, computed, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import { showError } from '../../utils/common.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { formatBytes } from '../../utils/format.js'
import JSZip from 'jszip'

const file = ref(null)
const slides = ref([])        // [{ html, images, text, notes }]
const currentIndex = ref(0)
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

const currentSlide = computed(() => slides.value[currentIndex.value] || null)

function onFileSelect(selected) {
  file.value = selected
  slides.value = []
  error.value = ''
  loadPreview()
}

function removeFile() {
  file.value = null
  slides.value = []
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

/**
 * 解析PPTX，提取每页文本和图片
 */
async function parsePptx(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const slideFiles = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)[1])
      const nb = parseInt(b.match(/slide(\d+)\.xml/)[1])
      return na - nb
    })

  if (!slideFiles.length) throw new Error('未找到任何幻灯片，可能不是有效的 .pptx 文件')

  // 读取演示文稿关系，获取每张幻灯片的相对路径
  const presentationRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string') || ''
  const slideRelsMap = {}  // rId -> slide 文件路径
  const relRegex = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/slide"[^>]*\/>/g
  let m
  while ((m = relRegex.exec(presentationRelsXml)) !== null) {
    slideRelsMap[m[1]] = 'ppt/' + m[2].replace(/^\.\//, '')
  }

  const result = []
  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i]
    const slideXml = await zip.file(slidePath).async('string')

    // 解析关系文件，获取图片引用
    const slideName = slidePath.match(/slide(\d+)\.xml/)[1]
    const relsPath = `ppt/slides/_rels/slide${slideName}.xml.rels`
    const relsXml = await zip.file(relsPath)?.async('string') || ''
    const imgMap = {}  // rId -> blobUrl
    const relRe = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*Type="[^"]*\/image"[^>]*\/>/g
    let rm
    while ((rm = relRe.exec(relsXml)) !== null) {
      const rId = rm[1]
      let target = rm[2]
      if (!target.startsWith('ppt/')) {
        // 相对路径：相对于 ppt/slides/
        target = 'ppt/slides/' + target.replace(/^\.\//, '')
        // 处理 ../media/ 情况
        target = target.replace(/\/[^/]+\/\.\.\//, '/')
      }
      const imgFile = zip.file(target)
      if (imgFile) {
        const blob = await imgFile.async('blob')
        const url = URL.createObjectURL(blob)
        objectUrls.value.push(url)
        imgMap[rId] = url
      }
    }

    // 提取文字+图片
    const { html, text } = extractSlideContent(slideXml, imgMap)
    result.push({
      index: i + 1,
      html,
      text,
      imageCount: Object.keys(imgMap).length
    })
  }
  return result
}

/**
 * 从 slide XML 中提取文字和图片
 */
function extractSlideContent(xml, imgMap) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const textNodes = doc.getElementsByTagName('a:t')
  const texts = []
  for (let i = 0; i < textNodes.length; i++) {
    const t = textNodes[i].textContent
    if (t && t.trim()) texts.push(t)
  }

  // 提取图片引用 - a:blip 的 r:embed 属性
  const blips = doc.getElementsByTagName('a:blip')
  const images = []
  for (let i = 0; i < blips.length; i++) {
    const embed = blips[i].getAttribute('r:embed') || blips[i].getAttributeNS('*', 'embed')
    if (embed && imgMap[embed]) {
      images.push(imgMap[embed])
    }
  }

  // 构造 HTML - 简化版
  let html = ''
  if (texts.length === 0 && images.length === 0) {
    html = '<div class="slide-empty">（空白幻灯片）</div>'
  } else {
    // 第一条作为标题
    if (texts.length > 0) {
      html += `<h2 class="slide-title">${escapeHtml(texts[0])}</h2>`
    }
    if (texts.length > 1) {
      html += '<ul class="slide-list">'
      for (let i = 1; i < texts.length; i++) {
        html += `<li>${escapeHtml(texts[i])}</li>`
      }
      html += '</ul>'
    }
    if (images.length > 0) {
      html += '<div class="slide-images">'
      images.forEach(url => {
        html += `<img src="${url}" alt="图片" />`
      })
      html += '</div>'
    }
  }

  return { html, text: texts.join('\n') }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function loadPreview() {
  if (!file.value) return
  if (file.value.size === 0) {
    error.value = '文件为空'
    return
  }
  error.value = ''
  processing.value = true
  cleanupUrls()
  try {
    const buf = await readFileAsArrayBuffer(file.value)
    slides.value = await parsePptx(buf)
    currentIndex.value = 0
  } catch (e) {
    console.error('PPT预览失败', e)
    error.value = `解析失败：${e.message || e}。请确认是 .pptx 格式（不支持 .ppt 旧格式）`
  } finally {
    processing.value = false
  }
}

function prev() {
  if (currentIndex.value > 0) currentIndex.value--
}
function next() {
  if (currentIndex.value < slides.value.length - 1) currentIndex.value++
}
</script>

<template>
  <ToolLayout title="PPT预览" desc="在线预览PPT幻灯片内容（文字+图片）" icon="👁">
    <FileDrop accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              :multiple="false" hint="仅支持 .pptx 格式"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="processing" class="nb-alert info mt-16">
      <span class="nb-spinner"></span> 正在解析 PPT，请稍候...
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="slides.length" class="mt-16">
      <div class="nb-card slide-toolbar">
        <div class="slide-nav">
          <button class="nb-btn" @click="prev" :disabled="currentIndex === 0">‹ 上一页</button>
          <span class="slide-counter">
            第 <strong>{{ currentIndex + 1 }}</strong> / {{ slides.length }} 页
          </span>
          <button class="nb-btn" @click="next" :disabled="currentIndex === slides.length - 1">下一页 ›</button>
        </div>
        <div class="slide-meta">
          <span class="nb-tag">📷 {{ currentSlide?.imageCount || 0 }} 图</span>
          <span class="nb-tag neon">📄 {{ (currentSlide?.text || '').length }} 字符</span>
        </div>
      </div>

      <div class="nb-card slide-stage mt-16">
        <div class="slide-render" v-html="currentSlide?.html"></div>
      </div>

      <div class="nb-card mt-16 slide-thumbs">
        <h3 class="nb-h3">所有页面缩略</h3>
        <div class="thumbs-grid">
          <button v-for="(s, i) in slides" :key="i"
                  class="thumb-item"
                  :class="{ active: i === currentIndex }"
                  @click="currentIndex = i">
            <span class="thumb-num">{{ s.index }}</span>
            <span class="thumb-text">{{ (s.text || '空白').slice(0, 30) }}</span>
          </button>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.slide-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.slide-nav { display: flex; align-items: center; gap: 12px; }
.slide-counter {
  font-family: var(--font-mono);
  font-size: 14px;
}
.slide-counter strong { color: var(--accent); font-size: 18px; }
.slide-meta { display: flex; gap: 8px; }

.slide-stage {
  background: #2a2a2a;
  padding: 0;
  overflow: hidden;
}
.slide-render {
  background: var(--paper-card);
  min-height: 400px;
  padding: 32px 48px;
  font-family: var(--font-body);
  aspect-ratio: 16 / 9;
  overflow: auto;
}
.slide-render :deep(.slide-title) {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
  border-bottom: 3px solid var(--ink);
  padding-bottom: 8px;
  margin-bottom: 16px;
}
.slide-render :deep(.slide-list) {
  list-style: none;
  padding: 0;
}
.slide-render :deep(.slide-list li) {
  padding: 6px 0 6px 24px;
  position: relative;
  font-size: 15px;
  border-bottom: 1px dashed var(--ink-muted);
}
.slide-render :deep(.slide-list li::before) {
  content: '◆';
  position: absolute;
  left: 0;
  color: var(--accent);
  font-weight: 700;
}
.slide-render :deep(.slide-images) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}
.slide-render :deep(.slide-images img) {
  max-width: 200px;
  max-height: 200px;
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}
.slide-render :deep(.slide-empty) {
  text-align: center;
  color: var(--ink-muted);
  padding: 80px 0;
  font-family: var(--font-mono);
}

.slide-thumbs h3 { margin-bottom: 12px; }
.thumbs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.thumb-item {
  padding: 8px 10px;
  background: var(--paper-card);
  border: 2px solid var(--ink);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: left;
  transition: all 0.1s ease;
}
.thumb-item:hover { background: var(--accent-soft); }
.thumb-item.active {
  background: var(--neon);
  box-shadow: 3px 3px 0 var(--ink);
  transform: translate(-1px, -1px);
}
.thumb-num {
  display: inline-block;
  background: var(--ink);
  color: var(--neon);
  padding: 1px 6px;
  margin-right: 6px;
  font-weight: 700;
}
.thumb-text {
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  max-width: 80px;
  vertical-align: middle;
}
</style>

<script setup>
/**
 * SVG 编辑优化
 * - 用 SVGO 优化SVG体积
 * - 简单编辑: 修改fill/stroke/size
 * - 转PNG/JPG
 */
import { ref, onUnmounted, watch } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { readFileAsText } from '../../utils/fileReader.js'
import { replaceExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'

/**
 * 浏览器原生SVG优化（替代svgo，避免Node模块依赖）
 * - 移除注释、编辑器元数据（Inkscape/Sodipodi）
 * - 移除空白文本节点
 * - 精简数字精度
 * - 压缩空白
 */
function optimizeSvgBrowser(svgText, options = {}) {
  const { floatPrecision = 2, multipass = true } = options
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName !== 'svg') throw new Error('无效的SVG文件')

  // 需要移除的命名空间前缀
  const removePrefixes = ['sodipodi', 'inkscape', 'i:', 'sketch:']
  // 需要移除的元数据元素
  const removeTags = ['metadata', 'title', 'desc']

  function walk(node) {
    if (!node || node.nodeType !== 1) return
    const tag = node.nodeName.toLowerCase()
    const ns = node.prefix || ''
    if (removeTags.includes(tag) || removePrefixes.includes(ns + ':')) {
      node.parentNode?.removeChild(node)
      return
    }
    // 移除编辑器属性
    Array.from(node.attributes || []).forEach(attr => {
      if (removePrefixes.some(p => attr.name.startsWith(p))) {
        node.removeAttribute(attr.name)
      }
      // 移除id="Layer_1"等无意义id（可选，保留默认）
    })
    // 递归处理子节点（先复制以避免迭代修改）
    Array.from(node.childNodes).forEach(walk)
  }
  walk(svg)

  // 移除空白文本节点和注释
  function cleanWhitespace(node) {
    if (!node) return
    const children = Array.from(node.childNodes)
    children.forEach(c => {
      if (c.nodeType === 8) node.removeChild(c) // 注释
      else if (c.nodeType === 3) {
        // 文本节点
        if (!c.nodeValue.trim()) node.removeChild(c)
      } else if (c.nodeType === 1) cleanWhitespace(c)
    })
  }
  cleanWhitespace(svg)

  // 精简数字精度（路径d属性、坐标属性等）
  const numericAttrs = ['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r',
    'rx', 'ry', 'width', 'height', 'transform', 'points']
  function simplifyNums(node) {
    if (!node || node.nodeType !== 1) return
    Array.from(node.attributes || []).forEach(attr => {
      if (numericAttrs.includes(attr.name)) {
        attr.value = attr.value.replace(/-?\d*\.\d+/g, m => {
          const n = parseFloat(m)
          return isNaN(n) ? m : (Math.round(n * Math.pow(10, floatPrecision)) / Math.pow(10, floatPrecision)).toString()
        })
      }
    })
    Array.from(node.childNodes).forEach(simplifyNums)
  }
  simplifyNums(svg)

  // 序列化
  const serializer = new XMLSerializer()
  let out = serializer.serializeToString(svg)
  // 压缩空白
  out = out.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim()
  // 加XML声明（可选）
  if (!out.startsWith('<?xml')) out = '<?xml version="1.0" encoding="UTF-8"?>\n' + out
  return out
}

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

const svgText = ref('')
const previewSvg = ref('')
const originalSize = ref(0)
const optimizedSize = ref(0)

// 编辑参数
const fillColor = ref('#ff5a1f')
const strokeColor = ref('#1a1a1a')
const strokeWidth = ref(2)
const applyFill = ref(false)
const applyStroke = ref(false)
const scale = ref(1)

// 优化参数
const svgoPlugins = ref({
  multipass: true,
  floatPrecision: 2
})

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
  loadSvg()
}

function removeFile() {
  file.value = null
  result.value = []
  svgText.value = ''
  previewSvg.value = ''
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

async function loadSvg() {
  if (!file.value) return
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    if (file.value.size > 5 * 1024 * 1024) throw new Error('SVG文件过大（>5MB）')

    const text = await readFileAsText(file.value)
    if (!text.includes('<svg')) throw new Error('不是有效的SVG文件')
    svgText.value = text
    originalSize.value = file.value.size
    updatePreview()
  }, '读取SVG失败')

  processing.value = false
}

function applyEdits(svg) {
  let edited = svg
  // 注入 style 修改 fill/stroke
  let styleRules = ''
  if (applyFill.value) {
    styleRules += `* { fill: ${fillColor.value} !important; }`
  }
  if (applyStroke.value) {
    styleRules += `* { stroke: ${strokeColor.value} !important; stroke-width: ${strokeWidth.value} !important; }`
  }

  if (styleRules) {
    if (edited.includes('<style')) {
      edited = edited.replace(/<style[^>]*>/, `<style>${styleRules}`)
    } else if (edited.includes('<svg')) {
      edited = edited.replace(/<svg([^>]*)>/, `<svg$1><style>${styleRules}</style>`)
    }
  }

  // 应用缩放 - 修改 width 和 height 属性
  if (scale.value !== 1) {
    // 读取 viewBox
    const viewBoxMatch = edited.match(/viewBox=["']([^"']+)["']/)
    if (viewBoxMatch) {
      const [vbW, vbH] = viewBoxMatch[1].trim().split(/\s+/).slice(-2).map(Number)
      const newW = Math.round(vbW * scale.value)
      const newH = Math.round(vbH * scale.value)
      edited = edited.replace(/(<svg[^>]*?)\swidth=["'][^"']*["']/, `$1 width="${newW}"`)
      edited = edited.replace(/(<svg[^>]*?)\sheight=["'][^"']*["']/, `$1 height="${newH}"`)
      if (!/width=/.test(edited.match(/<svg[^>]*>/)[0])) {
        edited = edited.replace(/<svg([^>]*)>/, `<svg$1 width="${newW}" height="${newH}">`)
      }
    }
  }
  return edited
}

function updatePreview() {
  if (!svgText.value) return
  try {
    const edited = applyEdits(svgText.value)
    previewSvg.value = edited
  } catch (e) {
    console.error(e)
  }
}

watch([fillColor, strokeColor, strokeWidth, applyFill, applyStroke, scale], updatePreview)

async function optimizeSvg() {
  if (!svgText.value) {
    showError('请先选择SVG文件')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  cleanupUrls()

  await safeRun(async () => {
    // 先应用编辑
    const edited = applyEdits(svgText.value)

    // 用浏览器原生SVG优化
    const optimizedData = optimizeSvgBrowser(edited, svgoPlugins.value)
    if (!optimizedData) throw new Error('优化失败：输出为空')

    const blob = new Blob([optimizedData], { type: 'image/svg+xml' })
    if (!blob.size) throw new Error('优化后输出为空')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_optimized.svg')
    optimizedSize.value = blob.size
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, 'SVG优化失败')

  processing.value = false
}

async function convertTo(format) {
  if (!previewSvg.value) {
    showError('请先选择SVG文件')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  cleanupUrls()

  await safeRun(async () => {
    const blob = new Blob([previewSvg.value], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)

    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    // 获取图片尺寸
    let w = img.naturalWidth || 800
    let h = img.naturalHeight || 600
    if (scale.value !== 1) {
      w = Math.round(w * scale.value)
      h = Math.round(h * scale.value)
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')

    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }

    ctx.drawImage(img, 0, 0, w, h)

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' }
    const mime = mimeMap[format]
    const ext = extMap[format]

    const outBlob = await new Promise(resolve => canvas.toBlob(resolve, mime, 0.92))
    if (!outBlob || !outBlob.size) throw new Error(`转换 ${format} 失败`)

    const outUrl = URL.createObjectURL(outBlob)
    objectUrls.value.push(outUrl)
    const outName = replaceExt(file.value.name, '.' + ext)
    result.value = [{ name: outName, blob: outBlob, url: outUrl, size: outBlob.size }]
  }, 'SVG转换失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="SVG编辑优化" desc="SVG优化压缩、修改样式、转PNG/JPG" icon="◇">
    <FileDrop accept=".svg,image/svg+xml"
              :multiple="false" hint="仅支持 .svg 文件"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="processing" class="nb-alert info mt-16">
      <span class="nb-spinner"></span> 处理中...
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 预览 -->
    <div v-if="previewSvg" class="nb-card mt-16">
      <h3 class="nb-h3">SVG 预览</h3>
      <div class="svg-preview" v-html="previewSvg"></div>
      <div class="nb-tag mt-8">原始: {{ formatBytes(originalSize) }}</div>
      <div v-if="optimizedSize" class="nb-tag neon mt-8" style="margin-left:6px;">
        优化后: {{ formatBytes(optimizedSize) }} (减少 {{ ((1 - optimizedSize/originalSize) * 100).toFixed(1) }}%)
      </div>
    </div>

    <!-- 编辑选项 -->
    <div v-if="previewSvg" class="nb-card mt-16">
      <h3 class="nb-h3">编辑选项</h3>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="opt-row">
            <input type="checkbox" v-model="applyFill" />
            <span>修改填充色</span>
          </label>
          <input type="color" v-model="fillColor" class="nb-input" style="height:42px; padding:4px;" :disabled="!applyFill" />
        </div>
        <div>
          <label class="opt-row">
            <input type="checkbox" v-model="applyStroke" />
            <span>修改描边</span>
          </label>
          <input type="color" v-model="strokeColor" class="nb-input" style="height:42px; padding:4px; margin-bottom:8px;" :disabled="!applyStroke" />
          <input type="number" v-model.number="strokeWidth" min="0" max="20" step="0.5" class="nb-input" :disabled="!applyStroke" placeholder="描边宽度" />
        </div>
        <div>
          <label class="nb-label">缩放 {{ scale }}x</label>
          <input type="range" v-model.number="scale" min="0.1" max="5" step="0.1" class="nb-input" style="padding:8px" />
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div v-if="previewSvg" class="nb-card mt-16">
      <h3 class="nb-h3">操作</h3>
      <div class="mt-16" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="nb-btn primary" @click="optimizeSvg" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span></span>
          优化压缩 SVG
        </button>
        <button class="nb-btn" @click="convertTo('png')" :disabled="processing">转 PNG</button>
        <button class="nb-btn" @click="convertTo('jpeg')" :disabled="processing">转 JPG</button>
        <button class="nb-btn" @click="convertTo('webp')" :disabled="processing">转 WebP</button>
      </div>
    </div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.svg-preview {
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  max-height: 400px;
  overflow: auto;
}
.svg-preview :deep(svg) {
  max-width: 100%;
  max-height: 350px;
  height: auto;
}
.opt-row {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 12px;
  cursor: pointer; margin-bottom: 8px;
}
.opt-row input { accent-color: var(--accent); }
</style>

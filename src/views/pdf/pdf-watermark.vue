<script setup>
/**
 * PDF加水印 - 文字水印 + 图片水印
 * 用 pdf-lib drawText/drawImage
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib, embedChineseFont, hexToRgb } from '../../utils/pdflib.js'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)

// 文字水印配置
const mode = ref('text')
const text = ref('机密')
const fontSize = ref(60)
const fontColor = ref('#ff5a1f')
const opacity = ref(0.3)
const rotation = ref(45)
const position = ref('center')  // center | tile | corner
const cornerPos = ref('bottom-right')

// 图片水印
const watermarkImage = ref(null)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdfLib(buf)
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

function onImageSelect(e) {
  const f = e.target.files?.[0]
  if (f) watermarkImage.value = f
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  if (mode.value === 'text' && !text.value.trim()) { showError('请输入水印文字'); return }
  if (mode.value === 'image' && !watermarkImage.value) { showError('请选择水印图片'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const pages = doc.getPages()
    progressText.value = '准备字体...'
    let font
    try {
      font = await embedChineseFont(doc)
    } catch (e) {
      font = await doc.embedFont(StandardFonts.Helvetica)
    }

    let img = null
    if (mode.value === 'image') {
      const buf = await watermarkImage.value.arrayBuffer()
      try {
        if (watermarkImage.value.type.includes('png')) img = await doc.embedPng(buf)
        else img = await doc.embedJpg(buf)
      } catch (e) {
        throw new Error('水印图片格式不支持,请使用PNG或JPG')
      }
    }

    const color = hexToRgb(fontColor.value)
    const opacityVal = opacity.value
    const rot = degrees(rotation.value)

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const { width, height } = page.getSize()
      if (mode.value === 'text') {
        const textWidth = font.widthOfTextAtSize(text.value, fontSize.value)
        const textHeight = fontSize.value
        if (position.value === 'center') {
          page.drawText(text.value, {
            x: width / 2 - textWidth / 2,
            y: height / 2 - textHeight / 2,
            size: fontSize.value, font, color, opacity: opacityVal, rotate: rot
          })
        } else if (position.value === 'tile') {
          // 平铺
          const stepX = textWidth + 80
          const stepY = fontSize.value * 4
          for (let y = -stepY; y < height + stepY; y += stepY) {
            for (let x = -stepX; x < width + stepX; x += stepX) {
              page.drawText(text.value, {
                x, y, size: fontSize.value, font, color, opacity: opacityVal, rotate: rot
              })
            }
          }
        } else if (position.value === 'corner') {
          const margin = 30
          let x = margin, y = margin
          if (cornerPos.value.includes('right')) x = width - textWidth - margin
          if (cornerPos.value.includes('top')) y = height - fontSize.value - margin
          page.drawText(text.value, {
            x, y, size: fontSize.value, font, color, opacity: opacityVal
          })
        }
      } else if (mode.value === 'image' && img) {
        const imgW = Math.min(width, height) * 0.3
        const imgH = imgW * (img.height / img.width)
        if (position.value === 'center') {
          page.drawImage(img, {
            x: width / 2 - imgW / 2, y: height / 2 - imgH / 2,
            width: imgW, height: imgH, opacity: opacityVal, rotate: rot
          })
        } else if (position.value === 'corner') {
          const margin = 30
          let x = margin, y = margin
          if (cornerPos.value.includes('right')) x = width - imgW - margin
          if (cornerPos.value.includes('top')) y = height - imgH - margin
          page.drawImage(img, { x, y, width: imgW, height: imgH, opacity: opacityVal })
        }
      }
      progress.value = Math.round(((i + 1) / pages.length) * 90)
      progressText.value = `加水印 ${i + 1}/${pages.length} 页`
    }

    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_watermarked.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF加水印失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF加水印" desc="为PDF添加文字或图片水印" icon="◐">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">水印类型</label>
      <select class="nb-select" v-model="mode" style="max-width:200px">
        <option value="text">文字水印</option>
        <option value="image">图片水印</option>
      </select>
    </div>

    <div v-if="mode === 'text'" class="nb-grid cols-2 mt-16">
      <div>
        <label class="nb-label">水印文字</label>
        <input class="nb-input" v-model="text" placeholder="如: 机密、版权" />
      </div>
      <div>
        <label class="nb-label">字号</label>
        <input class="nb-input" type="number" v-model="fontSize" min="10" max="200" />
      </div>
      <div>
        <label class="nb-label">颜色</label>
        <input class="nb-input" type="color" v-model="fontColor" />
      </div>
      <div>
        <label class="nb-label">不透明度 {{ Math.round(opacity * 100) }}%</label>
        <input class="nb-input" type="range" min="0.05" max="1" step="0.05" v-model="opacity" />
      </div>
      <div>
        <label class="nb-label">旋转角度</label>
        <input class="nb-input" type="number" v-model="rotation" min="-180" max="180" />
      </div>
      <div>
        <label class="nb-label">位置</label>
        <select class="nb-select" v-model="position">
          <option value="center">居中</option>
          <option value="tile">平铺(覆盖整页)</option>
          <option value="corner">角落</option>
        </select>
      </div>
      <div v-if="position === 'corner'">
        <label class="nb-label">角落位置</label>
        <select class="nb-select" v-model="cornerPos">
          <option value="top-left">左上</option>
          <option value="top-right">右上</option>
          <option value="bottom-left">左下</option>
          <option value="bottom-right">右下</option>
        </select>
      </div>
    </div>

    <div v-if="mode === 'image'" class="mt-16">
      <label class="nb-label">水印图片(PNG/JPG)</label>
      <input type="file" accept="image/png,image/jpeg" @change="onImageSelect" class="nb-input" />
      <div v-if="watermarkImage" class="nb-subtitle mt-8">已选: {{ watermarkImage.name }}</div>
      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">不透明度 {{ Math.round(opacity * 100) }}%</label>
          <input class="nb-input" type="range" min="0.05" max="1" step="0.05" v-model="opacity" />
        </div>
        <div>
          <label class="nb-label">位置</label>
          <select class="nb-select" v-model="position">
            <option value="center">居中</option>
            <option value="corner">角落</option>
          </select>
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 加水印中...</span>
        <span v-else>开始加水印</span>
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

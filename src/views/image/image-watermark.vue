<script setup>
/**
 * 图片加水印
 * - 文字水印或图片水印
 * - 位置(9宫格)、不透明度、大小、角度
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { readFileAsDataURL } from '../../utils/fileReader.js'
import { replaceExt } from '../../utils/download.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

// 水印类型
const watermarkType = ref('text')  // text | image
const text = ref('水印示例')
const fontSize = ref(48)
const fontColor = ref('#ff5a1f')
const opacity = ref(0.7)
const angle = ref(-30)
const position = ref('br')  // 9宫格位置
const repeat = ref(false)  // 平铺
const watermarkImage = ref(null)  // 水印图片File
const watermarkImageUrl = ref('')
const watermarkImageSize = ref(20)  // 占宽度的百分比

const positions = [
  { value: 'tl', label: '↖' }, { value: 'tc', label: '↑' }, { value: 'tr', label: '↗' },
  { value: 'ml', label: '←' }, { value: 'mc', label: '·' }, { value: 'mr', label: '→' },
  { value: 'bl', label: '↙' }, { value: 'bc', label: '↓' }, { value: 'br', label: '↘' }
]

function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
  result.value = []
  error.value = ''
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

async function onWatermarkSelect(selected) {
  if (!selected) return
  watermarkImage.value = selected
  watermarkImageUrl.value = await readFileAsDataURL(selected)
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

async function loadImage(file) {
  const url = URL.createObjectURL(file)
  objectUrls.value.push(url)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return { img, url }
}

function getPos(canvas, w, h) {
  // 9宫格位置
  const margin = 20
  const [v, h_pos] = position.value.split('')
  let x, y
  if (v === 't') y = margin
  else if (v === 'm') y = (canvas.height - h) / 2
  else y = canvas.height - h - margin
  if (h_pos === 'l') x = margin
  else if (h_pos === 'c') x = (canvas.width - w) / 2
  else x = canvas.width - w - margin
  return { x, y }
}

async function applyWatermark(targetImg, file) {
  const canvas = document.createElement('canvas')
  canvas.width = targetImg.naturalWidth || targetImg.width
  canvas.height = targetImg.naturalHeight || targetImg.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(targetImg, 0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.globalAlpha = opacity.value

  if (watermarkType.value === 'text') {
    // 设置字体
    const fontSizeActual = (fontSize.value / 100) * Math.min(canvas.width, canvas.height)
    ctx.font = `bold ${fontSizeActual}px 'IBM Plex Mono', monospace`
    ctx.fillStyle = fontColor.value
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = fontSizeActual * 0.04

    if (repeat.value) {
      // 平铺模式
      const angleRad = (angle.value * Math.PI) / 180
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(angleRad)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const spacing = fontSizeActual * 4
      const range = Math.max(canvas.width, canvas.height) * 1.5
      for (let y = -range; y < range; y += spacing) {
        for (let x = -range; x < range; x += spacing) {
          ctx.strokeText(text.value, x, y)
          ctx.fillText(text.value, x, y)
        }
      }
    } else {
      // 单点位置
      const angleRad = (angle.value * Math.PI) / 180
      const metrics = ctx.measureText(text.value)
      const w = metrics.width
      const h = fontSizeActual
      const { x, y } = getPos(canvas, w, h)
      ctx.translate(x + w / 2, y + h / 2)
      ctx.rotate(angleRad)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeText(text.value, 0, 0)
      ctx.fillText(text.value, 0, 0)
    }
  } else if (watermarkType.value === 'image' && watermarkImage.value) {
    // 加载水印图片
    const wmUrl = URL.createObjectURL(watermarkImage.value)
    objectUrls.value.push(wmUrl)
    const wmImg = new Image()
    wmImg.src = wmUrl
    await new Promise((resolve, reject) => {
      wmImg.onload = resolve
      wmImg.onerror = reject
    })

    const wmW = (watermarkImageSize.value / 100) * canvas.width
    const wmH = (wmImg.naturalHeight / wmImg.naturalWidth) * wmW

    if (repeat.value) {
      const angleRad = (angle.value * Math.PI) / 180
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(angleRad)
      const spacing = wmW * 1.5
      const spacingY = wmH * 1.5
      const range = Math.max(canvas.width, canvas.height) * 1.5
      for (let y = -range; y < range; y += spacingY) {
        for (let x = -range; x < range; x += spacing) {
          ctx.drawImage(wmImg, x - wmW / 2, y - wmH / 2, wmW, wmH)
        }
      }
    } else {
      const { x, y } = getPos(canvas, wmW, wmH)
      const angleRad = (angle.value * Math.PI) / 180
      ctx.translate(x + wmW / 2, y + wmH / 2)
      ctx.rotate(angleRad)
      ctx.drawImage(wmImg, -wmW / 2, -wmH / 2, wmW, wmH)
    }
  }

  ctx.restore()

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  return blob
}

async function process() {
  if (!files.value.length) {
    showError('请先选择文件')
    return
  }
  if (watermarkType.value === 'text' && !text.value.trim()) {
    showError('请输入水印文字')
    return
  }
  if (watermarkType.value === 'image' && !watermarkImage.value) {
    showError('请上传水印图片')
    return
  }

  error.value = ''
  result.value = []
  processing.value = true
  cleanupUrls()

  await safeRun(async () => {
    const out = []
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      if (f.size === 0) {
        error.value = `${f.name} 为空，已跳过`
        continue
      }
      try {
        const { img } = await loadImage(f)
        const blob = await applyWatermark(img, f)
        if (!blob || !blob.size) throw new Error('输出为空')
        const url = URL.createObjectURL(blob)
        objectUrls.value.push(url)
        out.push({
          name: replaceExt(f.name, '_watermarked.png'),
          blob, url, size: blob.size
        })
      } catch (e) {
        console.error(`处理 ${f.name} 失败`, e)
        error.value = `${f.name} 处理失败: ${e.message}`
      }
    }
    result.value = out
  }, '加水印失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="图片加水印" desc="文字/图片水印，9宫格位置、平铺、旋转" icon="◐">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,image/*"
              :multiple="true" hint="支持 JPG/PNG/WebP，可批量"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">水印设置</h3>
      <div class="mt-16">
        <label class="nb-label">水印类型</label>
        <div style="display:flex; gap:8px;">
          <label class="mode-card" :class="{ active: watermarkType === 'text' }">
            <input type="radio" v-model="watermarkType" value="text" />
            <strong>文字水印</strong>
          </label>
          <label class="mode-card" :class="{ active: watermarkType === 'image' }">
            <input type="radio" v-model="watermarkType" value="image" />
            <strong>图片水印</strong>
          </label>
        </div>
      </div>

      <div v-if="watermarkType === 'text'" class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">水印文字</label>
          <input v-model="text" class="nb-input" placeholder="如：© 2024 公司名" />
        </div>
        <div>
          <label class="nb-label">字号 {{ fontSize }}%</label>
          <input type="range" v-model.number="fontSize" min="5" max="50" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">颜色</label>
          <input type="color" v-model="fontColor" class="nb-input" style="height:42px; padding:4px;" />
        </div>
      </div>

      <div v-if="watermarkType === 'image'" class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">水印图片</label>
          <input type="file" accept="image/*" @change="(e) => onWatermarkSelect(e.target.files[0])" class="nb-input" />
          <img v-if="watermarkImageUrl" :src="watermarkImageUrl" style="max-height:80px; margin-top:8px; border:2px solid var(--ink);" />
        </div>
        <div>
          <label class="nb-label">水印大小 {{ watermarkImageSize }}% 宽</label>
          <input type="range" v-model.number="watermarkImageSize" min="5" max="80" step="1" class="nb-input" style="padding:8px" />
        </div>
      </div>

      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">不透明度 {{ Math.round(opacity * 100) }}%</label>
          <input type="range" v-model.number="opacity" min="0.1" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">角度 {{ angle }}°</label>
          <input type="range" v-model.number="angle" min="-90" max="90" step="5" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">平铺模式</label>
          <label class="opt-row">
            <input type="checkbox" v-model="repeat" />
            <span>开启平铺（覆盖整张图）</span>
          </label>
        </div>
      </div>

      <div v-if="!repeat" class="mt-16">
        <label class="nb-label">位置（9宫格）</label>
        <div class="grid-9">
          <button v-for="p in positions" :key="p.value"
                  class="grid-cell"
                  :class="{ active: position === p.value }"
                  @click="position = p.value">
            {{ p.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>加水印 ({{ files.length }} 张)</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.mode-card {
  display: flex; align-items: center; gap: 8px;
  padding: 12px; border: 3px solid var(--ink);
  background: var(--paper-card); cursor: pointer;
  flex: 1; transition: all 0.1s ease;
}
.mode-card:hover { background: var(--accent-soft); }
.mode-card.active {
  background: var(--neon); box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-1px, -1px);
}
.mode-card input { margin: 0; accent-color: var(--accent); }

.opt-row {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 13px;
  cursor: pointer; padding: 6px;
}

.grid-9 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  width: 200px;
}
.grid-cell {
  padding: 16px;
  background: var(--paper-card);
  border: 3px solid var(--ink);
  cursor: pointer;
  font-size: 18px;
  transition: all 0.1s ease;
}
.grid-cell:hover { background: var(--accent-soft); }
.grid-cell.active {
  background: var(--accent); color: var(--paper-card);
  box-shadow: 3px 3px 0 var(--ink);
  transform: translate(-1px, -1px);
}
</style>

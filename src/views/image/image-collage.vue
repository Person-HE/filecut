<script setup>
/**
 * 图片拼图
 * - 多图拼贴: 横向/纵向/网格
 * - 间距、边框、背景色
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

// 布局选项
const layout = ref('grid')  // horizontal | vertical | grid
const columns = ref(3)
const gap = ref(10)
const borderWidth = ref(3)
const borderColor = ref('#1a1a1a')
const backgroundColor = ref('#f4ecd8')
const fitMode = ref('cover')  // cover | contain
const cellSize = ref(300)  // 网格单元大小
const outFormat = ref('png')
const quality = ref(0.92)

function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
  result.value = []
  error.value = ''
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

function moveUp(idx) {
  if (idx > 0) {
    [files.value[idx-1], files.value[idx]] = [files.value[idx], files.value[idx-1]]
  }
}
function moveDown(idx) {
  if (idx < files.value.length - 1) {
    [files.value[idx+1], files.value[idx]] = [files.value[idx], files.value[idx+1]]
  }
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
  return img
}

function drawImageFit(ctx, img, x, y, w, h, mode) {
  if (mode === 'cover') {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const dx = x + (w - dw) / 2
    const dy = y + (h - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
  } else {
    // contain
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    const dx = x + (w - dw) / 2
    const dy = y + (h - dh) / 2
    ctx.drawImage(img, dx, dy, dw, dh)
  }
}

async function process() {
  if (files.value.length < 2) {
    showError('请至少选择 2 张图片')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  cleanupUrls()

  await safeRun(async () => {
    // 加载所有图片
    const imgs = []
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      if (f.size === 0) {
        error.value = `${f.name} 为空，已跳过`
        continue
      }
      try {
        const img = await loadImage(f)
        imgs.push({ img, file: f })
      } catch (e) {
        error.value = `${f.name} 加载失败，已跳过`
      }
    }

    if (imgs.length < 2) throw new Error('有效图片不足2张')

    let canvasW, canvasH

    if (layout.value === 'horizontal') {
      // 横向拼接 - 取最大高度作为统一高度
      const targetH = Math.min(...imgs.map(i => i.img.naturalHeight))
      const totalW = imgs.reduce((s, i) => s + (i.img.naturalWidth * targetH / i.img.naturalHeight), 0) + (imgs.length - 1) * gap.value
      canvasW = Math.ceil(totalW + borderWidth.value * 2)
      canvasH = Math.ceil(targetH + borderWidth.value * 2)
    } else if (layout.value === 'vertical') {
      // 纵向拼接 - 取最大宽度作为统一宽度
      const targetW = Math.min(...imgs.map(i => i.img.naturalWidth))
      const totalH = imgs.reduce((s, i) => s + (i.img.naturalHeight * targetW / i.img.naturalWidth), 0) + (imgs.length - 1) * gap.value
      canvasW = Math.ceil(targetW + borderWidth.value * 2)
      canvasH = Math.ceil(totalH + borderWidth.value * 2)
    } else {
      // grid
      const cols = Math.min(columns.value, imgs.length)
      const rows = Math.ceil(imgs.length / cols)
      canvasW = cols * cellSize.value + (cols - 1) * gap.value + borderWidth.value * 2
      canvasH = rows * cellSize.value + (rows - 1) * gap.value + borderWidth.value * 2
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')

    // 背景
    ctx.fillStyle = backgroundColor.value
    ctx.fillRect(0, 0, canvasW, canvasH)

    // 边框
    if (borderWidth.value > 0) {
      ctx.strokeStyle = borderColor.value
      ctx.lineWidth = borderWidth.value
      ctx.strokeRect(borderWidth.value / 2, borderWidth.value / 2, canvasW - borderWidth.value, canvasH - borderWidth.value)
    }

    // 绘制图片
    let x = borderWidth.value
    let y = borderWidth.value

    if (layout.value === 'horizontal') {
      const targetH = Math.min(...imgs.map(i => i.img.naturalHeight))
      for (const { img } of imgs) {
        const w = img.naturalWidth * targetH / img.naturalHeight
        drawImageFit(ctx, img, x, y, w, targetH, 'cover')
        x += w + gap.value
      }
    } else if (layout.value === 'vertical') {
      const targetW = Math.min(...imgs.map(i => i.img.naturalWidth))
      for (const { img } of imgs) {
        const h = img.naturalHeight * targetW / img.naturalWidth
        drawImageFit(ctx, img, x, y, targetW, h, 'cover')
        y += h + gap.value
      }
    } else {
      // grid
      const cols = Math.min(columns.value, imgs.length)
      imgs.forEach(({ img }, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const cx = borderWidth.value + col * (cellSize.value + gap.value)
        const cy = borderWidth.value + row * (cellSize.value + gap.value)
        drawImageFit(ctx, img, cx, cy, cellSize.value, cellSize.value, fitMode.value)
      })
    }

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' }
    const mime = mimeMap[outFormat.value]
    const ext = extMap[outFormat.value]
    const useQuality = outFormat.value !== 'png'

    if (mime !== 'image/png') {
      // 重新填充背景为白色（避免透明区域变黑）
      const tmp = document.createElement('canvas')
      tmp.width = canvasW
      tmp.height = canvasH
      const tctx = tmp.getContext('2d')
      tctx.fillStyle = '#ffffff'
      tctx.fillRect(0, 0, canvasW, canvasH)
      tctx.drawImage(canvas, 0, 0)
      const blob = await new Promise(resolve => tmp.toBlob(resolve, mime, useQuality ? quality.value : undefined))
      const url = URL.createObjectURL(blob)
      objectUrls.value.push(url)
      result.value = [{ name: `拼图_${imgs.length}张.${ext}`, blob, url, size: blob.size }]
    } else {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, useQuality ? quality.value : undefined))
      const url = URL.createObjectURL(blob)
      objectUrls.value.push(url)
      result.value = [{ name: `拼图_${imgs.length}张.${ext}`, blob, url, size: blob.size }]
    }
  }, '拼图失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="图片拼图" desc="多图横向/纵向/网格拼贴" icon="⊞">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,image/*"
              :multiple="true" hint="至少2张图片，可调整顺序"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">排序</h3>
      <div class="sort-list mt-8">
        <div v-for="(f, i) in files" :key="i" class="sort-item">
          <span class="sort-idx">{{ i + 1 }}</span>
          <span class="sort-name">{{ f.name }}</span>
          <div class="sort-ops">
            <button class="nb-btn sm" @click="moveUp(i)" :disabled="i === 0" title="上移">↑</button>
            <button class="nb-btn sm" @click="moveDown(i)" :disabled="i === files.length - 1" title="下移">↓</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">布局设置</h3>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">布局方式</label>
          <select v-model="layout" class="nb-select">
            <option value="grid">网格</option>
            <option value="horizontal">横向拼接</option>
            <option value="vertical">纵向拼接</option>
          </select>
        </div>
        <div v-if="layout === 'grid'">
          <label class="nb-label">每行列数</label>
          <input type="number" v-model.number="columns" min="1" max="10" class="nb-input" />
        </div>
        <div v-if="layout === 'grid'">
          <label class="nb-label">单元尺寸 {{ cellSize }}px</label>
          <input type="range" v-model.number="cellSize" min="100" max="800" step="50" class="nb-input" style="padding:8px" />
        </div>
        <div v-if="layout === 'grid'">
          <label class="nb-label">填充模式</label>
          <select v-model="fitMode" class="nb-select">
            <option value="cover">cover（填充裁剪）</option>
            <option value="contain">contain（完整显示）</option>
          </select>
        </div>
        <div>
          <label class="nb-label">间距 {{ gap }}px</label>
          <input type="range" v-model.number="gap" min="0" max="50" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">边框宽度 {{ borderWidth }}px</label>
          <input type="range" v-model.number="borderWidth" min="0" max="20" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">边框颜色</label>
          <input type="color" v-model="borderColor" class="nb-input" style="height:42px; padding:4px;" />
        </div>
        <div>
          <label class="nb-label">背景色</label>
          <input type="color" v-model="backgroundColor" class="nb-input" style="height:42px; padding:4px;" />
        </div>
      </div>
      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">输出格式</label>
          <select v-model="outFormat" class="nb-select">
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
        <div v-if="outFormat !== 'png'">
          <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input type="range" v-model.number="quality" min="0.3" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 拼接中...</span>
        <span v-else>开始拼图</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.sort-list { display: flex; flex-direction: column; gap: 4px; }
.sort-item {
  display: flex; align-items: center; gap: 12px;
  padding: 6px 10px; border: 2px solid var(--ink);
  background: var(--paper-card);
  font-family: var(--font-mono); font-size: 12px;
}
.sort-idx {
  background: var(--ink); color: var(--neon);
  padding: 2px 8px; font-weight: 700;
}
.sort-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sort-ops { display: flex; gap: 4px; }
</style>

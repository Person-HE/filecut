<script setup>
/**
 * 长图拼接
 * - 多张图片垂直拼接成长图
 * - 自动对齐宽度（按最大宽度）
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

// 选项
const alignMode = ref('max')  // max | min | custom
const customWidth = ref(1080)
const gap = ref(0)
const backgroundColor = ref('#ffffff')
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
  if (idx > 0) [files.value[idx-1], files.value[idx]] = [files.value[idx], files.value[idx-1]]
}
function moveDown(idx) {
  if (idx < files.value.length - 1) [files.value[idx+1], files.value[idx]] = [files.value[idx], files.value[idx+1]]
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

async function process() {
  if (files.value.length < 2) {
    showError('至少需要2张图片')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  cleanupUrls()

  await safeRun(async () => {
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

    // 决定目标宽度
    let targetW
    if (alignMode.value === 'max') {
      targetW = Math.max(...imgs.map(i => i.img.naturalWidth))
    } else if (alignMode.value === 'min') {
      targetW = Math.min(...imgs.map(i => i.img.naturalWidth))
    } else {
      targetW = customWidth.value
    }

    // 计算每张图缩放后的高度
    let totalH = 0
    const scaled = imgs.map(({ img }) => {
      const w = targetW
      const h = Math.round(img.naturalHeight * targetW / img.naturalWidth)
      totalH += h
      return { img, w, h }
    })
    totalH += (imgs.length - 1) * gap.value

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')

    // 填充背景
    ctx.fillStyle = backgroundColor.value
    ctx.fillRect(0, 0, targetW, totalH)

    // 绘制
    let y = 0
    for (const { img, w, h } of scaled) {
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, y, w, h)
      y += h + gap.value
    }

    const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
    const extMap = { png: 'png', jpeg: 'jpg', webp: 'webp' }
    const mime = mimeMap[outFormat.value]
    const ext = extMap[outFormat.value]
    const useQuality = outFormat.value !== 'png'

    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, useQuality ? quality.value : undefined))
    if (!blob || !blob.size) throw new Error('生成长图失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = `长图_${imgs.length}张.${ext}`
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '长图拼接失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="长图拼接" desc="多张图片垂直拼接成长图，自动对齐宽度" icon="⫴">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,image/*"
              :multiple="true" hint="至少2张图片，按添加顺序拼接"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <!-- 排序列表 -->
    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">图片顺序（从上到下）</h3>
      <div class="sort-list mt-8">
        <div v-for="(f, i) in files" :key="i" class="sort-item">
          <span class="sort-idx">{{ i + 1 }}</span>
          <span class="sort-name">{{ f.name }}</span>
          <div class="sort-ops">
            <button class="nb-btn sm" @click="moveUp(i)" :disabled="i === 0">↑</button>
            <button class="nb-btn sm" @click="moveDown(i)" :disabled="i === files.length - 1">↓</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">拼接设置</h3>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">宽度对齐方式</label>
          <select v-model="alignMode" class="nb-select">
            <option value="max">最大宽度对齐</option>
            <option value="min">最小宽度对齐</option>
            <option value="custom">自定义宽度</option>
          </select>
        </div>
        <div v-if="alignMode === 'custom'">
          <label class="nb-label">自定义宽度 (px)</label>
          <input type="number" v-model.number="customWidth" min="100" max="5000" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">间距 {{ gap }}px</label>
          <input type="range" v-model.number="gap" min="0" max="50" step="1" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">背景色</label>
          <input type="color" v-model="backgroundColor" class="nb-input" style="height:42px; padding:4px;" />
        </div>
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
        <span v-else>生成长图</span>
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

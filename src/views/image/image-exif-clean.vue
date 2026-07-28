<script setup>
/**
 * EXIF 批量清理
 * - 批量清除EXIF元数据
 * - 用 Canvas 重绘图片剥离EXIF
 * - 输出ZIP
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import JSZip from 'jszip'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

// 处理状态
const fileStatus = ref([])  // [{ status, original, cleaned, name }]

function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
  resetStatus()
  result.value = []
  error.value = ''
}

function removeFile(idx) {
  files.value.splice(idx, 1)
  resetStatus()
}

function resetStatus() {
  fileStatus.value = files.value.map(f => ({
    status: 'pending',
    name: f.name,
    original: f.size,
    cleaned: 0,
    originalExif: !!f.type  // 简化
  }))
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

async function cleanImage(file) {
  const { img } = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  // 保留原格式，但EXIF被剥离
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  let mime = 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
  else if (ext === 'webp') mime = 'image/webp'
  else if (ext === 'png') mime = 'image/png'
  else mime = 'image/png'

  // JPEG 需要白色背景
  if (mime === 'image/jpeg') {
    const tmp = document.createElement('canvas')
    tmp.width = canvas.width
    tmp.height = canvas.height
    const tctx = tmp.getContext('2d')
    tctx.fillStyle = '#ffffff'
    tctx.fillRect(0, 0, tmp.width, tmp.height)
    tctx.drawImage(canvas, 0, 0)
    return await new Promise(resolve => tmp.toBlob(resolve, mime, 0.95))
  }
  return await new Promise(resolve => canvas.toBlob(resolve, mime))
}

async function process() {
  if (!files.value.length) {
    showError('请先选择文件')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  cleanupUrls()
  resetStatus()

  await safeRun(async () => {
    const cleaned = []
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      fileStatus.value[i].status = 'processing'
      progressText.value = `清理 ${i+1}/${files.value.length}: ${f.name}`
      progress.value = Math.round((i / files.value.length) * 100)

      if (f.size === 0) {
        fileStatus.value[i].status = 'error'
        fileStatus.value[i].error = '空文件'
        continue
      }
      try {
        const blob = await cleanImage(f)
        if (!blob || !blob.size) throw new Error('输出为空')
        cleaned.push({ name: f.name, blob })
        fileStatus.value[i].status = 'done'
        fileStatus.value[i].cleaned = blob.size
      } catch (e) {
        console.error(`清理 ${f.name} 失败`, e)
        fileStatus.value[i].status = 'error'
        fileStatus.value[i].error = e.message
      }
    }

    if (!cleaned.length) throw new Error('全部文件清理失败')

    progressText.value = '打包 ZIP...'
    progress.value = 95

    const zip = new JSZip()
    for (const c of cleaned) {
      zip.file(c.name, c.blob)
    }
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    if (!zipBlob.size) throw new Error('打包失败')

    const url = URL.createObjectURL(zipBlob)
    objectUrls.value.push(url)
    result.value = [{
      name: `清理EXIF_${cleaned.length}个文件.zip`,
      blob: zipBlob, url, size: zipBlob.size
    }]

    progress.value = 100
    progressText.value = `完成 ${cleaned.length}/${files.value.length}`
  }, 'EXIF清理失败')

  processing.value = false
}

const totalOriginal = () => fileStatus.value.reduce((s, f) => s + (f.original || 0), 0)
const totalCleaned = () => fileStatus.value.reduce((s, f) => s + (f.cleaned || 0), 0)
</script>

<template>
  <ToolLayout title="EXIF批量清理" desc="批量清除图片EXIF元数据，保护隐私" icon="✕">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,image/*"
              :multiple="true" hint="支持 JPG/PNG/WebP，可批量"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <div v-if="files.length" class="nb-alert info mt-16">
      <strong>说明：</strong>通过Canvas重绘图片完全剥离EXIF元数据（包括相机型号、GPS位置、拍摄时间等隐私信息）。
      输出ZIP包含清理后的图片。
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>清理并打包 ({{ files.length }} 张)</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 文件状态 -->
    <div v-if="fileStatus.length" class="nb-card mt-16">
      <h3 class="nb-h3">处理状态</h3>
      <div class="mt-8" v-if="fileStatus.some(f => f.status === 'done')">
        <span class="nb-tag neon">
          清理后: {{ formatBytes(totalCleaned()) }} / 原始: {{ formatBytes(totalOriginal()) }}
          ({{ ((1 - totalCleaned()/totalOriginal()) * 100).toFixed(1) }}% 变化)
        </span>
      </div>
      <div class="status-list mt-16">
        <div v-for="(s, i) in fileStatus" :key="i" class="status-row"
             :class="'status-' + s.status">
          <span class="status-icon">
            <span v-if="s.status === 'pending'" class="nb-tag">⏸ 待处理</span>
            <span v-else-if="s.status === 'processing'" class="nb-tag accent">
              <span class="nb-spinner" style="width:12px;height:12px;border-width:2px;"></span> 处理中
            </span>
            <span v-else-if="s.status === 'done'" class="nb-tag neon">✓ 已清理</span>
            <span v-else class="nb-tag" style="background:var(--danger);color:#fff;">× 失败</span>
          </span>
          <span class="status-name">{{ s.name }}</span>
          <span class="status-size">
            {{ formatBytes(s.original) }}
            <span v-if="s.cleaned"> → {{ formatBytes(s.cleaned) }}</span>
            <span v-if="s.error" class="nb-tag sm" style="background:var(--danger);color:#fff;">{{ s.error }}</span>
          </span>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.status-row {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px; border: 2px solid var(--ink);
  background: var(--paper-card); margin-bottom: 6px;
  font-family: var(--font-mono); font-size: 12px;
}
.status-row.status-done { background: rgba(196, 255, 0, 0.15); }
.status-row.status-error { background: rgba(212, 0, 0, 0.1); }
.status-row.status-processing { background: rgba(255, 90, 31, 0.1); }
.status-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-size { display: flex; align-items: center; gap: 6px; }
.status-icon { min-width: 90px; }
</style>

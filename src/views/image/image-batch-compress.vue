<script setup>
/**
 * 批量图片压缩
 * - 多文件批量压缩，使用 browser-image-compression (内部已用Web Worker)
 * - 显示进度，输出ZIP包
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import imageCompression from 'browser-image-compression'
import JSZip from 'jszip'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

// 每个文件的处理状态
const fileStatus = ref([])  // [{ status: 'pending'|'processing'|'done'|'error', original, compressed, name }]

// 选项
const quality = ref(0.7)
const maxWidth = ref(1920)
const maxHeight = ref(1920)

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
    compressed: 0
  }))
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

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
    const options = {
      maxWidthOrHeight: Math.max(maxWidth.value, maxHeight.value),
      useWebWorker: true,
      initialQuality: quality.value
    }

    const compressed = []
    let totalSaved = 0

    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      fileStatus.value[i].status = 'processing'
      progressText.value = `压缩 ${i+1}/${files.value.length}: ${f.name}`
      progress.value = Math.round((i / files.value.length) * 100)

      if (f.size === 0) {
        fileStatus.value[i].status = 'error'
        fileStatus.value[i].error = '空文件'
        continue
      }

      try {
        const blob = await imageCompression(f, options)
        if (!blob || !blob.size) throw new Error('输出为空')

        const outName = replaceExt(f.name, '_compressed') + '.' + (f.name.split('.').pop() || 'jpg').toLowerCase()
        compressed.push({ name: outName, blob })
        fileStatus.value[i].status = 'done'
        fileStatus.value[i].compressed = blob.size
        totalSaved += (f.size - blob.size)
      } catch (e) {
        console.error(`压缩 ${f.name} 失败`, e)
        fileStatus.value[i].status = 'error'
        fileStatus.value[i].error = e.message
      }
    }

    if (!compressed.length) throw new Error('全部文件压缩失败')

    progressText.value = '打包 ZIP...'
    progress.value = 95

    const zip = new JSZip()
    for (const c of compressed) {
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
      name: '批量压缩结果.zip',
      blob: zipBlob,
      url,
      size: zipBlob.size
    }]

    progress.value = 100
    progressText.value = `完成 ${compressed.length}/${files.value.length}，共节省 ${formatBytes(totalSaved)}`
  }, '批量压缩失败')

  processing.value = false
}

const totalOriginal = () => fileStatus.value.reduce((s, f) => s + (f.original || 0), 0)
const totalCompressed = () => fileStatus.value.reduce((s, f) => s + (f.compressed || 0), 0)
</script>

<template>
  <ToolLayout title="批量图片压缩" desc="批量压缩多张图片，输出ZIP" icon="▤">
    <FileDrop accept=".jpg,.jpeg,.png,.webp,image/*"
              :multiple="true" hint="支持 JPG/PNG/WebP，可批量添加"
              @select="onFileSelect" @error="showError" />

    <FileList :files="files" class="mt-16" @remove="removeFile" v-if="files.length" />

    <div v-if="files.length" class="nb-card mt-16">
      <h3 class="nb-h3">压缩参数</h3>
      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">质量 {{ Math.round(quality * 100) }}%</label>
          <input type="range" v-model.number="quality" min="0.1" max="1" step="0.05" class="nb-input" style="padding:8px" />
        </div>
        <div>
          <label class="nb-label">最大宽度 (px)</label>
          <input type="number" v-model.number="maxWidth" min="100" max="10000" class="nb-input" />
        </div>
        <div>
          <label class="nb-label">最大高度 (px)</label>
          <input type="number" v-model.number="maxHeight" min="100" max="10000" class="nb-input" />
        </div>
      </div>
    </div>

    <div v-if="files.length" class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>批量压缩 ({{ files.length }} 张)</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 文件处理状态列表 -->
    <div v-if="fileStatus.length" class="nb-card mt-16">
      <h3 class="nb-h3">处理状态</h3>
      <div class="mt-8" v-if="fileStatus.some(f => f.status === 'done')">
        <span class="nb-tag neon">
          节省: {{ formatBytes(Math.max(0, totalOriginal() - totalCompressed())) }}
          / 原始: {{ formatBytes(totalOriginal()) }}
        </span>
      </div>
      <div class="status-list mt-16">
        <div v-for="(s, i) in fileStatus" :key="i" class="status-row"
             :class="'status-' + s.status">
          <span class="status-icon">
            <span v-if="s.status === 'pending'" class="nb-tag">⏸ 待处理</span>
            <span v-else-if="s.status === 'processing'" class="nb-tag accent"><span class="nb-spinner" style="width:12px;height:12px;border-width:2px;"></span> 处理中</span>
            <span v-else-if="s.status === 'done'" class="nb-tag neon">✓ 完成</span>
            <span v-else class="nb-tag" style="background:var(--danger);color:#fff;">× 错误</span>
          </span>
          <span class="status-name">{{ s.name }}</span>
          <span class="status-size">
            {{ formatBytes(s.original) }}
            <span v-if="s.compressed">→ {{ formatBytes(s.compressed) }}</span>
            <span v-if="s.status === 'done' && s.compressed < s.original" class="nb-tag sm neon">
              -{{ ((1 - s.compressed/s.original) * 100).toFixed(0) }}%
            </span>
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 2px solid var(--ink);
  background: var(--paper-card);
  margin-bottom: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.status-row.status-done { background: rgba(196, 255, 0, 0.15); }
.status-row.status-error { background: rgba(212, 0, 0, 0.1); }
.status-row.status-processing { background: rgba(255, 90, 31, 0.1); }
.status-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-size { display: flex; align-items: center; gap: 6px; }
.status-icon { min-width: 90px; }
</style>

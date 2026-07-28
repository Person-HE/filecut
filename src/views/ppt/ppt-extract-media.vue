<script setup>
/**
 * PPT 提取媒体
 * - JSZip 解压 .pptx
 * - 提取 ppt/media/ 目录下所有图片、视频
 * - 输出ZIP包或单独下载
 */
import { ref, onUnmounted } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { formatBytes } from '../../utils/format.js'
import { replaceExt } from '../../utils/download.js'
import JSZip from 'jszip'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const objectUrls = ref([])

// 提取到的媒体列表
const mediaItems = ref([])  // [{ name, blob, url, size, type }]
const extractAll = ref(true)  // true=打包ZIP, false=单独
const selectedMedia = ref(new Set())

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  mediaItems.value = []
  selectedMedia.value = new Set()
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  mediaItems.value = []
  selectedMedia.value = new Set()
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

function getMediaType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'avi', 'mov', 'wmv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) return 'audio'
  return 'other'
}

function mediaIcon(type) {
  return { image: '🖼', video: '🎬', audio: '♪', other: '📄' }[type] || '📄'
}

async function extract() {
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
  mediaItems.value = []
  selectedMedia.value = new Set()
  processing.value = true
  progress.value = 0
  progressText.value = '解压 PPT 中...'
  cleanupUrls()

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const zip = await JSZip.loadAsync(buf)

    // 找出所有 ppt/media/ 下的文件
    const mediaPaths = Object.keys(zip.files).filter(n => /^ppt\/media\//i.test(n) && !zip.files[n].dir)
    if (!mediaPaths.length) throw new Error('PPT中未找到任何媒体文件')

    progressText.value = `提取 ${mediaPaths.length} 个媒体文件...`
    const items = []
    for (let i = 0; i < mediaPaths.length; i++) {
      const path = mediaPaths[i]
      progress.value = Math.round((i / mediaPaths.length) * 100)
      const name = path.split('/').pop()
      const blob = await zip.files[path].async('blob')
      const url = URL.createObjectURL(blob)
      objectUrls.value.push(url)
      items.push({
        name,
        path,
        blob,
        url,
        size: blob.size,
        type: getMediaType(name)
      })
    }

    mediaItems.value = items
    selectedMedia.value = new Set(items.map((_, i) => i))
    progress.value = 100
    progressText.value = `共提取 ${items.length} 个媒体文件`
  }, 'PPT提取媒体失败')

  processing.value = false
}

async function packZip() {
  const items = extractAll.value
    ? mediaItems.value
    : mediaItems.value.filter((_, i) => selectedMedia.value.has(i))

  if (!items.length) {
    showError('请至少选择一个文件')
    return
  }

  error.value = ''
  result.value = []
  processing.value = true
  progressText.value = '打包ZIP中...'

  await safeRun(async () => {
    const zip = new JSZip()
    for (const item of items) {
      zip.file(item.name, item.blob)
    }
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, (meta) => {
      progress.value = Math.round(meta.percent)
      progressText.value = `压缩中... ${Math.round(meta.percent)}%`
    })
    if (!blob.size) throw new Error('打包失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_媒体.zip')
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '打包ZIP失败')

  processing.value = false
}

function toggleSelect(idx) {
  if (selectedMedia.value.has(idx)) selectedMedia.value.delete(idx)
  else selectedMedia.value.add(idx)
  // 触发响应式
  selectedMedia.value = new Set(selectedMedia.value)
}

function selectAll() {
  selectedMedia.value = new Set(mediaItems.value.map((_, i) => i))
}
function selectNone() {
  selectedMedia.value = new Set()
}
</script>

<template>
  <ToolLayout title="PPT提取媒体" desc="提取PPT内嵌的图片、视频、音频" icon="⇪">
    <FileDrop accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              :multiple="false" hint="仅支持 .pptx 格式"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16">
      <button class="nb-btn primary lg" @click="extract" :disabled="processing">
        <span v-if="processing && !mediaItems.length"><span class="nb-spinner"></span> {{ progressText }}</span>
        <span v-else>开始提取</span>
      </button>
    </div>

    <div v-if="processing && !mediaItems.length" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="mediaItems.length" class="mt-16">
      <div class="nb-card">
        <div class="between" style="flex-wrap:wrap; gap:8px;">
          <h3 class="nb-h3">提取到 {{ mediaItems.length }} 个媒体文件</h3>
          <div class="gap-8" style="display:flex;flex-wrap:wrap;">
            <button class="nb-btn sm" @click="selectAll">全选</button>
            <button class="nb-btn sm" @click="selectNone">全不选</button>
            <label class="nb-tag" style="display:flex;align-items:center;gap:6px;padding:6px 10px;">
              <input type="checkbox" v-model="extractAll" /> 全部打包
            </label>
          </div>
        </div>

        <div class="media-grid mt-16">
          <div v-for="(m, i) in mediaItems" :key="i"
               class="media-item"
               :class="{ selected: selectedMedia.has(i) }"
               @click="toggleSelect(i)">
            <div class="media-preview">
              <img v-if="m.type === 'image'" :src="m.url" :alt="m.name" />
              <span v-else class="media-icon">{{ mediaIcon(m.type) }}</span>
            </div>
            <div class="media-info">
              <div class="media-name" :title="m.name">{{ m.name }}</div>
              <div class="media-meta">
                <span class="nb-tag sm">{{ m.type }}</span>
                <span class="media-size">{{ formatBytes(m.size) }}</span>
              </div>
              <a :href="m.url" :download="m.name" class="nb-btn sm" @click.stop>下载</a>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-16">
        <button class="nb-btn primary lg" @click="packZip" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> {{ progressText }}</span>
          <span v-else>打包选中文件为 ZIP</span>
        </button>
      </div>

      <div v-if="processing" class="mt-16">
        <div class="nb-progress">
          <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
        </div>
      </div>

      <ResultViewer :files="result" />
    </div>
  </ToolLayout>
</template>

<style scoped>
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.media-item {
  border: 3px solid var(--ink);
  background: var(--paper-card);
  cursor: pointer;
  transition: all 0.1s ease;
  overflow: hidden;
}
.media-item:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.media-item.selected {
  background: var(--neon);
  box-shadow: 4px 4px 0 var(--ink);
}
.media-preview {
  width: 100%;
  height: 120px;
  background: var(--paper-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 2px solid var(--ink);
}
.media-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-icon {
  font-size: 3rem;
}
.media-info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.media-name {
  font-family: var(--font-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.media-size {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-soft);
}
</style>

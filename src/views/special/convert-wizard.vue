<script setup>
/**
 * 文件转换向导
 * - 上传任意文件
 * - 检测文件类型
 * - 智能推荐可用的工具列表
 * - 一键跳转到对应工具
 */
import { ref } from 'vue'
import { fileTypeFromBuffer } from 'file-type'
import { allTools } from '../../router/categories.js'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { getExt } from '../../utils/download.js'

const file = ref(null)
const processing = ref(false)
const detected = ref(null)
const recommendations = ref([])
const error = ref('')

// 文件类型到推荐工具的映射
const RECOMMEND_MAP = {
  pdf: ['pdf-merge', 'pdf-split', 'pdf-compress', 'pdf-rotate', 'pdf-watermark', 'pdf-to-word', 'pdf-to-image', 'pdf-to-txt', 'pdf-encrypt', 'pdf-metadata', 'pdf-repair', 'chinese-font-embed', 'pdf-decrypt-helper', 'privacy-scanner'],
  doc: ['word-preview', 'word-to-pdf', 'word-to-html', 'word-to-image', 'word-to-txt', 'word-template', 'word-clean', 'compat-check', 'privacy-scanner'],
  docx: ['word-preview', 'word-to-pdf', 'word-to-html', 'word-to-image', 'word-to-txt', 'word-template', 'word-edit', 'word-compare', 'word-count', 'word-clean', 'compat-check', 'privacy-scanner'],
  xls: ['excel-preview', 'excel-to-pdf', 'excel-to-csv', 'excel-to-json', 'excel-to-html', 'excel-edit', 'excel-clean', 'compat-check'],
  xlsx: ['excel-preview', 'excel-to-pdf', 'excel-to-csv', 'excel-to-json', 'excel-to-html', 'csv-to-excel', 'excel-edit', 'excel-filter', 'excel-formula', 'excel-chart', 'excel-merge', 'excel-clean', 'compat-check', 'privacy-scanner'],
  ppt: ['ppt-preview', 'ppt-to-pdf', 'ppt-to-image', 'ppt-to-pdf-album', 'ppt-template', 'ppt-extract-media', 'ppt-to-markdown', 'compat-check'],
  pptx: ['ppt-preview', 'ppt-to-pdf', 'ppt-to-image', 'ppt-to-pdf-album', 'ppt-template', 'ppt-extract-media', 'ppt-to-markdown', 'compat-check', 'privacy-scanner'],
  jpg: ['image-convert', 'image-compress', 'image-batch-compress', 'image-crop', 'image-watermark', 'image-collage', 'image-bg-remove', 'image-exif', 'image-exif-clean', 'image-adjust', 'image-ocr', 'image-long-screenshot', 'privacy-scanner'],
  jpeg: ['image-convert', 'image-compress', 'image-batch-compress', 'image-crop', 'image-watermark', 'image-collage', 'image-bg-remove', 'image-exif', 'image-exif-clean', 'image-adjust', 'image-ocr', 'privacy-scanner'],
  png: ['image-convert', 'image-compress', 'image-batch-compress', 'image-crop', 'image-watermark', 'image-collage', 'image-bg-remove', 'image-exif', 'image-exif-clean', 'image-adjust', 'image-ocr', 'privacy-scanner'],
  webp: ['image-convert', 'image-compress', 'image-batch-compress', 'image-crop', 'image-watermark', 'image-bg-remove', 'image-exif', 'image-exif-clean', 'image-adjust', 'image-ocr'],
  heic: ['image-convert', 'image-compress', 'image-crop', 'image-watermark', 'image-bg-remove', 'image-adjust'],
  bmp: ['image-convert', 'image-compress', 'image-crop', 'image-watermark', 'image-bg-remove', 'image-adjust'],
  tiff: ['image-convert', 'image-compress', 'image-crop', 'image-watermark', 'image-bg-remove', 'image-adjust'],
  gif: ['image-convert', 'image-compress', 'image-crop', 'image-watermark', 'gif-maker'],
  svg: ['image-convert', 'image-compress', 'image-crop', 'image-watermark', 'svg-edit'],
  zip: ['zip-extract', 'zip-preview', 'zip-edit'],
  '7z': ['zip-extract', 'zip-preview'],
  rar: ['zip-extract', 'zip-preview'],
  gz: ['zip-extract'],
  tar: ['zip-extract'],
  txt: ['text-encoding', 'text-detect', 'text-diff', 'text-encrypt', 'text-hash', 'md-html'],
  csv: ['csv-json-excel', 'excel-to-csv', 'text-diff'],
  json: ['csv-json-excel', 'json-format', 'text-diff'],
  xml: ['xml-json', 'text-diff'],
  yaml: ['yaml-json', 'text-diff'],
  yml: ['yaml-json', 'text-diff'],
  md: ['md-html', 'text-diff'],
  html: ['md-html', 'text-diff'],
  epub: ['epub-reader', 'epub-to-pdf', 'epub-to-txt'],
  mobi: ['epub-to-txt'],
  mp3: ['media-convert', 'audio-edit'],
  wav: ['media-convert', 'audio-edit'],
  flac: ['media-convert', 'audio-edit'],
  ogg: ['media-convert', 'audio-edit'],
  mp4: ['media-convert', 'video-compress', 'video-trim', 'video-to-gif', 'video-extract-audio'],
  mov: ['media-convert', 'video-compress', 'video-trim', 'video-to-gif', 'video-extract-audio'],
  webm: ['media-convert', 'video-compress', 'video-trim', 'video-to-gif', 'video-extract-audio'],
  avi: ['media-convert', 'video-compress', 'video-trim', 'video-to-gif', 'video-extract-audio'],
  ttf: ['font-convert', 'font-preview', 'font-subset'],
  otf: ['font-convert', 'font-preview', 'font-subset'],
  woff: ['font-convert', 'font-preview', 'font-subset'],
  woff2: ['font-convert', 'font-preview', 'font-subset']
}

// 通用工具: 适用于所有文件
const UNIVERSAL_TOOLS = ['file-hash', 'file-type', 'file-compress', 'file-rename', 'file-search', 'file-timestamp', 'zip-create', 'privacy-scanner', 'large-file-chunk', 'batch-center', 'convert-wizard']

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  file.value = f
  detected.value = null
  recommendations.value = []
  await analyze()
}

async function analyze() {
  if (!file.value) return
  processing.value = true
  error.value = ''
  detected.value = null
  recommendations.value = []

  await safeRun(async () => {
    const headSize = Math.min(4100, file.value.size)
    const head = new Uint8Array(await file.value.slice(0, headSize).arrayBuffer())
    let ft = null
    try { ft = await fileTypeFromBuffer(head) } catch (e) {}

    const declaredExt = getExt(file.value.name)
    const realExt = ft?.ext || declaredExt || '(未识别)'
    const realMime = ft?.mime || file.value.type || '(未识别)'

    detected.value = {
      declaredExt,
      realExt,
      realMime,
      size: file.value.size,
      headHex: Array.from(head.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      mismatch: ft && declaredExt && ft.ext !== declaredExt
    }

    // 推荐工具
    const specific = RECOMMEND_MAP[realExt] || RECOMMEND_MAP[declaredExt] || []
    const recommendedTools = []
    const seen = new Set()

    for (const id of [...specific, ...UNIVERSAL_TOOLS]) {
      if (seen.has(id)) continue
      seen.add(id)
      const tool = allTools.find(t => t.id === id)
      if (tool) {
        recommendedTools.push({
          ...tool,
          isUniversal: UNIVERSAL_TOOLS.includes(id) && !specific.includes(id)
        })
      }
    }

    recommendations.value = recommendedTools
  }, '分析失败')
  processing.value = false
}

function removeFile() {
  file.value = null
  detected.value = null
  recommendations.value = []
}
</script>

<template>
  <ToolLayout title="文件转换向导" desc="上传任意文件，自动识别类型并推荐最合适的处理工具" icon="★">
    <FileDrop accept="*" :multiple="false"
              hint="不知道该用哪个工具? 上传文件让向导为你推荐"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <button class="nb-btn sm" @click="analyze">重新分析</button>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
      </div>

      <div v-if="processing" class="processing-box mt-16">
        <span class="nb-spinner"></span><span>分析中...</span>
      </div>

      <div v-if="detected" class="mt-16">
        <div class="nb-h3">文件类型识别</div>
        <div class="detect-grid mt-16">
          <div class="detect-item">
            <span class="detect-label">声明扩展名</span>
            <span class="nb-tag">{{ detected.declaredExt || '(无)' }}</span>
          </div>
          <div class="detect-item">
            <span class="detect-label">真实扩展名</span>
            <span class="nb-tag neon">{{ detected.realExt }}</span>
          </div>
          <div class="detect-item">
            <span class="detect-label">MIME 类型</span>
            <code>{{ detected.realMime }}</code>
          </div>
          <div class="detect-item">
            <span class="detect-label">头部字节</span>
            <code class="hex">{{ detected.headHex }}</code>
          </div>
        </div>
        <div v-if="detected.mismatch" class="nb-alert warning mt-16">
          ⚠ 扩展名 .{{ detected.declaredExt }} 与真实类型 .{{ detected.realExt }} 不一致
        </div>
      </div>
    </div>

    <div v-if="recommendations.length" class="mt-16">
      <div class="nb-card">
        <div class="nb-h3">推荐工具 ({{ recommendations.length }})</div>
        <p class="recommend-desc mt-16">根据文件类型 {{ detected.realExt.toUpperCase() }}，以下工具可用:</p>
      </div>

      <div class="nb-grid cols-3 mt-16">
        <a v-for="t in recommendations" :key="t.id"
           :href="`${t.path}`"
           class="nb-card tool-card"
           :class="{ universal: t.isUniversal }">
          <div class="tool-icon">{{ t.icon }}</div>
          <div class="tool-info">
            <div class="tool-title">{{ t.title }}</div>
            <div class="tool-desc">{{ t.desc }}</div>
            <div class="tool-cat">
              <span class="nb-tag" :class="t.isUniversal ? '' : 'neon'">{{ t.categoryName }}</span>
              <span v-if="t.isUniversal" class="nb-tag cyan">通用</span>
            </div>
          </div>
        </a>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!file" class="nb-alert info mt-16">
      <strong>使用流程:</strong>
      <ol>
        <li>上传任意类型文件</li>
        <li>工具自动识别真实文件类型 (魔数检测)</li>
        <li>列出所有适用的工具卡片</li>
        <li>点击卡片直接跳转到对应工具</li>
      </ol>
      <strong>支持识别:</strong> PDF / Office / 图片 / 音视频 / 字体 / 压缩包 / 文本 / 电子书 等 50+ 种格式。
    </div>
  </ToolLayout>
</template>

<style scoped>
.file-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.processing-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  font-family: var(--font-mono);
  color: var(--ink-soft);
}
.detect-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.detect-item {
  padding: 10px 12px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detect-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  text-transform: uppercase;
}
.detect-item code { background: var(--ink); color: var(--neon); padding: 2px 6px; font-size: 11px; }
.detect-item code.hex { font-size: 10px; word-break: break-all; }
.recommend-desc { font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); }
.tool-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  text-decoration: none;
  color: var(--ink);
  align-items: flex-start;
}
.tool-card:hover { background: var(--neon); }
.tool-card.universal { border-style: dashed; }
.tool-card.universal:hover { background: var(--paper-card); border-style: solid; }
.tool-icon {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 700;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ink);
  color: var(--neon);
  flex-shrink: 0;
}
.tool-info { flex: 1; min-width: 0; }
.tool-title {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 4px;
}
.tool-desc {
  font-size: 12px;
  color: var(--ink-soft);
  margin-bottom: 8px;
  line-height: 1.4;
}
.tool-cat { display: flex; gap: 4px; flex-wrap: wrap; }
ol { margin: 6px 0 12px 20px; }
</style>

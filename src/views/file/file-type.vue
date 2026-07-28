<script setup>
/**
 * 文件类型识别 - 用 file-type (魔数检测)
 * 显示真实MIME、扩展名、可能的兼容性
 * 检测文件是否被错误扩展名标记
 */
import { ref } from 'vue'
import { fileTypeFromBuffer, fileTypeFromBlob } from 'file-type'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { getExt } from '../../utils/download.js'

const files = ref([])  // [{ file, name, declaredExt, declaredMime, detected, mismatch, error }]
const processing = ref(false)
const error = ref('')

const EXT_TO_MIME = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  tiff: 'image/tiff', svg: 'image/svg+xml', heic: 'image/heic', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  zip: 'application/zip', rar: 'application/x-rar', '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
  txt: 'text/plain', csv: 'text/csv', json: 'application/json', xml: 'application/xml', html: 'text/html', md: 'text/markdown',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  epub: 'application/epub+zip', mobi: 'application/x-mobipocket-ebook'
}

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
  }
  files.value = [...files.value, ...arr]
  await detectAll()
}

async function detectAll() {
  if (!files.value.length) return
  processing.value = true
  error.value = ''
  await safeRun(async () => {
    for (const item of files.value) {
      if (item.detected) continue
      await detectOne(item)
    }
  }, '检测失败')
  processing.value = false
}

async function detectOne(item) {
  try {
    // 读取前 4100 字节 (file-type 推荐的最小检测长度)
    const sliceSize = Math.min(4100, item.file.size)
    const buf = await item.file.slice(0, sliceSize).arrayBuffer()
    const u8 = new Uint8Array(buf)

    let detected = null
    try {
      detected = await fileTypeFromBuffer(u8)
    } catch (e) {
      // file-type v19 ESM 兼容性处理
      console.warn('file-type fromBuffer failed', e)
    }

    const declaredExt = getExt(item.file.name)
    const declaredMime = item.file.type || EXT_TO_MIME[declaredExt] || '未知'
    const detectedExt = detected?.ext || '(未识别)'
    const detectedMime = detected?.mime || '(未识别)'

    // 也通过文本特征判断纯文本
    let textInfo = null
    if (!detected) {
      try {
        const sample = new TextDecoder('utf-8', { fatal: false }).decode(u8.slice(0, 256))
        if (/^[\x09\x0A\x0D\x20-\x7E]+$/.test(sample.replace(/\s/g, '')) && sample.length > 0) {
          textInfo = 'UTF-8 文本'
          if (/^<\?xml/.test(sample)) textInfo = 'XML 文档'
          else if (/^<!DOCTYPE html|<html/i.test(sample)) textInfo = 'HTML 文档'
          else if (/^\{/.test(sample)) textInfo = 'JSON 数据'
        }
      } catch (e) {}
    }

    // 判断是否扩展名错误
    let mismatch = false
    let mismatchNote = ''
    if (detected && declaredExt && detectedExt !== declaredExt) {
      mismatch = true
      mismatchNote = `文件扩展名 .${declaredExt} 与真实类型 .${detectedExt} 不一致`
    }

    Object.assign(item, {
      declaredExt,
      declaredMime,
      detectedExt,
      detectedMime,
      detected: true,
      textInfo,
      mismatch,
      mismatchNote,
      size: item.file.size
    })
  } catch (e) {
    item.error = e?.message || '检测失败'
    item.detected = true
  }
}

function clearAll() {
  files.value = []
}

function copy(text) {
  navigator.clipboard?.writeText(text).then(() => showError('已复制'))
}
</script>

<template>
  <ToolLayout title="文件类型识别" desc="通过文件头魔数识别真实类型，检测扩展名是否被错误标记" icon="?">
    <FileDrop accept="*" :multiple="true" hint="支持任意文件，通过魔数识别真实类型"
              @select="onFileSelect" @error="showError" />

    <div v-if="processing" class="mt-16 nb-alert">
      <span class="nb-spinner"></span> 检测中...
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="files.length" class="mt-16">
      <div class="nb-card result-head-card">
        <span class="nb-h3">检测结果 ({{ files.length }} 个文件)</span>
        <button class="nb-btn sm danger" @click="clearAll">清空</button>
      </div>

      <div v-for="(f, idx) in files" :key="idx" class="nb-card mt-16 file-card" :class="{ mismatch: f.mismatch }">
        <div class="file-card-head">
          <strong>{{ f.file.name }}</strong>
          <span class="nb-tag cyan">{{ formatBytes(f.file.size) }}</span>
          <span v-if="f.mismatch" class="nb-tag accent">⚠ 扩展名不匹配</span>
        </div>

        <div v-if="f.error" class="nb-alert danger mt-16">{{ f.error }}</div>

        <div v-else-if="f.detected" class="info-grid mt-16">
          <div class="info-row">
            <span class="info-label">声明扩展名</span>
            <span class="info-value">
              <span class="nb-tag">{{ f.declaredExt || '(无)' }}</span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">声明 MIME</span>
            <span class="info-value"><code>{{ f.declaredMime }}</code></span>
          </div>
          <div class="info-row">
            <span class="info-label">真实扩展名</span>
            <span class="info-value">
              <span class="nb-tag neon">{{ f.detectedExt }}</span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">真实 MIME</span>
            <span class="info-value"><code>{{ f.detectedMime }}</code></span>
          </div>
          <div v-if="f.textInfo" class="info-row">
            <span class="info-label">文本特征</span>
            <span class="info-value">{{ f.textInfo }}</span>
          </div>
        </div>

        <div v-if="f.mismatch" class="nb-alert warning mt-16">
          ⚠ {{ f.mismatchNote }}。建议将扩展名改为 .{{ f.detectedExt }} 以避免软件误判。
          <button class="nb-btn sm mt-16" @click="copy(f.detectedExt)">复制真实扩展名</button>
        </div>

        <div v-if="!f.mismatch && f.detectedExt !== '(未识别)'" class="nb-alert success mt-16">
          ✓ 文件扩展名与实际内容一致
        </div>

        <div v-if="f.detectedExt === '(未识别)' && !f.textInfo" class="nb-alert warning mt-16">
          ? 未能识别文件类型，可能是冷门格式或自定义二进制文件
        </div>
      </div>
    </div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>原理：</strong> 通过读取文件头部"魔数"判断真实类型，不依赖扩展名。可有效检测伪装文件（如 .exe 改名为 .jpg）。
    </div>
  </ToolLayout>
</template>

<style scoped>
.result-head-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
}
.file-card { padding: 14px; }
.file-card.mismatch {
  border-color: var(--accent);
  box-shadow: 5px 5px 0 var(--accent);
}
.file-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.info-grid { display: flex; flex-direction: column; gap: 8px; }
.info-row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 13px;
}
.info-label { color: var(--ink-soft); }
.info-value code { background: var(--ink); color: var(--neon); padding: 2px 8px; }
</style>

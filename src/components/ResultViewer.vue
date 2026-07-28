<script setup>
/**
 * 通用结果展示组件
 * - 单文件下载链接
 * - 多文件下载列表
 * - 图片预览
 * - 文本预览
 */
import { formatBytes } from '../utils/format'

const props = defineProps({
  // 文件列表 [{ name, blob, url, size, type }]
  files: { type: Array, default: () => [] },
  // 文本结果
  text: { type: String, default: '' },
  // 图片预览URL
  imageUrls: { type: Array, default: () => [] },
  // 自定义内容(slot)
  custom: { type: Boolean, default: false }
})

function icon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  const map = { pdf: '📕', docx: '📘', xlsx: '📗', pptx: '📙',
    jpg: '🖼', png: '🖼', gif: '▢', webp: '🖼', heic: '🖼', bmp: '🖼', tiff: '🖼',
    zip: '🗜', txt: '📝', csv: '▸', json: '{}', xml: '≷', md: 'M',
    html: 'H', yaml: 'Y', epub: '📚', mp4: '🎬', mp3: '♪', svg: '◇', ttf: '🔤' }
  return map[ext] || '📄'
}
</script>

<template>
  <div class="result-area" v-if="files.length || text || imageUrls.length || custom">
    <div class="result-title">
      <span class="result-mark">✓</span> 处理完成
    </div>

    <!-- 自定义内容 -->
    <slot v-if="custom" />

    <!-- 图片预览 -->
    <div v-if="imageUrls.length" class="image-previews">
      <div v-for="(url, i) in imageUrls" :key="i" class="image-preview">
        <img :src="url" :alt="`预览${i+1}`" />
        <a v-if="files[i]" :href="files[i].url" :download="files[i].name" class="nb-btn sm">
          下载 {{ files[i].name }}
        </a>
      </div>
    </div>

    <!-- 文件下载列表 -->
    <div v-if="files.length && !imageUrls.length" class="download-list">
      <a v-for="(f, i) in files" :key="i" :href="f.url" :download="f.name" class="download-item">
        <span class="download-icon">{{ icon(f.name) }}</span>
        <span class="download-name">{{ f.name }}</span>
        <span v-if="f.size" class="download-size">{{ formatBytes(f.size) }}</span>
        <span class="download-btn">下载</span>
      </a>
    </div>

    <!-- 单文件下载按钮(大) -->
    <div v-if="files.length === 1 && !imageUrls.length" class="single-download">
      <a :href="files[0].url" :download="files[0].name" class="nb-btn primary lg block">
        ⬇ 下载 {{ files[0].name }} <span v-if="files[0].size">({{ formatBytes(files[0].size) }})</span>
      </a>
    </div>

    <!-- 文本预览 -->
    <div v-if="text" class="text-preview">
      <pre>{{ text.length > 5000 ? text.slice(0, 5000) + '\n\n... (仅显示前5000字符，完整内容已下载)' : text }}</pre>
    </div>
  </div>
</template>

<style scoped>
.result-mark {
  display: inline-flex;
  width: 24px;
  height: 24px;
  background: var(--neon);
  border: 2px solid var(--ink);
  align-items: center;
  justify-content: center;
  font-weight: 900;
  margin-right: 8px;
}
.image-previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.image-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.image-preview img {
  width: 100%;
  border: 3px solid var(--ink);
  background: var(--paper-bg);
}
.download-list { display: flex; flex-direction: column; gap: 8px; }
.download-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--paper-card);
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  text-decoration: none;
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  transition: all 0.1s ease;
}
.download-item:hover {
  background: var(--neon);
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--ink);
}
.download-icon { font-size: 18px; }
.download-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.download-size { color: var(--ink-soft); font-size: 11px; }
.download-btn {
  padding: 4px 10px;
  background: var(--accent);
  color: var(--paper-card);
  font-weight: 700;
  font-size: 12px;
  border: 2px solid var(--ink);
}
.single-download { margin-top: 12px; }
.text-preview {
  background: var(--ink);
  color: var(--neon);
  padding: 16px;
  border: 3px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  max-height: 400px;
  overflow: auto;
}
.text-preview pre { white-space: pre-wrap; word-break: break-word; }
</style>

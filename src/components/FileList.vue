<script setup>
/**
 * 通用文件列表 - 显示已添加的文件，支持删除
 */
import { formatBytes } from '../utils/format'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  files: { type: Array, default: () => [] },
  showSize: { type: Boolean, default: true }
})
const emit = defineEmits(['remove'])

const { t } = useI18n()

function icon(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  const map = { pdf: '📕', docx: '📘', doc: '📘', xlsx: '📗', xls: '📗', pptx: '📙', ppt: '📙',
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '▢', webp: '🖼', heic: '🖼', bmp: '🖼', tiff: '🖼',
    zip: '🗜', rar: '🗜', '7z': '🗜', txt: '📝', csv: '▸', json: '{}', xml: '≷', md: 'M',
    html: 'H', yaml: 'Y', yml: 'Y', epub: '📚', mp4: '🎬', mov: '🎬', avi: '🎬',
    mp3: '♪', wav: '♪', flac: '♪', svg: '◇', ttf: '🔤', otf: '🔤', woff: '🔤', woff2: '🔤' }
  return map[ext] || '📄'
}
</script>

<template>
  <div class="file-list">
    <div v-for="(f, idx) in files" :key="idx" class="file-item">
      <span class="file-icon">{{ icon(f) }}</span>
      <span class="file-name" :title="f.name">{{ f.name }}</span>
      <span v-if="showSize" class="file-size">{{ formatBytes(f.size) }}</span>
      <button class="file-remove" @click="emit('remove', idx)" :title="t('common.remove')" :aria-label="t('common.remove')">×</button>
    </div>
  </div>
</template>

<style scoped>
.file-list { display: flex; flex-direction: column; gap: 8px; }
</style>

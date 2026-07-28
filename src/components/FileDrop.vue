<script setup>
/**
 * 文件拖拽上传组件
 * - 支持点击选择与拖拽
 * - 支持多文件
 * - 类型校验
 * - 大小校验
 * - 友好的错误提示
 */
import { ref } from 'vue'

const props = defineProps({
  accept: { type: String, default: '*' },           // 接受的文件类型 '.pdf,application/pdf'
  multiple: { type: Boolean, default: true },         // 是否允许多文件
  maxSize: { type: Number, default: 0 },              // 单文件最大字节(0=不限)
  hint: { type: String, default: '' },                // 提示文字
  icon: { type: String, default: '⬆' }
})

const emit = defineEmits(['select', 'error'])

const inputRef = ref()
const isDragover = ref(false)

function pickFile() { inputRef.value?.click() }

function onDrop(e) {
  isDragover.value = false
  const files = Array.from(e.dataTransfer.files || [])
  handleFiles(files)
}

function onPick(e) {
  const files = Array.from(e.target.files || [])
  handleFiles(files)
  e.target.value = ''
}

function handleFiles(files) {
  if (!files.length) return
  if (!props.multiple && files.length > 1) {
    emit('error', '只能选择一个文件')
    return
  }

  const valid = []
  for (const f of files) {
    // 类型校验
    if (props.accept && props.accept !== '*') {
      const exts = props.accept.split(',').map(s => s.trim().toLowerCase())
      const fileName = f.name.toLowerCase()
      const mime = (f.type || '').toLowerCase()
      const ok = exts.some(ext => {
        if (ext.startsWith('.')) return fileName.endsWith(ext)
        if (ext.endsWith('/*')) {
          const prefix = ext.slice(0, -1)
          return mime.startsWith(prefix)
        }
        return mime === ext
      })
      if (!ok) {
        emit('error', `文件 "${f.name}" 的类型不被支持`)
        continue
      }
    }
    // 大小校验
    if (props.maxSize > 0 && f.size > props.maxSize) {
      const mb = (props.maxSize / 1024 / 1024).toFixed(0)
      emit('error', `文件 "${f.name}" 超过最大限制 ${mb}MB`)
      continue
    }
    valid.push(f)
  }

  if (valid.length) emit('select', props.multiple ? valid : valid[0])
}

function onDragover() { isDragover.value = true }
function onDragleave() { isDragover.value = false }
</script>

<template>
  <div class="drop-zone" :class="{ dragover: isDragover }"
       @click="pickFile"
       @dragover.prevent="onDragover"
       @dragleave.prevent="onDragleave"
       @drop.prevent="onDrop">
    <input ref="inputRef" type="file"
           :accept="accept === '*' ? '' : accept"
           :multiple="multiple"
           style="display:none"
           @change="onPick" />
    <div class="drop-zone-icon">{{ icon }}</div>
    <div class="drop-zone-title">
      <strong>点击选择</strong> 或 <strong>拖拽文件到此处</strong>
    </div>
    <div v-if="hint" class="drop-zone-hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.drop-zone-title {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink);
}
.drop-zone-title strong {
  color: var(--accent);
  font-weight: 700;
}
</style>

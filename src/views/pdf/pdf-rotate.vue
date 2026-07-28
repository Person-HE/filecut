<script setup>
/**
 * PDF旋转 - 旋转全部页面或指定页, 0/90/180/270度
 * 用 pdf-lib
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib } from '../../utils/pdflib.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const angle = ref(90)
const scope = ref('all')  // all | range
const rangeInput = ref('')
const pageCount = ref(0)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''; pageCount.value = 0
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      const doc = await loadPdfLib(buf)
      pageCount.value = doc.getPageCount()
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

function parsePageList(input, max) {
  if (!input || !input.trim()) return null
  const set = new Set()
  for (const part of input.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const a = +m[1], b = +m[2]
      if (a < 1 || b > max || a > b) throw new Error(`无效范围: ${part}`)
      for (let i = a; i <= b; i++) set.add(i - 1)
    } else if (/^\d+$/.test(part)) {
      const n = +part
      if (n < 1 || n > max) throw new Error(`无效页码: ${part}`)
      set.add(n - 1)
    } else throw new Error(`无法解析: ${part}`)
  }
  return [...set].sort((a, b) => a - b)
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const total = doc.getPageCount()
    const pages = doc.getPages()
    let targetIndices = null
    if (scope.value === 'range') {
      targetIndices = parsePageList(rangeInput.value, total)
      if (!targetIndices || !targetIndices.length) throw new Error('请输入有效的页码范围')
    }
    progressText.value = `旋转中...`
    pages.forEach((page, idx) => {
      if (targetIndices && !targetIndices.includes(idx)) return
      const currentRotation = page.getRotation().angle
      page.setRotation({ angle: (currentRotation + angle.value) % 360 })
    })
    progress.value = 70
    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_rotated${angle.value}.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF旋转失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF旋转" desc="旋转PDF页面方向" icon="↻">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div v-if="pageCount" class="nb-alert success mt-16">共 {{ pageCount }} 页</div>

    <div class="nb-grid cols-2 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">旋转角度</label>
        <select class="nb-select" v-model="angle">
          <option :value="90">顺时针 90°</option>
          <option :value="180">180°</option>
          <option :value="270">逆时针 90° (即 -90°)</option>
        </select>
      </div>
      <div>
        <label class="nb-label">应用范围</label>
        <select class="nb-select" v-model="scope">
          <option value="all">所有页面</option>
          <option value="range">指定页码</option>
        </select>
      </div>
    </div>

    <div v-if="scope === 'range'" class="mt-16">
      <label class="nb-label">页码(如: 1-3,5,7-10)</label>
      <input class="nb-input" v-model="rangeInput" placeholder="1-3,5,7-10" />
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 旋转中...</span>
        <span v-else>开始旋转</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>
    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" />
  </ToolLayout>
</template>

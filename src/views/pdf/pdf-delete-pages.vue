<script setup>
/**
 * PDF删除页面 - 输入要删除或要保留的页码
 * 用 pdf-lib removePage
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
const mode = ref('delete')  // delete | keep
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

function parsePageSet(input, max) {
  if (!input || !input.trim()) throw new Error('请输入页码')
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
  return set
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const total = doc.getPageCount()
    const inputSet = parsePageSet(rangeInput.value, total)
    let keepIndices
    if (mode.value === 'delete') {
      keepIndices = []
      for (let i = 0; i < total; i++) if (!inputSet.has(i)) keepIndices.push(i)
      if (!keepIndices.length) throw new Error('不能删除所有页面')
    } else {
      keepIndices = [...inputSet].sort((a, b) => a - b)
      if (!keepIndices.length) throw new Error('请输入要保留的页码')
    }
    progressText.value = `保留 ${keepIndices.length}/${total} 页`
    // 从后向前删除
    for (let i = total - 1; i >= 0; i--) {
      if (!keepIndices.includes(i)) doc.removePage(i)
    }
    progress.value = 70
    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_edited.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF删除页面失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF删除页面" desc="删除指定页面或提取保留页" icon="×">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div v-if="pageCount" class="nb-alert success mt-16">共 {{ pageCount }} 页</div>

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">操作模式</label>
      <select class="nb-select" v-model="mode" style="max-width:320px">
        <option value="delete">删除指定页</option>
        <option value="keep">仅保留指定页(提取)</option>
      </select>
    </div>

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">{{ mode === 'delete' ? '要删除的页码' : '要保留的页码' }} (如: 1-3,5,7-10)</label>
      <input class="nb-input" v-model="rangeInput" :placeholder="`如: 1-3,5,7-10 (共${pageCount}页)`" />
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>开始处理</span>
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

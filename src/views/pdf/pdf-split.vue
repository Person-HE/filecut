<script setup>
/**
 * PDF拆分 - 输入页码范围(1-3,5,7-10)，按页拆分多文件
 * 或每N页拆分
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib } from '../../utils/pdflib.js'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const mode = ref('ranges')  // ranges | everyN | each
const rangeInput = ref('1-3,4-6')
const everyN = ref(1)
const zipOutput = ref(true)
const pageCount = ref(0)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  pageCount.value = 0
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      const doc = await loadPdfLib(buf)
      pageCount.value = doc.getPageCount()
      // 默认填充: 每页一份
      rangeInput.value = `1-${pageCount.value}`
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

/** 解析页码范围字符串 "1-3,5,7-10" → [[1,3],[5,5],[7,10]] */
function parseRanges(input, max) {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)
  const ranges = []
  for (const p of parts) {
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const a = parseInt(m[1]), b = parseInt(m[2])
      if (a > b || a < 1 || b > max) throw new Error(`无效范围: ${p} (总页数:${max})`)
      ranges.push([a, b])
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p)
      if (n < 1 || n > max) throw new Error(`无效页码: ${p} (总页数:${max})`)
      ranges.push([n, n])
    } else {
      throw new Error(`无法解析: ${p}`)
    }
  }
  return ranges
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const srcDoc = await loadPdfLib(file)
    const total = srcDoc.getPageCount()

    let groups = []  // [[startIdx, endIdx]] (0-based, end inclusive)
    if (mode.value === 'ranges') {
      const ranges = parseRanges(rangeInput.value, total)
      groups = ranges.map(([a, b]) => [a - 1, b - 1])
    } else if (mode.value === 'everyN') {
      const n = Math.max(1, everyN.value | 0)
      for (let i = 0; i < total; i += n) {
        groups.push([i, Math.min(i + n - 1, total - 1)])
      }
    } else {  // each
      for (let i = 0; i < total; i++) groups.push([i, i])
    }
    if (!groups.length) throw new Error('未生成任何拆分片段')

    const outputs = []
    for (let gi = 0; gi < groups.length; gi++) {
      const [s, e] = groups[gi]
      const outDoc = await PDFDocument.create()
      const indices = []
      for (let i = s; i <= e; i++) indices.push(i)
      const pages = await outDoc.copyPages(srcDoc, indices)
      pages.forEach(p => outDoc.addPage(p))
      const bytes = await outDoc.save()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const name = `${getBaseName(file.name)}_p${s + 1}${e > s ? `-${e + 1}` : ''}.pdf`
      outputs.push({ name, blob, url: URL.createObjectURL(blob), size: blob.size })
      progress.value = Math.round(((gi + 1) / groups.length) * 90)
      progressText.value = `生成 ${gi + 1}/${groups.length}`
    }

    if (zipOutput.value && outputs.length > 1) {
      progressText.value = '打包ZIP中...'
      const zip = new JSZip()
      for (const o of outputs) zip.file(o.name, o.blob)
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      result.value = [{
        name: `${getBaseName(file.name)}_split.zip`,
        blob: zipBlob, url: URL.createObjectURL(zipBlob), size: zipBlob.size
      }, ...outputs.slice(0, 3)]
    } else {
      result.value = outputs
    }
    progress.value = 100
    progressText.value = `完成，共 ${outputs.length} 个文件`
  }, 'PDF拆分失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF拆分" desc="按页码范围或每N页拆分为多个PDF" icon="÷">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div v-if="pageCount" class="nb-alert success mt-16">
      共 <strong>{{ pageCount }}</strong> 页
    </div>

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">拆分方式</label>
      <div class="nb-grid cols-3">
        <label><input type="radio" v-model="mode" value="ranges" /> 按页码范围</label>
        <label><input type="radio" v-model="mode" value="everyN" /> 每N页</label>
        <label><input type="radio" v-model="mode" value="each" /> 每页一份</label>
      </div>

      <div v-if="mode === 'ranges'" class="mt-16">
        <label class="nb-label">页码范围(用英文逗号分隔，支持区间)</label>
        <input class="nb-input" v-model="rangeInput" placeholder="如: 1-3,5,7-10" />
        <div class="nb-subtitle mt-8">格式: 1-3,5,7-10 表示输出3个文件: 1~3页、第5页、7~10页</div>
      </div>

      <div v-if="mode === 'everyN'" class="mt-16">
        <label class="nb-label">每N页拆分</label>
        <input class="nb-input" type="number" min="1" v-model="everyN" style="max-width:120px" />
      </div>

      <div class="mt-16">
        <label class="nb-label"><input type="checkbox" v-model="zipOutput" /> 多个文件打包为ZIP下载</label>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 拆分中...</span>
        <span v-else>开始拆分</span>
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

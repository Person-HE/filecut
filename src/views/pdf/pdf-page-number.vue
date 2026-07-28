<script setup>
/**
 * PDF加页码 - 选择位置(左下/中下/右下/左上/中上/右上)、起始页码、格式
 * 用 pdf-lib
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib, embedChineseFont } from '../../utils/pdflib.js'
import { StandardFonts } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const position = ref('bottom-center')
const startNum = ref(1)
const fmt = ref('number')  // number | pageOfN | pageChinese
const fontSize = ref(12)
const skipFirst = ref(0)
const margin = ref(30)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdfLib(buf)
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

function formatPageNum(current, total) {
  if (fmt.value === 'number') return String(current)
  if (fmt.value === 'pageOfN') return `${current} / ${total}`
  if (fmt.value === 'pageChinese') {
    const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    if (current <= 10) return `第${cn[current]}页`
    if (current < 20) return `第十${cn[current - 10]}页`
    return `第${current}页`
  }
  return String(current)
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const pages = doc.getPages()
    const total = pages.length
    let font
    try {
      font = await embedChineseFont(doc)
    } catch (e) {
      font = await doc.embedFont(StandardFonts.Helvetica)
    }

    for (let i = 0; i < total; i++) {
      if (i < skipFirst.value) continue
      const page = pages[i]
      const { width, height } = page.getSize()
      const currentNum = startNum.value + (i - skipFirst.value)
      const text = formatPageNum(currentNum, total)
      const textWidth = font.widthOfTextAtSize(text, fontSize.value)
      let x, y
      // x位置
      if (position.value.includes('left')) x = margin.value
      else if (position.value.includes('right')) x = width - textWidth - margin.value
      else x = (width - textWidth) / 2
      // y位置
      if (position.value.includes('top')) y = height - fontSize.value - margin.value
      else y = margin.value

      page.drawText(text, {
        x, y, size: fontSize.value, font
      })
      progress.value = Math.round(((i + 1) / total) * 90)
      progressText.value = `加页码 ${i + 1}/${total}`
    }

    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_page numbered.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF加页码失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF加页码" desc="为PDF添加页码,支持多种位置与格式" icon="#">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div class="nb-grid cols-2 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">位置</label>
        <select class="nb-select" v-model="position">
          <option value="bottom-left">左下</option>
          <option value="bottom-center">中下</option>
          <option value="bottom-right">右下</option>
          <option value="top-left">左上</option>
          <option value="top-center">中上</option>
          <option value="top-right">右上</option>
        </select>
      </div>
      <div>
        <label class="nb-label">页码格式</label>
        <select class="nb-select" v-model="fmt">
          <option value="number">1, 2, 3</option>
          <option value="pageOfN">1 / N</option>
          <option value="pageChinese">第一页, 第二页</option>
        </select>
      </div>
      <div>
        <label class="nb-label">起始页码</label>
        <input class="nb-input" type="number" v-model="startNum" min="0" />
      </div>
      <div>
        <label class="nb-label">前N页不加页码</label>
        <input class="nb-input" type="number" v-model="skipFirst" min="0" />
      </div>
      <div>
        <label class="nb-label">字号</label>
        <input class="nb-input" type="number" v-model="fontSize" min="6" max="36" />
      </div>
      <div>
        <label class="nb-label">边距(磅)</label>
        <input class="nb-input" type="number" v-model="margin" min="10" max="100" />
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 加页码中...</span>
        <span v-else>开始加页码</span>
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

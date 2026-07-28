<script setup>
/**
 * PDF转TXT - 用 pdf.js 提取全文文本
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'
import { loadPdf, extractAllText } from '../../utils/pdfjs.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)

async function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [selected]
  needPassword.value = false
  password.value = ''
  // 预检加密
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdf(buf)
    } catch (e) {
      if (/password/i.test(e.message || '')) needPassword.value = true
    }
  }
}

function removeFile(idx) { files.value.splice(idx, 1) }

async function process() {
  if (!files.value.length) { showError('请先选择PDF文件'); return }
  if (!files.value[0].size) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    progressText.value = `共 ${pdfDoc.numPages} 页，正在提取文本...`
    const text = await extractAllText(pdfDoc, (cur, total) => {
      progress.value = Math.round((cur / total) * 100)
      progressText.value = `提取中 ${cur}/${total} 页`
    })
    if (!text.trim()) {
      throw new Error('未提取到文本，可能是扫描件PDF，请使用「扫描件OCR」工具')
    }
    // 按页分割标记清理为更友好的分隔
    const cleanText = text.replace(/\n\n--- Page Break ---\n\n/g, '\n\n——— 第N页 ———\n\n')
    const blob = new Blob([cleanText], { type: 'text/plain;charset=utf-8' })
    if (!blob.size) throw new Error('生成文本为空')
    result.value = [{
      name: replaceExt(file.name, '.txt'),
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF转TXT失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转TXT" desc="提取PDF纯文本，支持中英文" icon="T">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="支持加密PDF，单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="输入PDF密码" style="max-width:320px" />
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 提取中...</span>
        <span v-else>开始提取文本</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :text="result[0] ? '' : ''" />
  </ToolLayout>
</template>

<script setup>
/**
 * Word转TXT - 用 mammoth.extractRawText 提取纯文本
 */
import { ref } from 'vue'
import mammoth from 'mammoth'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const textPreview = ref('')
const stats = ref(null)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  textPreview.value = ''
  stats.value = null
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  textPreview.value = ''
  stats.value = null
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const arrayBuffer = buf.slice(0)
    const res = await mammoth.extractRawText({ arrayBuffer })
    const text = res.value
    if (!text || !text.trim()) throw new Error('文档内容为空')

    textPreview.value = text

    // 统计信息
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length
    const lines = text.split(/\n/).filter(l => l.trim()).length
    stats.value = {
      总字符数: text.length,
      中文字符: chineseChars,
      英文单词: englishWords,
      段落数: paragraphs,
      行数: lines
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    if (blob.size === 0) throw new Error('生成的文本为空')

    const name = replaceExt(file.value.name, '.txt')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Word转TXT失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Word转TXT" desc="提取Word文档纯文本" icon="T">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 提取所有文本内容" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 提取中...</span>
        <span v-else>开始提取</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="stats" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">文本统计</h3>
      <div class="stats-grid">
        <div v-for="(v, k) in stats" :key="k" class="stat-item">
          <div class="stat-value">{{ v.toLocaleString() }}</div>
          <div class="stat-label">{{ k }}</div>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" :text="textPreview" />
  </ToolLayout>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
.stat-item {
  background: var(--neon);
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  padding: 16px;
  text-align: center;
}
.stat-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}
.stat-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
  text-transform: uppercase;
}
</style>

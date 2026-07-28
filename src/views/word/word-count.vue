<script setup>
/**
 * Word字数统计 - 统计:总字符数、中文字数、英文单词数、段落数、行数
 * 显示分布图
 */
import { ref, computed } from 'vue'
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
const textContent = ref('')
const stats = ref(null)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  textContent.value = ''
  stats.value = null
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  textContent.value = ''
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
    const res = await mammoth.extractRawText({ arrayBuffer: buf.slice(0) })
    const text = res.value || ''
    if (!text.trim()) throw new Error('文档内容为空')

    textContent.value = text

    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    const digits = (text.match(/\d+/g) || []).length
    const punctuation = (text.match(/[，。！？、；：""''（）【】《》,.!?;:'"()\[\]<>]/g) || []).length
    const whitespace = (text.match(/\s/g) || []).length
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length
    const lines = text.split(/\n/).filter(l => l.trim()).length
    const sentences = (text.match(/[。！？.!?]+/g) || []).length
    const readingTime = Math.ceil(chineseChars / 300 + englishWords / 200)

    stats.value = {
      total: text.length,
      chinese: chineseChars,
      english: englishWords,
      digits,
      punctuation,
      whitespace,
      paragraphs,
      lines,
      sentences,
      readingTime
    }

    // 输出统计报告
    const report = `字数统计报告
============================
文件: ${file.value.name}
统计时间: ${new Date().toLocaleString('zh-CN')}

【基本信息】
总字符数: ${text.length}
中文字符: ${chineseChars}
英文单词: ${englishWords}
数字串数: ${digits}
标点符号: ${punctuation}
空白字符: ${whitespace}

【结构信息】
段落数: ${paragraphs}
行数: ${lines}
句子数: ${sentences}

【阅读估算】
预估阅读时间: ${readingTime} 分钟
(按 中文 300字/分钟 + 英文 200词/分钟 估算)
`
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
    if (blob.size === 0) throw new Error('生成报告为空')

    const name = replaceExt(file.value.name, '-stats.txt')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '统计失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}

// 计算最大值用于条形图
const maxStat = computed(() => {
  if (!stats.value) return 1
  return Math.max(stats.value.total, stats.value.chinese, stats.value.english, stats.value.digits, stats.value.punctuation, 1)
})

const chartData = computed(() => {
  if (!stats.value) return []
  return [
    { label: '总字符', value: stats.value.total, color: 'var(--accent)' },
    { label: '中文', value: stats.value.chinese, color: 'var(--neon-deep)' },
    { label: '英文词', value: stats.value.english, color: 'var(--cyan)' },
    { label: '数字', value: stats.value.digits, color: 'var(--warning)' },
    { label: '标点', value: stats.value.punctuation, color: 'var(--accent-deep)' }
  ]
})
</script>

<template>
  <ToolLayout title="Word字数统计" desc="统计字数、字符、段落、行数等" icon="#">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 详细统计分析" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 统计中...</span>
        <span v-else>开始统计</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="stats" class="stats-grid mt-16">
      <div class="stat-card nb-card">
        <div class="stat-value accent">{{ stats.total.toLocaleString() }}</div>
        <div class="stat-label">总字符数</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.chinese.toLocaleString() }}</div>
        <div class="stat-label">中文字符</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.english.toLocaleString() }}</div>
        <div class="stat-label">英文单词</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.paragraphs.toLocaleString() }}</div>
        <div class="stat-label">段落数</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.lines.toLocaleString() }}</div>
        <div class="stat-label">行数</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.sentences.toLocaleString() }}</div>
        <div class="stat-label">句子数</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.punctuation.toLocaleString() }}</div>
        <div class="stat-label">标点符号</div>
      </div>
      <div class="stat-card nb-card">
        <div class="stat-value">{{ stats.readingTime }} 分钟</div>
        <div class="stat-label">预估阅读时间</div>
      </div>
    </div>

    <div v-if="stats" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">字符分布图</h3>
      <div class="chart-list">
        <div v-for="item in chartData" :key="item.label" class="chart-bar">
          <div class="chart-label">{{ item.label }}</div>
          <div class="chart-track">
            <div class="chart-fill" :style="{ width: (item.value / maxStat * 100) + '%', background: item.color }"></div>
          </div>
          <div class="chart-value">{{ item.value.toLocaleString() }}</div>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.stat-card {
  text-align: center;
  padding: 20px 12px;
}
.stat-value {
  font-family: var(--font-display);
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  color: var(--ink);
}
.stat-value.accent { color: var(--accent); }
.stat-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 8px;
  color: var(--ink-soft);
  text-transform: uppercase;
}
.chart-list { display: flex; flex-direction: column; gap: 12px; }
.chart-bar {
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  align-items: center;
  gap: 12px;
}
.chart-label {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
}
.chart-track {
  height: 28px;
  background: var(--paper-darker);
  border: 2px solid var(--ink);
  position: relative;
}
.chart-fill {
  height: 100%;
  border-right: 2px solid var(--ink);
  transition: width 0.4s ease;
}
.chart-value {
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: right;
}
</style>

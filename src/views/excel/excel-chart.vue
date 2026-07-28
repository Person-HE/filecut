<script setup>
/**
 * Excel图表生成 - SheetJS 读取数据
 * 用 Chart.js 生成柱状/折线/饼图
 * 可下载图表图片
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import * as XLSX from 'xlsx'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt, getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const headers = ref([])
const allRows = ref([])
const sheetNames = ref([])
const currentSheet = ref('')
const dataCols = ref([])  // 数值列
const labelCol = ref('')
const selectedCols = ref([])
const chartType = ref('bar') // bar | line | pie | doughnut | radar | polarArea
const chartTitle = ref('')

const canvasRef = ref(null)
const chartInstance = ref(null)
const chartReady = ref(false)

// 动态加载 Chart.js
async function loadChartJS() {
  if (window.Chart) return window.Chart
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
    script.onload = () => {
      if (window.Chart) resolve(window.Chart)
      else reject(new Error('Chart.js 加载失败'))
    }
    script.onerror = () => reject(new Error('Chart.js 加载失败，请检查网络'))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  try {
    await loadChartJS()
    chartReady.value = true
  } catch (e) {
    error.value = '图表库加载失败: ' + e.message
  }
})

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  headers.value = []
  allRows.value = []
  dataCols.value = []
  selectedCols.value = []
  error.value = ''
  loadExcel()
}

function removeFile() {
  file.value = null
  result.value = []
  headers.value = []
  allRows.value = []
  if (chartInstance.value) {
    chartInstance.value.destroy()
    chartInstance.value = null
  }
}

async function loadExcel() {
  if (!file.value) return
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const wb = XLSX.read(buf, { type: 'array' })
    if (!wb.SheetNames.length) throw new Error('工作簿中没有工作表')

    sheetNames.value = wb.SheetNames
    currentSheet.value = wb.SheetNames[0]
    loadSheet()
  }, 'Excel加载失败')
  processing.value = false
}

function loadSheet() {
  if (!file.value) return
  readFileAsArrayBuffer(file.value).then(async (buf) => {
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[currentSheet.value]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (data.length < 2) {
      showError('数据少于2行，无法生成图表')
      headers.value = []
      allRows.value = []
      return
    }
    headers.value = data[0].map((h, i) => h || `列${i + 1}`)
    allRows.value = data.slice(1)
    // 检测哪些列是数值列
    dataCols.value = []
    headers.value.forEach((h, ci) => {
      const sample = allRows.value.slice(0, 10).map(r => r[ci]).filter(v => v !== '' && v !== null && v !== undefined)
      if (sample.length && sample.every(v => !isNaN(parseFloat(v)) && isFinite(v))) {
        dataCols.value.push(h)
      }
    })
    if (dataCols.value.length === 0) {
      showError('未发现数值列')
      return
    }
    if (dataCols.value.length) selectedCols.value = [dataCols.value[0]]
    labelCol.value = headers.value[0]
    await nextTick()
    drawChart()
  })
}

watch(currentSheet, loadSheet)
watch([chartType, labelCol, selectedCols], async () => {
  await nextTick()
  drawChart()
}, { deep: true })

const previewRows = computed(() => allRows.value.slice(0, 10))

async function drawChart() {
  if (!chartReady.value || !canvasRef.value) return
  if (!selectedCols.value.length || !labelCol.value) return
  const Chart = window.Chart

  if (chartInstance.value) {
    chartInstance.value.destroy()
    chartInstance.value = null
  }

  const labelIdx = headers.value.indexOf(labelCol.value)
  if (labelIdx < 0) return

  const labels = allRows.value.map(r => String(r[labelIdx] ?? ''))
  const datasets = selectedCols.value.map((col, idx) => {
    const ci = headers.value.indexOf(col)
    const data = allRows.value.map(r => parseFloat(r[ci]) || 0)
    const colors = ['#ff5a1f', '#c4ff00', '#00b3a4', '#ffb800', '#d40000', '#87b300', '#1a1a1a']
    const bgColor = chartType.value === 'pie' || chartType.value === 'doughnut' || chartType.value === 'polarArea'
      ? labels.map((_, i) => colors[i % colors.length])
      : colors[idx % colors.length]
    return {
      label: col,
      data,
      backgroundColor: bgColor,
      borderColor: colors[idx % colors.length],
      borderWidth: 2
    }
  })

  const ctx = canvasRef.value.getContext('2d')
  chartInstance.value = new Chart(ctx, {
    type: chartType.value,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!chartTitle.value,
          text: chartTitle.value,
          font: { size: 18, family: "'IBM Plex Mono', monospace", weight: 700 }
        },
        legend: {
          labels: { font: { family: "'IBM Plex Mono', monospace", size: 12 } }
        }
      },
      scales: chartType.value === 'pie' || chartType.value === 'doughnut' || chartType.value === 'polarArea' ? {} : {
        y: { beginAtZero: true },
        x: { ticks: { font: { family: "'IBM Plex Mono', monospace" } } }
      }
    }
  })
}

function toggleCol(col) {
  const idx = selectedCols.value.indexOf(col)
  if (idx >= 0) selectedCols.value.splice(idx, 1)
  else selectedCols.value.push(col)
}

function downloadChart() {
  if (!chartInstance.value) { showError('请先生成图表'); return }
  const url = chartInstance.value.toBase64Image('image/png', 1)
  const link = document.createElement('a')
  link.href = url
  link.download = `${getBaseName(file.value.name)}-chart-${chartType.value}.png`
  link.click()
}
</script>

<template>
  <ToolLayout title="Excel图表生成" desc="Excel数据生成图表，可下载" icon="📊">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式 · 自动识别数值列" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="sheetNames.length" class="mt-16 nb-card">
      <label class="nb-label">工作表</label>
      <select v-model="currentSheet" class="nb-select">
        <option v-for="n in sheetNames" :key="n" :value="n">{{ n }}</option>
      </select>
    </div>

    <div v-if="headers.length" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">图表配置</h3>
      <div class="options-grid">
        <div>
          <label class="nb-label">图表类型</label>
          <select v-model="chartType" class="nb-select">
            <option value="bar">📊 柱状图</option>
            <option value="line">📈 折线图</option>
            <option value="pie">🥧 饼图</option>
            <option value="doughnut">🍩 环形图</option>
            <option value="radar">📡 雷达图</option>
            <option value="polarArea">🎯 极区图</option>
          </select>
        </div>
        <div>
          <label class="nb-label">标签列 (X轴)</label>
          <select v-model="labelCol" class="nb-select">
            <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
        <div>
          <label class="nb-label">图表标题</label>
          <input v-model="chartTitle" class="nb-input" placeholder="可选" />
        </div>
      </div>

      <div class="mt-16">
        <label class="nb-label">数值列 (可多选)</label>
        <div class="col-options">
          <button v-for="col in dataCols" :key="col"
                  class="nb-btn sm col-toggle"
                  :class="{ active: selectedCols.includes(col) }"
                  @click="toggleCol(col)">
            {{ col }}
          </button>
          <span v-if="!dataCols.length" class="hint">未检测到数值列</span>
        </div>
      </div>

      <div class="mt-16">
        <button class="nb-btn primary" @click="drawChart" :disabled="!chartReady || !selectedCols.length">🔄 重新生成</button>
        <button class="nb-btn" @click="downloadChart" :disabled="!chartInstance">⬇ 下载图片</button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!chartReady && !error" class="nb-alert info mt-16">
      <span class="nb-spinner"></span> 正在加载图表库...
    </div>

    <div v-if="chartInstance" class="nb-card mt-16 chart-card">
      <canvas ref="canvasRef" class="chart-canvas"></canvas>
    </div>

    <div v-if="headers.length" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">数据预览 (前10行)</h3>
      <div class="table-scroll">
        <table class="preview-table">
          <thead>
            <tr>
              <th v-for="h in headers" :key="h">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in previewRows" :key="ri">
              <td v-for="(c, ci) in row" :key="ci">{{ c }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.col-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.col-toggle.active {
  background: var(--neon);
  border-color: var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
}
.hint {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
}
.chart-card {
  padding: 16px;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chart-canvas {
  max-height: 500px;
}
.table-scroll {
  overflow: auto;
  max-height: 300px;
  border: 2px solid var(--ink);
  background: #fff;
}
.preview-table {
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 11px;
  width: max-content;
  min-width: 100%;
}
.preview-table th, .preview-table td {
  border: 1px solid #ccc;
  padding: 4px 8px;
  white-space: nowrap;
}
.preview-table th { background: var(--paper-darker); position: sticky; top: 0; }
</style>

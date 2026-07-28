<script setup>
/**
 * PDF转Excel - 用 pdf.js 提取表格数据，识别行列边界，用 SheetJS(xlsx) 生成 xlsx
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf } from '../../utils/pdfjs.js'
import * as XLSX from 'xlsx'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const pageMode = ref('each')  // each=每页一个sheet, all=所有内容合并到一个sheet

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
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

/**
 * 从一页的textContent中识别表格行
 * 算法: 按Y坐标聚合形成行；同行内按X排序得到列
 * 列分隔: 检测X轴间距(>20pt) 切分到不同列
 */
function extractTableFromPage(items, viewport) {
  if (!items.length) return []
  // 仅保留有文本的项
  const cells = items.filter(it => 'str' in it && it.str && it.str.trim())
    .map(it => ({
      text: it.str.trim(),
      x: it.transform[4],
      y: viewport.height - it.transform[5],  // 翻转为从上到下
      w: it.width || 0
    }))
  if (!cells.length) return []
  // 按Y聚合
  cells.sort((a, b) => a.y - b.y || a.x - b.x)
  const rows = []
  let curRow = [cells[0]]
  let lastY = cells[0].y
  for (let i = 1; i < cells.length; i++) {
    if (Math.abs(cells[i].y - lastY) > 5) {
      rows.push(curRow); curRow = [cells[i]]; lastY = cells[i].y
    } else {
      curRow.push(cells[i])
    }
  }
  if (curRow.length) rows.push(curRow)

  // 收集所有X位置形成列聚类
  const allX = cells.map(c => c.x).sort((a, b) => a - b)
  // 列边界: 通过层次聚类简化
  const colCenters = []
  for (const x of allX) {
    if (!colCenters.length || x - colCenters[colCenters.length - 1] > 20) {
      colCenters.push(x)
    }
  }

  // 构建二维数组
  const matrix = rows.map(row => {
    const arr = new Array(colCenters.length).fill('')
    for (const c of row) {
      // 找到最近的列
      let bestIdx = 0, bestDist = Infinity
      for (let i = 0; i < colCenters.length; i++) {
        const d = Math.abs(colCenters[i] - c.x)
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      arr[bestIdx] += (arr[bestIdx] ? ' ' : '') + c.text
    }
    return arr
  })
  return matrix
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    const wb = XLSX.utils.book_new()
    let hasData = false
    const allRows = []
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const matrix = extractTableFromPage(content.items, viewport)
      if (matrix.length) {
        hasData = true
        if (pageMode.value === 'each') {
          // 每页一个sheet
          const ws = XLSX.utils.aoa_to_sheet(matrix)
          // 设置列宽自适应
          ws['!cols'] = matrix[0].map(() => ({ wch: 15 }))
          const sheetName = `第${i}页`.slice(0, 31)
          XLSX.utils.book_append_sheet(wb, ws, sheetName)
        } else {
          // 合并到allRows
          if (allRows.length) allRows.push([])
          allRows.push(...matrix)
        }
      }
      progress.value = Math.round((i / pdfDoc.numPages) * 90)
      progressText.value = `提取表格 ${i}/${pdfDoc.numPages}`
    }
    if (!hasData) throw new Error('未提取到表格数据，PDF可能不是表格或为扫描件')
    if (pageMode.value === 'all') {
      const ws = XLSX.utils.aoa_to_sheet(allRows)
      ws['!cols'] = (allRows[0] || []).map(() => ({ wch: 15 }))
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    }
    progressText.value = '生成Excel中...'
    const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    if (!blob.size) throw new Error('生成Excel失败')
    result.value = [{
      name: `${getBaseName(file.name)}.xlsx`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF转Excel失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转Excel" desc="提取PDF表格数据生成Excel" icon="X">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div class="mt-16" v-if="files.length">
      <label class="nb-label">输出方式</label>
      <select class="nb-select" v-model="pageMode" style="max-width:320px">
        <option value="each">每页PDF生成独立Sheet</option>
        <option value="all">所有页面合并为一个Sheet</option>
      </select>
    </div>
    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 提取中...</span>
        <span v-else>开始转换</span>
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

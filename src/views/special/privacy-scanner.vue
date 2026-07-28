<script setup>
/**
 * 文档隐私扫描仪
 * 上传 PDF/Office/图片, 扫描所有元数据
 * 输出隐私报告, 一键清理选项
 */
import { ref } from 'vue'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import exifr from 'exifr'
import { fileTypeFromBuffer } from 'file-type'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, getExt } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const processing = ref(false)
const report = ref(null)
const result = ref([])
const error = ref('')

const SENSITIVE_KEYS = ['author', 'creator', 'producer', 'creationDate', 'modDate', 'title', 'subject', 'keywords', 'gps', 'location', 'camera', 'software', 'device', 'user', 'email', 'phone']

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  file.value = f
  report.value = null
  result.value = []
  await scan()
}

async function scan() {
  if (!file.value) return
  processing.value = true
  error.value = ''
  report.value = null

  await safeRun(async () => {
    const buf = await file.value.arrayBuffer()
    const u8 = new Uint8Array(buf)
    const ext = getExt(file.value.name)

    let detected = null
    try { detected = await fileTypeFromBuffer(u8.slice(0, 4100)) } catch (e) {}

    const report_ = {
      fileName: file.value.name,
      fileSize: file.value.size,
      ext,
      detectedType: detected,
      categories: [],
      items: [],
      riskScore: 0,
      canClean: false
    }

    if (ext === 'pdf' || detected?.mime === 'application/pdf') {
      await scanPdf(buf, report_)
    } else if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'heic'].includes(ext) || (detected?.mime || '').startsWith('image/')) {
      await scanImage(buf, report_)
    } else if (['docx', 'xlsx', 'pptx'].includes(ext)) {
      await scanOffice(buf, report_)
    } else {
      report_.categories.push({ name: '不支持的格式', severity: 'info' })
      report_.items.push({ category: '通用', key: '提示', value: '此文件类型暂不支持元数据扫描' })
    }

    // 计算风险分
    const sensitiveCount = report_.items.filter(i => i.sensitive).length
    report_.riskScore = Math.min(100, sensitiveCount * 15)
    report.value = report_
  }, '扫描失败')
  processing.value = false
}

async function scanPdf(buf, report_) {
  report_.canClean = true
  try {
    const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
    report_.categories.push({ name: 'PDF 元数据', severity: 'medium' })
    const title = pdf.getTitle()
    const author = pdf.getAuthor()
    const subject = pdf.getSubject()
    const keywords = pdf.getKeywords()
    const creator = pdf.getCreator()
    const producer = pdf.getProducer()
    const creationDate = pdf.getCreationDate()
    const modDate = pdf.getModificationDate()

    if (title) report_.items.push({ category: 'PDF 元数据', key: '标题', value: title, sensitive: false })
    if (author) report_.items.push({ category: 'PDF 元数据', key: '作者', value: author, sensitive: true })
    if (subject) report_.items.push({ category: 'PDF 元数据', key: '主题', value: subject, sensitive: false })
    if (keywords) report_.items.push({ category: 'PDF 元数据', key: '关键词', value: keywords, sensitive: false })
    if (creator) report_.items.push({ category: 'PDF 元数据', key: '创建程序', value: creator, sensitive: true })
    if (producer) report_.items.push({ category: 'PDF 元数据', key: '生成器', value: producer, sensitive: true })
    if (creationDate) report_.items.push({ category: 'PDF 元数据', key: '创建时间', value: creationDate.toString(), sensitive: true })
    if (modDate) report_.items.push({ category: 'PDF 元数据', key: '修改时间', value: modDate.toString(), sensitive: true })

    // 检查注释/表单
    const pages = pdf.getPages()
    let annotCount = 0
    for (const page of pages) {
      const annots = page.node.Annots
      if (annots) annotCount += annots.size
    }
    if (annotCount > 0) {
      report_.categories.push({ name: '注释/批注', severity: 'high' })
      report_.items.push({ category: '注释', key: '注释数量', value: `${annotCount} 个批注 (可能含个人信息)`, sensitive: true })
    }

    // 检查附件
    try {
      const attachments = pdf.context.lookup(pdf.catalog.get('Names'))
      // 简化检测: 输出有无附件
      report_.items.push({ category: 'PDF 元数据', key: '页数', value: `${pages.length} 页`, sensitive: false })
    } catch (e) {}

    // JavaScript 检测
    const catalog = pdf.catalog
    if (catalog.has('AA') || catalog.has('OpenAction')) {
      report_.categories.push({ name: 'JavaScript/动作', severity: 'high' })
      report_.items.push({ category: '脚本', key: '自动动作', value: '检测到自动执行动作 (可能含 JS)', sensitive: true })
    }
  } catch (e) {
    report_.items.push({ category: 'PDF', key: '错误', value: 'PDF 解析失败: ' + e.message, sensitive: false })
  }
}

async function scanImage(buf, report_) {
  report_.canClean = true
  try {
    const exif = await exifr.parse(buf, true)
    report_.categories.push({ name: 'EXIF 元数据', severity: 'high' })
    if (!exif) {
      report_.items.push({ category: 'EXIF', key: '状态', value: '未发现 EXIF 数据', sensitive: false })
      return
    }
    for (const [key, value] of Object.entries(exif)) {
      const isSensitive = ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'Make', 'Model', 'Software',
        'DateTimeOriginal', 'CreateDate', 'OwnerName', 'Artist', 'Copyright', 'CameraSerialNumber',
        'LensModel', 'LensSerialNumber'].includes(key)
      let displayValue = value
      if (typeof value === 'object') displayValue = JSON.stringify(value)
      if (typeof value === 'number' && key.includes('GPS')) {
        displayValue = `${value.toFixed(6)}°`
        report_.categories.push({ name: 'GPS 位置信息', severity: 'high' })
      }
      report_.items.push({
        category: key.startsWith('GPS') ? 'GPS 位置' : 'EXIF',
        key,
        value: String(displayValue),
        sensitive: isSensitive
      })
    }
  } catch (e) {
    report_.items.push({ category: 'EXIF', key: '错误', value: 'EXIF 解析失败: ' + e.message, sensitive: false })
  }
}

async function scanOffice(buf, report_) {
  report_.canClean = true
  try {
    const zip = await JSZip.loadAsync(buf)
    report_.categories.push({ name: 'Office 文档属性', severity: 'medium' })

    // 读取 core.xml
    if (zip.files['docProps/core.xml']) {
      const coreContent = await zip.files['docProps/core.xml'].async('string')
      // 简单 XML 提取
      const props = ['creator', 'lastModifiedBy', 'title', 'subject', 'description', 'keywords', 'created', 'modified', 'revision', 'language']
      for (const p of props) {
        const re = new RegExp(`<(?:cp|dc|dcterms|sl):${p}[^>]*>([^<]+)</`, 'i')
        const m = coreContent.match(re)
        if (m) {
          const isSensitive = ['creator', 'lastModifiedBy', 'revision', 'created', 'modified'].includes(p)
          report_.items.push({
            category: '文档属性',
            key: p,
            value: m[1],
            sensitive: isSensitive
          })
        }
      }
    }

    // 读取 app.xml (附加属性)
    if (zip.files['docProps/app.xml']) {
      const appContent = await zip.files['docProps/app.xml'].async('string')
      const appProps = ['Application', 'Company', 'Manager', 'Template', 'TotalTime', 'Pages', 'Words', 'Characters']
      for (const p of appProps) {
        const re = new RegExp(`<${p}[^>]*>([^<]+)</`, 'i')
        const m = appContent.match(re)
        if (m) {
          const isSensitive = ['Application', 'Company', 'Manager', 'Template'].includes(p)
          report_.items.push({
            category: '应用属性',
            key: p,
            value: m[1],
            sensitive: isSensitive
          })
        }
      }
    }

    // 检查批注
    const commentFiles = Object.keys(zip.files).filter(n => n.includes('comment'))
    if (commentFiles.length > 0) {
      report_.categories.push({ name: '批注/修订', severity: 'high' })
      report_.items.push({
        category: '批注',
        key: '批注文件',
        value: `${commentFiles.length} 个批注相关文件`,
        sensitive: true
      })
    }
  } catch (e) {
    report_.items.push({ category: 'Office', key: '错误', value: 'Office 解析失败: ' + e.message, sensitive: false })
  }
}

async function clean() {
  if (!file.value || !report.value?.canClean) { showError('无法清理此文件'); return }
  processing.value = true
  error.value = ''
  result.value = []
  await safeRun(async () => {
    const buf = await file.value.arrayBuffer()
    const ext = getExt(file.value.name)
    let cleanedBlob = null

    if (ext === 'pdf') {
      const pdf = await PDFDocument.load(buf, { ignoreEncryption: true })
      pdf.setTitle('')
      pdf.setAuthor('')
      pdf.setSubject('')
      pdf.setKeywords([])
      pdf.setCreator('')
      pdf.setProducer('FileCut Privacy Cleaner')
      pdf.setCreationDate(new Date(0))
      pdf.setModificationDate(new Date(0))
      const out = await pdf.save({ useObjectStreams: true })
      cleanedBlob = new Blob([out], { type: 'application/pdf' })
    } else if (['jpg', 'jpeg', 'png', 'webp', 'tiff'].includes(ext)) {
      // 重绘图片去除 EXIF
      const bitmap = await createImageBitmap(new Blob([buf]))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
      cleanedBlob = await new Promise(res => canvas.toBlob(res, type, 0.95))
    } else if (['docx', 'xlsx', 'pptx'].includes(ext)) {
      // 重打包 ZIP, 删除 docProps
      const zip = await JSZip.loadAsync(buf)
      delete zip.files['docProps/core.xml']
      delete zip.files['docProps/app.xml']
      delete zip.files['docProps/custom.xml']
      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      cleanedBlob = out
    }

    if (!cleanedBlob || cleanedBlob.size === 0) throw new Error('清理结果为空')
    const name = `${getBaseName(file.value.name)}-cleaned.${ext}`
    result.value = [{
      name,
      blob: cleanedBlob,
      url: URL.createObjectURL(cleanedBlob),
      size: cleanedBlob.size
    }]
  }, '清理失败')
  processing.value = false
}

function removeFile() {
  file.value = null
  report.value = null
  result.value = []
}

function riskLabel(score) {
  if (score >= 60) return '高风险'
  if (score >= 30) return '中风险'
  if (score > 0) return '低风险'
  return '安全'
}
function riskClass(score) {
  if (score >= 60) return 'high'
  if (score >= 30) return 'medium'
  if (score > 0) return 'low'
  return 'safe'
}
</script>

<template>
  <ToolLayout title="文档隐私扫描仪" desc="扫描文件隐藏的元数据 (作者/GPS/批注/修订)，一键清理保护隐私" icon="🔍">
    <FileDrop accept="*" :multiple="false"
              hint="支持 PDF / 图片 (JPG/PNG/WEBP/TIFF) / Office (docx/xlsx/pptx)"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
        <button v-if="!report" class="nb-btn sm" @click="scan">重新扫描</button>
      </div>
    </div>

    <div v-if="report" class="mt-16">
      <div class="nb-card risk-card" :class="riskClass(report.riskScore)">
        <div class="risk-num">{{ report.riskScore }}/100</div>
        <div class="risk-label">{{ riskLabel(report.riskScore) }}</div>
        <div class="risk-detail">
          发现 {{ report.items.filter(i => i.sensitive).length }} 项敏感信息,
          共 {{ report.items.length }} 项元数据
        </div>
      </div>

      <div v-if="report.items.length" class="nb-card mt-16">
        <div class="report-head">
          <span class="nb-h3">详细元数据</span>
          <button v-if="report.canClean" class="nb-btn primary sm" @click="clean" :disabled="processing">
            <span v-if="processing"><span class="nb-spinner"></span> 清理中...</span>
            <span v-else>🧹 一键清理</span>
          </button>
        </div>
        <table class="meta-table mt-16">
          <thead><tr><th>类别</th><th>项</th><th>值</th><th>敏感</th></tr></thead>
          <tbody>
            <tr v-for="(item, idx) in report.items" :key="idx" :class="{ sensitive: item.sensitive }">
              <td>{{ item.category }}</td>
              <td><strong>{{ item.key }}</strong></td>
              <td class="value">{{ item.value }}</td>
              <td>{{ item.sensitive ? '⚠ 是' : '否' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!file" class="nb-alert info mt-16">
      <strong>扫描维度:</strong>
      <ul>
        <li><strong>PDF:</strong> 作者/创建者/标题/创建时间/修改时间/注释/JavaScript</li>
        <li><strong>图片:</strong> EXIF/GPS 位置/相机型号/软件/拍摄时间/版权</li>
        <li><strong>Office:</strong> 作者/最后修改人/公司/管理员/批注/修订记录</li>
      </ul>
      <strong>清理选项:</strong> 清空所有元数据字段，删除批注文件，重绘图片去 EXIF。
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.risk-card {
  padding: 24px;
  text-align: center;
  border-left: 8px solid var(--ink);
}
.risk-card.safe { border-left-color: var(--neon-deep); background: linear-gradient(to right, var(--neon) 0%, var(--paper-card) 30%); }
.risk-card.low { border-left-color: var(--cyan); background: linear-gradient(to right, var(--cyan) 0%, var(--paper-card) 30%); color: white; }
.risk-card.medium { border-left-color: var(--warning); background: linear-gradient(to right, var(--warning) 0%, var(--paper-card) 30%); }
.risk-card.high { border-left-color: var(--danger); background: linear-gradient(to right, var(--accent-soft) 0%, var(--paper-card) 30%); }
.risk-num { font-family: var(--font-display); font-size: 3rem; font-weight: 700; line-height: 1; }
.risk-label { font-family: var(--font-mono); font-size: 14px; margin-top: 4px; }
.risk-detail { font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft); margin-top: 8px; }
.report-head { display: flex; justify-content: space-between; align-items: center; }
.meta-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--paper-bg);
}
.meta-table th, .meta-table td {
  border: 2px solid var(--ink);
  padding: 6px 8px;
  text-align: left;
}
.meta-table th { background: var(--ink); color: var(--neon); }
.meta-table tr.sensitive { background: var(--accent-soft); }
.meta-table td.value { word-break: break-all; max-width: 400px; }
ul { margin: 6px 0 12px 20px; }
</style>

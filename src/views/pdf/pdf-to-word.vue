<script setup>
/**
 * PDF转Word(.docx) - 用 pdf.js 提取文本+布局，用 JSZip 手动构造 OOXML 生成 .docx
 *
 * 注: package.json 未装 docx 库，故使用 JSZip 直接构造最小化的 OOXML docx 包
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf } from '../../utils/pdfjs.js'
import JSZip from 'jszip'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const ocrHint = ref(false)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''; ocrHint.value = false
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

/** XML特殊字符转义 */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 构建段落XML */
function buildParagraph(text, opts = {}) {
  const align = opts.align || 'left'
  const bold = opts.bold ? '<w:b/>' : ''
  const size = opts.size ? `<w:sz w:val="${opts.size * 2}"/>` : ''
  const heading = opts.heading ? `<w:pStyle w:val="Heading${opts.heading}"/>` : ''
  const safe = xmlEscape(text)
  return `<w:p><w:pPr>${heading}<w:jc w:val="${align}"/>${size}${bold}</w:pPr><w:r><w:rPr>${bold}${size}</w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`
}

/** 构建表格XML */
function buildTable(rows) {
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map(r => r.length))
  let xml = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
  for (const edge of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
    xml += `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`
  }
  xml += '</w:tblBorders></w:tblPr><w:tblGrid>'
  for (let i = 0; i < colCount; i++) xml += '<w:gridCol w:w="2000"/>'
  xml += '</w:tblGrid>'
  for (const row of rows) {
    xml += '<w:tr>'
    for (let i = 0; i < colCount; i++) {
      const cell = xmlEscape(row[i] || '')
      xml += `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${cell}</w:t></w:r></w:p></w:tc>`
    }
    xml += '</w:tr>'
  }
  xml += '</w:tbl>'
  return xml
}

/** 提取单页内容并返回段落+表格的XML */
async function extractPageXml(page) {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items = content.items.filter(it => 'str' in it && it.str).map(it => {
    const tm = it.transform
    const fontSize = Math.hypot(tm[2], tm[3]) || it.height || 12
    return { text: it.str, x: tm[4], y: viewport.height - tm[5], fontSize }
  })
  if (!items.length) return ''
  items.sort((a, b) => a.y - b.y || a.x - b.x)
  // 按Y分行
  const lines = []
  let cur = [items[0]], lastY = items[0].y
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].y - lastY) > 4) {
      lines.push(cur); cur = [items[i]]; lastY = items[i].y
    } else cur.push(items[i])
  }
  if (cur.length) lines.push(cur)

  // 计算正文字号
  const sizeCount = {}
  for (const it of items) {
    const k = Math.round(it.fontSize)
    sizeCount[k] = (sizeCount[k] || 0) + it.text.length
  }
  const bodySize = Number(Object.entries(sizeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 12)

  let xml = ''
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const lineText = line.map(it => it.text).join('').trim()
    if (!lineText) { continue }
    const maxSz = Math.max(...line.map(it => it.fontSize))
    const ratio = maxSz / bodySize
    let heading = 0
    if (ratio >= 2.0 && lineText.length < 80) heading = 1
    else if (ratio >= 1.5 && lineText.length < 80) heading = 2
    else if (ratio >= 1.25 && lineText.length < 80 && /^[0-9第章部]/.test(lineText)) heading = 3

    // 表格检测: 多列且连续多行
    if (line.length >= 2 && li + 1 < lines.length && lines[li + 1].length >= 2) {
      const colCount = line.length
      let ni = li + 1
      const tableRows = [line.map(it => it.text)]
      while (ni < lines.length && lines[ni].length >= 2 && Math.abs(lines[ni].length - colCount) <= 1) {
        tableRows.push(lines[ni].map(it => it.text))
        ni++
      }
      if (ni - li >= 2) {
        xml += buildTable(tableRows)
        li = ni - 1
        continue
      }
    }
    xml += buildParagraph(lineText, heading ? { heading } : {})
  }
  return xml
}

/** 构造完整docx包 */
async function buildDocx(paragraphsXml, metadata = {}) {
  const zip = new JSZip()
  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)

  // word/_rels/document.xml.rels
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`)

  // word/document.xml
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphsXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body>
</w:document>`)

  // word/styles.xml - 含标题样式
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="SimSun" w:eastAsia="SimSun" w:hAnsi="SimSun"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
</w:styles>`)

  // word/settings.xml
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/></w:settings>`)

  // docProps/core.xml
  const now = new Date().toISOString()
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(metadata.title || '')}</dc:title>
  <dc:creator>FileCut</dc:creator>
  <cp:lastModifiedBy>FileCut</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`)

  // docProps/app.xml
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>FileCut</Application><AppVersion>1.0</AppVersion></Properties>`)

  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    let bodyXml = ''
    let extractedAny = false
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const xml = await extractPageXml(page)
      if (xml) extractedAny = true
      // 添加分页符
      if (i > 1) bodyXml += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
      bodyXml += xml
      progress.value = Math.round((i / pdfDoc.numPages) * 90)
      progressText.value = `提取 ${i}/${pdfDoc.numPages} 页`
    }
    if (!extractedAny) {
      ocrHint.value = true
      throw new Error('PDF未提取到文本，可能是扫描件，请使用「扫描件OCR转可搜索PDF」工具先识别')
    }
    progressText.value = '生成docx中...'
    const blob = await buildDocx(bodyXml, { title: getBaseName(file.name) })
    if (!blob.size) throw new Error('生成Word文件失败')
    result.value = [{
      name: `${getBaseName(file.name)}.docx`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF转Word失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转Word" desc="PDF转可编辑Word文档，保留段落与表格结构" icon="W">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件，支持加密PDF" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="ocrHint" class="nb-alert warning mt-16">
      未提取到文本，可能是扫描件PDF。建议先使用「扫描件OCR转可搜索PDF」工具
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" />
  </ToolLayout>
</template>

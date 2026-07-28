<script setup>
/**
 * PDF转EPUB - 提取文本分章节(基于标题样式)，用JSZip构造EPUB包
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
const author = ref('')

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

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 提取并分章节 */
async function extractChapters(pdfDoc, onProgress) {
  const chapters = [{ title: '开始', paragraphs: [] }]
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = content.items.filter(it => 'str' in it && it.str).map(it => {
      const tm = it.transform
      const fontSize = Math.hypot(tm[2], tm[3]) || it.height || 12
      return { text: it.str, x: tm[4], y: viewport.height - tm[5], fontSize }
    })
    items.sort((a, b) => a.y - b.y || a.x - b.x)
    const lines = []
    let cur = [], lastY = null
    for (const it of items) {
      if (lastY !== null && Math.abs(it.y - lastY) > 4) { lines.push(cur); cur = [] }
      cur.push(it); lastY = it.y
    }
    if (cur.length) lines.push(cur)

    // 计算正文字号
    const sizeCount = {}
    for (const it of items) {
      const k = Math.round(it.fontSize)
      sizeCount[k] = (sizeCount[k] || 0) + it.text.length
    }
    const bodySize = Number(Object.entries(sizeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 12)

    for (const line of lines) {
      const lineText = line.map(it => it.text).join('').trim()
      if (!lineText) continue
      const maxSz = Math.max(...line.map(it => it.fontSize))
      const ratio = maxSz / bodySize
      // 标题切分章节
      if (ratio >= 1.5 && lineText.length < 80) {
        chapters.push({ title: lineText, paragraphs: [] })
      } else {
        chapters[chapters.length - 1].paragraphs.push(lineText)
      }
    }
    if (onProgress) onProgress(i, pdfDoc.numPages)
  }
  // 删除空章节
  return chapters.filter(c => c.paragraphs.length > 0 || c.title !== '开始')
}

function buildEpub(chapters, meta) {
  const zip = new JSZip()
  const bookId = `urn:uuid:${Date.now()}-${Math.random().toString(36).slice(2)}`
  const now = new Date().toISOString()

  // mimetype (必须为第一个文件且不压缩)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // OEBPS/content.opf
  const manifestItems = chapters.map((_, i) =>
    `<item id="chap${i + 1}" href="chap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n    ')
  const spineItems = chapters.map((_, i) => `<itemref idref="chap${i + 1}"/>`).join('\n    ')
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${xmlEscape(meta.title)}</dc:title>
    <dc:creator>${xmlEscape(meta.author || 'Unknown')}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine>
    <itemref idref="nav"/>
    ${spineItems}
  </spine>
</package>`)

  // OEBPS/nav.xhtml
  const navItems = chapters.map((c, i) =>
    `<li><a href="chap${i + 1}.xhtml">${xmlEscape(c.title)}</a></li>`
  ).join('\n    ')
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head><meta charset="UTF-8"/><title>目录</title><link rel="stylesheet" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>目录</h1><ol>${navItems}</ol></nav>
</body></html>`)

  // OEBPS/style.css
  zip.file('OEBPS/style.css', `body{font-family:"Noto Sans SC","Microsoft YaHei",serif;line-height:1.7;margin:5%;color:#222}
h1{font-size:1.5em;color:#1a1a1a;border-bottom:2px solid #ccc;padding-bottom:0.3em}
p{text-indent:2em;margin:0.5em 0}`)

  // OEBPS/chapN.xhtml
  chapters.forEach((c, i) => {
    const paragraphs = c.paragraphs.map(p => `<p>${xmlEscape(p)}</p>`).join('\n')
    zip.file(`OEBPS/chap${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><meta charset="UTF-8"/><title>${xmlEscape(c.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>${xmlEscape(c.title)}</h1>
${paragraphs}
</body></html>`)
  })

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    progressText.value = '提取文本中...'
    const chapters = await extractChapters(pdfDoc, (cur, total) => {
      progress.value = Math.round((cur / total) * 80)
      progressText.value = `提取 ${cur}/${total} 页`
    })
    if (!chapters.length) throw new Error('PDF未提取到文本，可能是扫描件')
    progressText.value = '生成EPUB中...'
    const blob = await buildEpub(chapters, {
      title: getBaseName(file.name),
      author: author.value || 'Unknown'
    })
    if (!blob.size) throw new Error('生成EPUB失败')
    result.value = [{
      name: `${getBaseName(file.name)}.epub`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = `完成，共 ${chapters.length} 章`
  }, 'PDF转EPUB失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转EPUB" desc="提取文本分章节生成EPUB电子书" icon="E">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div class="mt-16" v-if="files.length">
      <label class="nb-label">作者(可选)</label>
      <input class="nb-input" type="text" v-model="author" placeholder="作者名" style="max-width:320px" />
    </div>
    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
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

<script setup>
/**
 * PDF转HTML - 用 pdf.js 提取文本+图片资源
 * 输出独立HTML(资源base64内联，避免路径断链)
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdf, pdfjsLib } from '../../utils/pdfjs.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const inlineImages = ref(true)
const previewHtml = ref('')

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

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function extractPageHtml(page, pageNum) {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items = content.items.filter(it => 'str' in it && it.str).map(it => {
    const tm = it.transform
    const fontSize = Math.hypot(tm[2], tm[3]) || it.height || 12
    return { text: it.str, x: tm[4], y: viewport.height - tm[5], fontSize, w: it.width || 0 }
  })
  // 按Y分行
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

  let html = `<section class="pdf-page" data-page="${pageNum}" style="width:${Math.round(viewport.width)}pt;min-height:${Math.round(viewport.height)}pt;">`
  for (const line of lines) {
    const lineText = line.map(it => htmlEscape(it.text)).join('')
    if (!lineText.trim()) continue
    const maxSz = Math.max(...line.map(it => it.fontSize))
    const ratio = maxSz / bodySize
    let tag = 'p'
    if (ratio >= 2.0) tag = 'h1'
    else if (ratio >= 1.5) tag = 'h2'
    else if (ratio >= 1.25 && /^[0-9第章部]/.test(lineText)) tag = 'h3'
    html += `<${tag}>${lineText}</${tag}>`
  }
  html += '</section>'
  return html
}

async function extractPageImage(page) {
  try {
    const ops = await page.getOperatorList()
    const imgIndexes = ops.fnArray.filter((fn, i) =>
      fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImage
    )
    if (!imgIndexes.length) return []
    const urls = []
    // 通过 page.objs 获取图片
    const idxCount = ops.fnArray.length
    for (let i = 0; i < idxCount; i++) {
      const fn = ops.fnArray[i]
      if (fn === pdfjsLib.OPS.paintImageXObject) {
        const args = ops.argsArray[i]
        try {
          const obj = await new Promise((resolve) => {
            page.objs.get(args[0], (img) => resolve(img))
          })
          if (obj && obj.data && obj.width && obj.height) {
            // 转canvas然后toDataURL
            const canvas = document.createElement('canvas')
            canvas.width = obj.width
            canvas.height = obj.height
            const ctx = canvas.getContext('2d')
            const imgData = ctx.createImageData(obj.width, obj.height)
            // pdf.js 返回 RGBA 或 RGB
            const src = obj.data
            const dst = imgData.data
            if (src.length === dst.length) {
              dst.set(src)
            } else if (src.length === obj.width * obj.height * 3) {
              for (let p = 0, q = 0; p < dst.length; p += 4, q += 3) {
                dst[p] = src[q]; dst[p + 1] = src[q + 1]; dst[p + 2] = src[q + 2]; dst[p + 3] = 255
              }
            }
            ctx.putImageData(imgData, 0, 0)
            urls.push(canvas.toDataURL('image/png'))
          }
        } catch (e) { /* skip */ }
      }
    }
    return urls
  } catch (e) {
    return []
  }
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; previewHtml.value = ''
  processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const pdfDoc = await loadPdf(file, password.value ? { password: password.value } : {})
    let bodyHtml = ''
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      bodyHtml += await extractPageHtml(page, i)
      if (inlineImages.value) {
        const imgs = await extractPageImage(page)
        if (imgs.length) {
          bodyHtml += `<div class="page-images">`
          for (const u of imgs) bodyHtml += `<img src="${u}" alt="image" />`
          bodyHtml += `</div>`
        }
      }
      progress.value = Math.round((i / pdfDoc.numPages) * 90)
      progressText.value = `提取 ${i}/${pdfDoc.numPages} 页`
    }
    const title = getBaseName(file.name)
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${htmlEscape(title)}</title>
<style>
body { font-family: -apple-system, "Noto Sans SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #222; line-height: 1.7; }
.pdf-page { margin: 24px 0; padding: 16px; border: 1px solid #ddd; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
h1 { font-size: 1.8em; margin: 0.6em 0 0.3em; color: #1a1a1a; }
h2 { font-size: 1.4em; margin: 0.5em 0 0.3em; color: #333; }
h3 { font-size: 1.2em; margin: 0.4em 0 0.2em; color: #444; }
p { margin: 0.3em 0; }
.page-images img { max-width: 100%; margin: 8px 0; display: block; }
</style>
</head>
<body>
<h1>${htmlEscape(title)}</h1>
${bodyHtml}
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    if (!blob.size) throw new Error('生成HTML失败')
    result.value = [{
      name: `${title}.html`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    // 预览(限制大小避免卡顿)
    if (blob.size < 500 * 1024) previewHtml.value = html
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF转HTML失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转HTML" desc="PDF转网页HTML，资源内联避免路径断链" icon="H">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div class="mt-16" v-if="files.length">
      <label class="nb-label"><input type="checkbox" v-model="inlineImages" /> 提取并内联图片(体积变大)</label>
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
    <div v-if="previewHtml" class="mt-16">
      <h3 class="nb-h3">预览</h3>
      <iframe :srcdoc="previewHtml" style="width:100%;height:500px;border:3px solid var(--ink);box-shadow:5px 5px 0 var(--ink);"></iframe>
    </div>
  </ToolLayout>
</template>

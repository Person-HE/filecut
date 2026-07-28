/**
 * pdf.js 封装 - 浏览器端PDF解析与渲染
 * 配置worker、字体、cmap等
 *
 * 关键技术点：
 * 1. pdf.js 必须配置 workerSrc
 * 2. 中文PDF需要 cMapUrl 和 standardFontDataUrl
 * 3. 大文件用 range request (HTTP) 或全量加载 (File)
 */
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// 配置 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// CDN 资源 - 用于 cMap 和标准字体（中文PDF必备）
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82'
pdfjsLib.GlobalWorkerOptions.cMapUrl = `${CDN_BASE}/cmaps/`
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = `${CDN_BASE}/standard_fonts/`

/**
 * 加载PDF文档
 * @param {File|ArrayBuffer|Uint8Array} source
 * @param {Object} options - { password, ... }
 * @returns {Promise<pdfjsLib.PDFDocumentProxy>}
 */
export async function loadPdf(source, options = {}) {
  let data
  if (source instanceof File) {
    data = await source.arrayBuffer()
  } else if (source instanceof ArrayBuffer) {
    data = source
  } else if (source instanceof Uint8Array) {
    data = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
  } else {
    data = source
  }

  const loadingTask = pdfjsLib.getDocument({
    data,
    password: options.password,
    cMapPacked: true,
    cMapUrl: pdfjsLib.GlobalWorkerOptions.cMapUrl,
    standardFontDataUrl: pdfjsLib.GlobalWorkerOptions.standardFontDataUrl,
    disableAutoFetch: false,
    disableStream: false,
    ...options
  })
  return await loadingTask.promise
}

/**
 * 渲染单页到Canvas
 * @param {pdfjsLib.PDFPageProxy} page
 * @param {number} scale - 渲染缩放
 * @param {HTMLCanvasElement} canvas - 目标canvas(可选)
 * @returns {Promise<{canvas, width, height}>}
 */
export async function renderPage(page, scale = 1.5, canvas = null) {
  const viewport = page.getViewport({ scale })
  if (!canvas) canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  await page.render({
    canvasContext: ctx,
    viewport,
    intent: 'display'
  }).promise

  return { canvas, width: viewport.width, height: viewport.height }
}

/**
 * 渲染页面到图片Blob
 * @param {pdfjsLib.PDFPageProxy} page
 * @param {number} scale
 * @param {string} type - image/png | image/jpeg | image/webp
 * @param {number} quality - 0-1(jpeg/webp)
 * @returns {Promise<{blob, canvas, width, height}>}
 */
export async function renderPageToImage(page, scale = 2, type = 'image/png', quality = 0.92) {
  const { canvas, width, height } = await renderPage(page, scale)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality))
  return { blob, canvas, width, height }
}

/**
 * 提取单页文本
 */
export async function extractPageText(page) {
  const content = await page.getTextContent()
  // 按Y坐标分组形成行
  const items = content.items.filter(i => 'str' in i)
  items.sort((a, b) => {
    const ya = a.transform[5]
    const yb = b.transform[5]
    if (Math.abs(ya - yb) > 2) return yb - ya
    return a.transform[4] - b.transform[4]
  })
  let text = ''
  let lastY = null
  for (const it of items) {
    const y = it.transform[5]
    if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n'
    else if (lastY !== null && Math.abs(y - lastY) <= 2) text += ''
    text += it.str
    if (it.hasEOL) text += '\n'
    lastY = y
  }
  return text
}

/**
 * 提取整个PDF文本
 */
export async function extractAllText(pdfDoc, onPageProgress = null) {
  const texts = []
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const text = await extractPageText(page)
    texts.push(text)
    if (onPageProgress) onPageProgress(i, pdfDoc.numPages)
  }
  return texts.join('\n\n--- Page Break ---\n\n')
}

/**
 * 检测PDF是否加密
 */
export async function isEncrypted(source) {
  try {
    await loadPdf(source)
    return false
  } catch (e) {
    return /password/i.test(e.message || '')
  }
}

export { pdfjsLib }
export default pdfjsLib

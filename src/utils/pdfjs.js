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
// 多源回退：jsdelivr 被墙/限流时自动切换到 unpkg
const CDN_BASES = [
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82',
  'https://unpkg.com/pdfjs-dist@4.6.82'
]
// @ts-expect-error pdfjs-dist 类型未包含 cMapUrl
pdfjsLib.GlobalWorkerOptions.cMapUrl = `${CDN_BASES[0]}/cmaps/`
// @ts-expect-error pdfjs-dist 类型未包含 standardFontDataUrl
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = `${CDN_BASES[0]}/standard_fonts/`

/**
 * 按候选地址依次尝试，第一个成功即返回
 * @param {string[]} urls - 候选地址列表
 * @returns {Promise<string>} 成功的地址
 */
async function fetchFirstAvailable(urls) {
  let lastError = null
  for (const url of urls) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return url
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new Error('所有候选地址均不可用')
}

/**
 * 探测可用的 CDN 源并更新 pdf.js 全局配置
 * 首个源可用时立即返回，不产生额外请求
 */
export async function ensureCdnAvailable() {
  try {
    const base = await fetchFirstAvailable(CDN_BASES.map(b => `${b}/package.json`))
    const resolved = base.replace(/\/package\.json$/, '')
    // @ts-expect-error pdfjs-dist 类型未包含 cMapUrl
    pdfjsLib.GlobalWorkerOptions.cMapUrl = `${resolved}/cmaps/`
    // @ts-expect-error pdfjs-dist 类型未包含 standardFontDataUrl
    pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = `${resolved}/standard_fonts/`
    return resolved
  } catch (e) {
    console.warn('[FileCut] 所有 CDN 源均不可用，PDF 字体资源可能加载失败:', e?.message || e)
    return null
  }
}

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
    // @ts-expect-error pdfjs-dist 类型未包含 cMapUrl
    cMapUrl: pdfjsLib.GlobalWorkerOptions.cMapUrl,
    // @ts-expect-error pdfjs-dist 类型未包含 standardFontDataUrl
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

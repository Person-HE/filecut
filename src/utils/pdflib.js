/**
 * pdf-lib 封装 - 浏览器端PDF编辑/生成
 *
 * 关键点：
 * 1. 中文字体必须嵌入TTF子集 - 需注册 fontkit 实例
 * 2. 修改已签名PDF会破坏签名 - 警告用户
 * 3. 加密文档需先解密
 */
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

/**
 * 注册 fontkit - pdf-lib 嵌入自定义字体(TTF/OTF)的前置条件
 * 未注册时 embedFont 会抛出 "no fontkit instance was found"
 */
export function registerFontkit(pdfDoc) {
  try {
    pdfDoc.registerFontkit(fontkit)
  } catch (e) {
    // 重复注册会抛错，已注册时忽略
  }
  return pdfDoc
}

/**
 * 加载已有PDF
 * @param {File|ArrayBuffer|Uint8Array} source
 * @returns {Promise<PDFDocument>}
 */
export async function loadPdfLib(source) {
  let data
  if (source instanceof File) data = await source.arrayBuffer()
  else if (source instanceof ArrayBuffer) data = source
  else if (source instanceof Uint8Array) data = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
  else data = source
  const doc = await PDFDocument.load(data, { ignoreEncryption: true })
  return registerFontkit(doc)
}

/**
 * 创建新PDF
 */
export async function createPdf() {
  return registerFontkit(await PDFDocument.create())
}

/**
 * 嵌入字体（必须用于中文）
 * 通过CDN加载思源黑体（开源）- 多源回退，jsdelivr 不可用时切 unpkg
 */
const FONT_CACHE = {}
const FONT_URLS = [
  'https://cdn.jsdelivr.net/npm/source-han-sans-cn@1.0.0/SourceHanSansCN-Regular.otf',
  'https://unpkg.com/source-han-sans-cn@1.0.0/SourceHanSansCN-Regular.otf',
  'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff',
  'https://unpkg.com/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff'
]

/**
 * 依次尝试候选地址，返回第一个成功的二进制内容
 */
async function fetchFirstAvailable(urls) {
  let lastError = null
  for (const url of urls) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return await resp.arrayBuffer()
    } catch (e) {
      lastError = e
    }
  }
  throw lastError || new Error('所有字体源均不可用')
}

export async function embedChineseFont(pdfDoc, weight = 'regular') {
  const key = `sc-${weight}`
  if (!FONT_CACHE[key]) {
    FONT_CACHE[key] = await fetchFirstAvailable(FONT_URLS)
  }
  registerFontkit(pdfDoc)
  return pdfDoc.embedFont(FONT_CACHE[key], { subset: true })
}

/**
 * 嵌入自定义字体
 */
export async function embedCustomFont(pdfDoc, fontFile) {
  const buf = fontFile instanceof File
    ? await fontFile.arrayBuffer()
    : fontFile
  registerFontkit(pdfDoc)
  return pdfDoc.embedFont(buf, { subset: true })
}

/**
 * RGB颜色辅助
 */
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return rgb(r, g, b)
}

export { PDFDocument, rgb, degrees, StandardFonts }

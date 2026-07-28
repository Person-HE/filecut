/**
 * pdf-lib 封装 - 浏览器端PDF编辑/生成
 *
 * 关键点：
 * 1. 中文字体必须嵌入TTF子集
 * 2. 修改已签名PDF会破坏签名 - 警告用户
 * 3. 加密文档需先解密
 */
import { PDFDocument, fonts, rgb, degrees, StandardFonts } from 'pdf-lib'

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
  return await PDFDocument.load(data, { ignoreEncryption: true })
}

/**
 * 创建新PDF
 */
export async function createPdf() {
  return await PDFDocument.create()
}

/**
 * 嵌入字体（必须用于中文）
 * 通过CDN加载思源黑体（开源）
 */
const FONT_CACHE = {}
const FONT_URLS = {
  sourceHanSans: 'https://cdn.jsdelivr.net/npm/source-han-sans-cn@1.0.0/SourceHanSansCN-Regular.otf',
  notoSansSC: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff'
}

export async function embedChineseFont(pdfDoc, weight = 'regular') {
  const key = `sc-${weight}`
  if (FONT_CACHE[key]) {
    return pdfDoc.embedFont(FONT_CACHE[key], { subset: true })
  }
  const url = FONT_URLS.sourceHanSans
  const buf = await fetch(url).then(r => r.arrayBuffer())
  FONT_CACHE[key] = buf
  return pdfDoc.embedFont(buf, { subset: true })
}

/**
 * 嵌入自定义字体
 */
export async function embedCustomFont(pdfDoc, fontFile) {
  const buf = fontFile instanceof File
    ? await fontFile.arrayBuffer()
    : fontFile
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

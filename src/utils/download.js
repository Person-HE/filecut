/**
 * 下载工具 - 浏览器端文件下载
 */

/**
 * 通过Blob下载文件
 * @param {Blob} blob - 文件内容
 * @param {string} filename - 下载文件名
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  // 延迟释放URL
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * 通过URL下载文件
 * @param {string} url - 资源地址
 * @param {string} filename - 下载文件名
 */
export function downloadUrl(url, filename) {
  triggerDownload(url, filename)
}

/**
 * 触发浏览器下载
 * @param {string} url - 资源地址
 * @param {string} filename - 下载文件名
 */
function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * 替换文件扩展名
 * @param {string} filename - 原文件名
 * @param {string} newExt - 新扩展名(可带或不带点)
 * @returns {string}
 */
export function replaceExt(filename, newExt) {
  const baseName = filename.replace(/\.[^/.]+$/, '')
  return baseName + (newExt.startsWith('.') ? newExt : '.' + newExt)
}

/**
 * 获取文件名(无扩展名)
 * @param {string} filename - 文件名
 * @returns {string}
 */
export function getBaseName(filename) {
  return filename.replace(/\.[^/.]+$/, '')
}

/**
 * 获取扩展名(小写)
 * @param {string} filename - 文件名
 * @returns {string} 无扩展名时返回空字符串
 */
export function getExt(filename) {
  const m = filename.match(/\.([^/.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

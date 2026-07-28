/**
 * 文件读取工具 - 读取File为各种格式
 */

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

export function readFileAsText(file, encoding) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    if (encoding) reader.readAsText(file, encoding)
    else reader.readAsText(file)
  })
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export function readFileAsBinaryString(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsBinaryString(file)
  })
}

/**
 * ArrayBuffer 转 Uint8Array
 */
export function toArrayBuffer(uint8) {
  return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)
}

/**
 * 流式读取大文件分块
 * @param {File} file
 * @param {number} chunkSize 每块字节数
 * @yields {Uint8Array}
 */
export async function* streamFile(file, chunkSize = 1024 * 1024) {
  const total = file.size
  let offset = 0
  while (offset < total) {
    const end = Math.min(offset + chunkSize, total)
    const slice = file.slice(offset, end)
    const buf = await slice.arrayBuffer()
    yield new Uint8Array(buf)
    offset = end
  }
}

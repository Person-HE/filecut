import { vi, beforeAll, beforeEach } from 'vitest'

beforeAll(() => {
  window.alert = vi.fn()
  window.confirm = vi.fn(() => true)

  // jsdom 的 Blob 未实现 arrayBuffer()/text()，补齐以支持 File 读取路径
  if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
        reader.readAsArrayBuffer(this)
      })
    }
  }
  if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
    Blob.prototype.text = function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'))
        reader.readAsText(this)
      })
    }
  }
})

beforeEach(() => {
  vi.mocked(window.alert)?.mockClear()
  vi.mocked(window.confirm)?.mockClear()
})

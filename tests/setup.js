import { vi, beforeAll, beforeEach } from 'vitest'
import zhMessages from '../src/i18n/locales/zh-CN.js'

// 固定测试语言为中文（jsdom 默认 navigator.language 为 en-US）
localStorage.setItem('filecut-locale', 'zh-CN')

// vue-i18n mock for component tests — 返回真实的中文翻译
vi.mock('vue-i18n', () => {
  const locale = { value: 'zh-CN' }

  function t(key, params = {}) {
    // 嵌套路径查找
    const parts = key.split('.')
    let msg = zhMessages
    for (const p of parts) {
      if (msg && typeof msg === 'object' && msg[p] !== undefined) {
        msg = msg[p]
      } else {
        return key // fallback to key
      }
    }
    if (typeof msg !== 'string') return key

    // 参数替换
    let result = msg
    Object.keys(params).forEach(k => {
      result = result.replace(`{${k}}`, params[k])
    })
    return result
  }

  return {
    createI18n: vi.fn(() => ({
      global: { locale, t, messages: { value: { 'zh-CN': zhMessages } } }
    })),
    useI18n: vi.fn(() => ({ locale, t, messages: {} })),
    useI18nLocale: vi.fn(() => locale)
  }
})

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

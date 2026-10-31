import { describe, it, expect, vi, beforeEach } from 'vitest'

const getDocumentMock = vi.fn()

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args) => getDocumentMock(...args)
}))

const { loadPdf, renderPage, renderPageToImage, extractPageText, extractAllText, isEncrypted } =
  await import('../../src/utils/pdfjs.js')

function mockDoc(numPages = 1) {
  return {
    numPages,
    getPage: vi.fn(async (n) => ({
      getTextContent: async () => ({ items: [{ str: `page${n}`, transform: [1, 0, 0, 1, 0, 100], hasEOL: false }] })
    }))
  }
}

beforeEach(() => {
  getDocumentMock.mockReset()
  getDocumentMock.mockReturnValue({ promise: Promise.resolve(mockDoc()) })
})

describe('pdfjs.js - loadPdf', () => {
  it('File 输入转换为 ArrayBuffer', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.pdf')
    await loadPdf(file)
    const opts = getDocumentMock.mock.calls[0][0]
    expect(opts.data).toBeInstanceOf(ArrayBuffer)
    expect(opts.data.byteLength).toBe(3)
  })

  it('ArrayBuffer 输入原样传递', async () => {
    const buf = new ArrayBuffer(8)
    await loadPdf(buf)
    expect(getDocumentMock.mock.calls[0][0].data).toBe(buf)
  })

  it('Uint8Array 输入只取有效区间', async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9])
    const view = backing.subarray(2, 5)
    await loadPdf(view)
    const data = getDocumentMock.mock.calls[0][0].data
    expect(data.byteLength).toBe(3)
  })

  it('传入密码参数', async () => {
    await loadPdf(new ArrayBuffer(4), { password: 'secret' })
    expect(getDocumentMock.mock.calls[0][0].password).toBe('secret')
  })

  it('配置 cMap 与标准字体地址', async () => {
    await loadPdf(new ArrayBuffer(4))
    const opts = getDocumentMock.mock.calls[0][0]
    expect(opts.cMapPacked).toBe(true)
    expect(opts.cMapUrl).toContain('cmaps')
    expect(opts.standardFontDataUrl).toContain('standard_fonts')
  })

  it('加载失败时抛出异常', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF structure')) })
    await expect(loadPdf(new ArrayBuffer(4))).rejects.toThrow('Invalid PDF structure')
  })
})

describe('pdfjs.js - renderPage', () => {
  it('按 scale 计算画布尺寸并返回结果', async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve() }))
    const page = {
      getViewport: vi.fn(({ scale }) => ({ width: 100 * scale, height: 200 * scale })),
      render
    }
    const result = await renderPage(page, 2)
    expect(result.width).toBe(200)
    expect(result.height).toBe(400)
    expect(result.canvas.width).toBe(200)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('默认 scale 为 1.5', async () => {
    const page = {
      getViewport: vi.fn(({ scale }) => ({ width: 100 * scale, height: 100 * scale })),
      render: vi.fn(() => ({ promise: Promise.resolve() }))
    }
    const result = await renderPage(page)
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.5 })
    expect(result.width).toBe(150)
  })
})

describe('pdfjs.js - extractPageText', () => {
  it('按 Y 坐标排序并拼接文本', async () => {
    const page = {
      getTextContent: async () => ({
        items: [
          { str: '第二行', transform: [1, 0, 0, 1, 0, 50], hasEOL: false },
          { str: '第一行', transform: [1, 0, 0, 1, 0, 100], hasEOL: false }
        ]
      })
    }
    const text = await extractPageText(page)
    expect(text).toBe('第一行\n第二行')
  })

  it('同行内按 X 坐标排序', async () => {
    const page = {
      getTextContent: async () => ({
        items: [
          { str: 'B', transform: [1, 0, 0, 1, 50, 100], hasEOL: false },
          { str: 'A', transform: [1, 0, 0, 1, 10, 100], hasEOL: false }
        ]
      })
    }
    expect(await extractPageText(page)).toBe('AB')
  })

  it('过滤无 str 字段的项', async () => {
    const page = {
      getTextContent: async () => ({
        items: [
          { str: '文字', transform: [1, 0, 0, 1, 0, 100], hasEOL: false },
          { transform: [1, 0, 0, 1, 0, 100] }
        ]
      })
    }
    expect(await extractPageText(page)).toBe('文字')
  })

  it('hasEOL 时追加换行', async () => {
    const page = {
      getTextContent: async () => ({
        items: [{ str: '行1', transform: [1, 0, 0, 1, 0, 100], hasEOL: true }]
      })
    }
    expect(await extractPageText(page)).toBe('行1\n')
  })
})

describe('pdfjs.js - extractAllText', () => {
  it('提取所有页并用分页符连接', async () => {
    const doc = mockDoc(3)
    const text = await extractAllText(doc)
    expect(doc.getPage).toHaveBeenCalledTimes(3)
    expect(text).toContain('page1')
    expect(text).toContain('page3')
    expect(text).toContain('--- Page Break ---')
  })

  it('触发进度回调', async () => {
    const doc = mockDoc(2)
    const onProgress = vi.fn()
    await extractAllText(doc, onProgress)
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2)
  })
})

describe('pdfjs.js - isEncrypted', () => {
  it('正常加载返回 false', async () => {
    expect(await isEncrypted(new ArrayBuffer(4))).toBe(false)
  })

  it('密码相关异常返回 true', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new Error('No password given for encrypted document'))
    })
    expect(await isEncrypted(new ArrayBuffer(4))).toBe(true)
  })

  it('非密码异常返回 false', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.reject(new Error('Invalid PDF structure'))
    })
    expect(await isEncrypted(new ArrayBuffer(4))).toBe(false)
  })
})

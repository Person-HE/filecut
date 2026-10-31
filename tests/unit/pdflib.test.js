import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadPdfLib, createPdf, embedChineseFont, embedCustomFont, hexToRgb } from '../../src/utils/pdflib.js'

describe('pdflib.js - createPdf', () => {
  it('创建空 PDF 文档', async () => {
    const doc = await createPdf()
    expect(doc.getPageCount()).toBe(0)
  })

  it('创建后可添加页面', async () => {
    const doc = await createPdf()
    doc.addPage([100, 200])
    expect(doc.getPageCount()).toBe(1)
  })
})

describe('pdflib.js - loadPdfLib', () => {
  it('加载有效 PDF 成功', async () => {
    const src = await createPdf()
    src.addPage([100, 100])
    const bytes = await src.save()
    const doc = await loadPdfLib(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('加载损坏数据抛出异常', async () => {
    await expect(loadPdfLib(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow()
  })

  it('File 输入被正确解析', async () => {
    const src = await createPdf()
    src.addPage([50, 50])
    const bytes = await src.save()
    const file = new File([bytes], 'a.pdf', { type: 'application/pdf' })
    const doc = await loadPdfLib(file)
    expect(doc.getPageCount()).toBe(1)
  })
})

describe('pdflib.js - hexToRgb', () => {
  it('转换十六进制为 0-1 浮点三元组', () => {
    const color = hexToRgb('#ff5a1f')
    expect(color.red).toBeCloseTo(255 / 255)
    expect(color.green).toBeCloseTo(0x5a / 255)
    expect(color.blue).toBeCloseTo(0x1f / 255)
  })

  it('黑色为全 0', () => {
    const color = hexToRgb('#000000')
    expect(color.red).toBe(0)
    expect(color.green).toBe(0)
    expect(color.blue).toBe(0)
  })

  it('白色为全 1', () => {
    const color = hexToRgb('#ffffff')
    expect(color.red).toBe(1)
    expect(color.green).toBe(1)
    expect(color.blue).toBe(1)
  })
})

describe('pdflib.js - embedCustomFont', () => {
  afterEach(() => vi.restoreAllMocks())

  it('嵌入 ArrayBuffer 字体', async () => {
    const doc = await createPdf()
    const embedFont = vi.spyOn(doc, 'embedFont').mockResolvedValue({ mocked: true })
    const buf = new Uint8Array([1, 2, 3, 4]).buffer
    const result = await embedCustomFont(doc, buf)
    expect(embedFont).toHaveBeenCalledWith(buf, { subset: true })
    expect(result).toEqual({ mocked: true })
  })

  it('嵌入 File 字体时先转 ArrayBuffer', async () => {
    const doc = await createPdf()
    const embedFont = vi.spyOn(doc, 'embedFont').mockResolvedValue({ mocked: true })
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'font.ttf')
    await embedCustomFont(doc, file)
    const arg = embedFont.mock.calls[0][0]
    expect(arg).toBeInstanceOf(ArrayBuffer)
    expect(arg.byteLength).toBe(4)
  })
})

describe('pdflib.js - embedChineseFont', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('从 CDN 拉取字体后嵌入', async () => {
    vi.resetModules()
    const { embedChineseFont: embed } = await import('../../src/utils/pdflib.js')
    const doc = await createPdf()
    const embedFont = vi.spyOn(doc, 'embedFont').mockResolvedValue({ mocked: true })
    const fetchMock = vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }))
    vi.stubGlobal('fetch', fetchMock)

    await embed(doc)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('source-han-sans')
    expect(embedFont).toHaveBeenCalledWith(expect.anything(), { subset: true })
  })

  it('网络失败时抛出异常', async () => {
    vi.resetModules()
    const { embedChineseFont: embed } = await import('../../src/utils/pdflib.js')
    const doc = await createPdf()
    vi.spyOn(doc, 'embedFont').mockResolvedValue({ mocked: true })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    await expect(embed(doc)).rejects.toThrow('network down')
  })

  it('第二次调用命中缓存不再请求网络', async () => {
    vi.resetModules()
    const { embedChineseFont: embed } = await import('../../src/utils/pdflib.js')
    const doc = await createPdf()
    vi.spyOn(doc, 'embedFont').mockResolvedValue({ mocked: true })
    const fetchMock = vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }))
    vi.stubGlobal('fetch', fetchMock)

    await embed(doc)
    await embed(doc)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

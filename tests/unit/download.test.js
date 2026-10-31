import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  downloadBlob,
  downloadUrl,
  replaceExt,
  getBaseName,
  getExt
} from '../../src/utils/download.js'

describe('download.js - downloadBlob', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('创建带 download 属性的 a 标签并触发点击', () => {
    const clickSpy = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    const blob = new Blob(['hello'], { type: 'text/plain' })
    downloadBlob(blob, 'out.txt')

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    const el = clickSpy.mock.instances[0]
    expect(el.download).toBe('out.txt')
    expect(el.href).toContain('blob:mock-url')
  })

  it('延迟 60 秒释放 ObjectURL', () => {
    vi.useFakeTimers()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = vi.fn()
      return el
    })

    downloadBlob(new Blob(['x']), 'x.txt')
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('点击后从 DOM 移除临时 a 标签', () => {
    const origCreate = document.createElement.bind(document)
    let created
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        created = el
        el.click = vi.fn()
      }
      return el
    })

    downloadBlob(new Blob(['x']), 'x.txt')
    expect(document.body.contains(created)).toBe(false)
  })
})

describe('download.js - downloadUrl', () => {
  it('直接用给定 URL 触发下载', () => {
    const clickSpy = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    downloadUrl('https://example.com/a.png', 'a.png')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(clickSpy.mock.instances[0].download).toBe('a.png')
    vi.restoreAllMocks()
  })
})

describe('download.js - replaceExt', () => {
  it('替换已有扩展名', () => {
    expect(replaceExt('test.pdf', '.docx')).toBe('test.docx')
  })

  it('不带点的扩展名自动补点', () => {
    expect(replaceExt('test.pdf', 'docx')).toBe('test.docx')
  })

  it('无扩展名时直接追加', () => {
    expect(replaceExt('test', '.txt')).toBe('test.txt')
  })

  it('保留多点文件名的主体', () => {
    expect(replaceExt('archive.tar.gz', '.zip')).toBe('archive.tar.zip')
  })

  it('保留目录路径', () => {
    expect(replaceExt('dir/sub/file.pdf', '.docx')).toBe('dir/sub/file.docx')
  })
})

describe('download.js - getBaseName', () => {
  it('去掉扩展名', () => {
    expect(getBaseName('report.pdf')).toBe('report')
  })

  it('多点文件名只去最后一段', () => {
    expect(getBaseName('archive.tar.gz')).toBe('archive.tar')
  })

  it('无扩展名原样返回', () => {
    expect(getBaseName('README')).toBe('README')
  })
})

describe('download.js - getExt', () => {
  it('返回小写扩展名', () => {
    expect(getExt('photo.PNG')).toBe('png')
  })

  it('无扩展名返回空字符串', () => {
    expect(getExt('noext')).toBe('')
  })

  it('只取最后一段扩展名', () => {
    expect(getExt('a.b.c.tar.gz')).toBe('gz')
  })

  it('点开头文件返回末段名称', () => {
    expect(getExt('.gitignore')).toBe('gitignore')
  })
})

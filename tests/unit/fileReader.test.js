import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  readFileAsArrayBuffer,
  readFileAsText,
  readFileAsDataURL,
  readFileAsBinaryString,
  toArrayBuffer,
  streamFile
} from '../../src/utils/fileReader.js'

function makeFile(content, name = 'test.txt', type = 'text/plain') {
  return new File([content], name, { type })
}

describe('fileReader.js - readFileAsArrayBuffer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('返回与文件等长的 ArrayBuffer', async () => {
    const buf = await readFileAsArrayBuffer(makeFile('hello world'))
    expect(buf).toBeInstanceOf(ArrayBuffer)
    expect(buf.byteLength).toBe(11)
  })

  it('二进制内容逐字节一致', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250])
    const buf = await readFileAsArrayBuffer(new File([bytes], 'a.bin'))
    expect(new Uint8Array(buf)).toEqual(bytes)
  })

  it('读取失败时 reject', async () => {
    const OrigReader = window.FileReader
    class BrokenReader {
      onload = null
      onerror = null
      readAsArrayBuffer() { setTimeout(() => this.onerror?.(), 0) }
    }
    vi.stubGlobal('FileReader', BrokenReader)
    await expect(readFileAsArrayBuffer(makeFile('x'))).rejects.toThrow('文件读取失败')
    vi.stubGlobal('FileReader', OrigReader)
  })
})

describe('fileReader.js - readFileAsText', () => {
  it('读取 UTF-8 文本', async () => {
    const text = await readFileAsText(makeFile('你好，FileCut'))
    expect(text).toBe('你好，FileCut')
  })

  it('空文件返回空字符串', async () => {
    expect(await readFileAsText(makeFile(''))).toBe('')
  })

  it('指定编码时透传编码参数', async () => {
    const spy = vi.spyOn(window.FileReader.prototype, 'readAsText')
    await readFileAsText(makeFile('abc'), 'utf-16le')
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'utf-16le')
    spy.mockRestore()
  })
})

describe('fileReader.js - readFileAsDataURL', () => {
  it('返回 base64 data URL', async () => {
    const url = await readFileAsDataURL(makeFile('hello', 'a.txt'))
    expect(url.startsWith('data:text/plain;base64,')).toBe(true)
    expect(url).toContain(btoa('hello'))
  })
})

describe('fileReader.js - readFileAsBinaryString', () => {
  it('返回二进制字符串', async () => {
    const str = await readFileAsBinaryString(makeFile('AB', 'a.bin', 'application/octet-stream'))
    expect(typeof str).toBe('string')
    expect(str.length).toBe(2)
  })
})

describe('fileReader.js - toArrayBuffer', () => {
  it('整块 Uint8Array 转换正确', () => {
    const u8 = new Uint8Array([1, 2, 3, 4])
    const buf = toArrayBuffer(u8)
    expect(buf.byteLength).toBe(4)
    expect(new Uint8Array(buf)).toEqual(u8)
  })

  it('带 offset 的 Uint8Array 只取有效区间', () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 9])
    const view = backing.subarray(2, 5)
    const buf = toArrayBuffer(view)
    expect(buf.byteLength).toBe(3)
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('fileReader.js - streamFile', () => {
  it('按指定块大小分片', async () => {
    const data = new Uint8Array(2500)
    const file = new File([data], 'big.bin')
    const chunks = []
    for await (const chunk of streamFile(file, 1024)) chunks.push(chunk)
    expect(chunks.length).toBe(3)
    expect(chunks[0].byteLength).toBe(1024)
    expect(chunks[1].byteLength).toBe(1024)
    expect(chunks[2].byteLength).toBe(452)
  })

  it('总字节数与原文件一致', async () => {
    const data = new Uint8Array(3000).fill(7)
    const file = new File([data], 'big.bin')
    let total = 0
    for await (const chunk of streamFile(file, 700)) total += chunk.byteLength
    expect(total).toBe(3000)
  })

  it('默认块大小 1MB', async () => {
    const data = new Uint8Array(2 * 1024 * 1024 + 10)
    const file = new File([data], 'big.bin')
    const chunks = []
    for await (const chunk of streamFile(file)) chunks.push(chunk)
    expect(chunks.length).toBe(3)
    expect(chunks[0].byteLength).toBe(1024 * 1024)
    expect(chunks[2].byteLength).toBe(10)
  })

  it('空文件不产出任何块', async () => {
    const file = new File([], 'empty.bin')
    const chunks = []
    for await (const chunk of streamFile(file)) chunks.push(chunk)
    expect(chunks.length).toBe(0)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatBytes, formatDate, uid } from '../../src/utils/format.js'

describe('format.js - formatBytes', () => {
  it('0 字节返回 0 B', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('undefined 返回 0 B', () => {
    expect(formatBytes(undefined)).toBe('0 B')
  })

  it('null 返回 0 B', () => {
    expect(formatBytes(null)).toBe('0 B')
  })

  it('小于 1KB 按字节显示', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('1024 字节等于 1 KB', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('1536 字节显示为 1.5 KB', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('1MB 显示为 1 MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })

  it('1GB 显示为 1 GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
  })

  it('1TB 显示为 1 TB', () => {
    expect(formatBytes(1024 ** 4)).toBe('1 TB')
  })

  it('支持自定义小数位', () => {
    expect(formatBytes(1536, 3)).toBe('1.5 KB')
    expect(formatBytes(1234567, 2)).toBe('1.18 MB')
  })
})

describe('format.js - formatDate', () => {
  afterEach(() => vi.useRealTimers())

  it('空值返回空字符串', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate(0)).toBe('')
  })

  it('格式化为 YYYY-MM-DD HH:mm:ss', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 9, 3, 7))
    expect(formatDate(new Date())).toBe('2026-01-05 09:03:07')
  })

  it('月份和日期补零', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 10, 11, 12))
    expect(formatDate(new Date())).toBe('2026-09-09 10:11:12')
  })

  it('接受时间戳', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 13, 45, 30))
    expect(formatDate(Date.now())).toBe('2026-06-15 13:45:30')
  })
})

describe('format.js - uid', () => {
  it('每次生成唯一值', () => {
    const ids = new Set()
    for (let i = 0; i < 1000; i++) ids.add(uid())
    expect(ids.size).toBe(1000)
  })

  it('返回非空字符串', () => {
    expect(typeof uid()).toBe('string')
    expect(uid().length).toBeGreaterThan(0)
  })

  it('以时间戳的36进制开头', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    expect(uid().startsWith((1_700_000_000_000).toString(36))).toBe(true)
    vi.restoreAllMocks()
  })
})

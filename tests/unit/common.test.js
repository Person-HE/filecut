import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  debounce,
  throttle,
  showError,
  showSuccess,
  isMobile,
  isIOSSafari,
  isLockdownMode,
  supportsSharedArrayBuffer,
  supportsOffscreenCanvas,
  supportsFileSystemAccess,
  safeRun
} from '../../src/utils/common.js'

describe('common.js - debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连续快速调用只执行最后一次', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced('a')
    debounced('b')
    debounced('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('默认延迟 200ms', () => {
    const fn = vi.fn()
    debounce(fn)()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('多次间隔调用会重置计时器', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced()
    vi.advanceTimersByTime(80)
    debounced()
    vi.advanceTimersByTime(80)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('common.js - throttle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('间隔内多次调用只执行一次', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled()
    throttled()
    throttled()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('超过间隔后可再次执行', () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 100)
    throttled()
    vi.advanceTimersByTime(100)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('默认间隔 100ms', () => {
    const fn = vi.fn()
    const throttled = throttle(fn)
    throttled()
    vi.advanceTimersByTime(99)
    throttled()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('common.js - showError / showSuccess', () => {
  it('showError 调用 alert 展示提示', () => {
    showError('文件读取失败')
    expect(window.alert).toHaveBeenCalledWith('文件读取失败')
  })

  it('showSuccess 输出到 console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    showSuccess('处理成功')
    expect(spy).toHaveBeenCalledWith('[Success]', '处理成功')
    spy.mockRestore()
  })
})

describe('common.js - 环境检测', () => {
  function setUA(ua) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
  }

  it('isMobile 识别移动端 UA', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(isMobile()).toBe(true)
  })

  it('isMobile 识别桌面端 UA', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(isMobile()).toBe(false)
  })

  it('isIOSSafari 识别 iOS Safari', () => {
    setUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1')
    expect(isIOSSafari()).toBe(true)
  })

  it('isIOSSafari 对 Chrome iOS 返回 false', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0')
    expect(isIOSSafari()).toBe(false)
  })

  it('isLockdownMode 在 WebAssembly 可用时返回 false', () => {
    expect(isLockdownMode()).toBe(false)
  })

  it('supportsSharedArrayBuffer 返回布尔值', () => {
    expect(typeof supportsSharedArrayBuffer()).toBe('boolean')
  })

  it('supportsOffscreenCanvas 返回布尔值', () => {
    expect(typeof supportsOffscreenCanvas()).toBe('boolean')
  })

  it('supportsFileSystemAccess 返回布尔值', () => {
    expect(typeof supportsFileSystemAccess()).toBe('boolean')
  })
})

describe('common.js - safeRun', () => {
  it('正常执行时返回结果', async () => {
    const result = await safeRun(async () => 'ok')
    expect(result).toBe('ok')
  })

  it('异常时返回 null 且不抛出', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await safeRun(async () => { throw new Error('boom') })
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('异常时通过 alert 提示友好信息', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await safeRun(async () => { throw new Error('文件损坏') }, '处理失败')
    expect(window.alert).toHaveBeenCalledWith('处理失败: 文件损坏')
    spy.mockRestore()
  })

  it('异常无 message 时回退为字符串', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await safeRun(async () => { throw 'plain string' })
    expect(window.alert).toHaveBeenCalledWith('处理失败: plain string')
    spy.mockRestore()
  })

  it('使用默认错误提示', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await safeRun(async () => { throw new Error('x') })
    expect(window.alert).toHaveBeenCalledWith('处理失败: x')
    spy.mockRestore()
  })
})

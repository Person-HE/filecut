/**
 * 通用工具函数
 */

/**
 * 防抖
 */
export function debounce(fn, wait = 200) {
  let t
  return function (...args) {
    clearTimeout(t)
    t = setTimeout(() => fn.apply(this, args), wait)
  }
}

/**
 * 节流
 */
export function throttle(fn, wait = 100) {
  let last = 0
  return function (...args) {
    const now = Date.now()
    if (now - last >= wait) {
      last = now
      fn.apply(this, args)
    }
  }
}

/**
 * 友好的错误提示
 */
export function showError(msg) {
  // 用 alert 替代复杂的 toast 系统 - 简单可靠
  alert(msg)
}

/**
 * 友好的成功提示
 */
export function showSuccess(msg) {
  console.log('[Success]', msg)
}

/**
 * 检测是否移动端
 */
export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/**
 * 检测是否 iOS Safari
 */
export function isIOSSafari() {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const webkit = /WebKit/.test(ua)
  return iOS && webkit && !/CriOS|FxiOS/.test(ua)
}

/**
 * 检测 Lockdown Mode
 */
export function isLockdownMode() {
  try {
    // Lockdown Mode 会禁用 WASM
    if (typeof WebAssembly === 'undefined') return true
    return false
  } catch (e) {
    return true
  }
}

/**
 * 检查 SharedArrayBuffer 支持
 */
export function supportsSharedArrayBuffer() {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * 检查 OffscreenCanvas 支持
 */
export function supportsOffscreenCanvas() {
  return typeof OffscreenCanvas !== 'undefined'
}

/**
 * 检查 File System Access API 支持
 */
export function supportsFileSystemAccess() {
  return 'showOpenFilePicker' in window
}

/**
 * 安全执行 - 捕获异常
 */
export async function safeRun(fn, errorMsg = '处理失败') {
  try {
    return await fn()
  } catch (e) {
    console.error(errorMsg, e)
    const detail = e?.message || String(e)
    showError(`${errorMsg}: ${detail}`)
    return null
  }
}

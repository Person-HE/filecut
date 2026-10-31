/**
 * 通用工具函数
 */

/**
 * 防抖 - 连续调用只在停止后执行一次
 * @param {Function} fn - 目标函数
 * @param {number} [wait=200] - 等待毫秒数
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, wait = 200) {
  let t
  return function (...args) {
    clearTimeout(t)
    t = setTimeout(() => fn.apply(this, args), wait)
  }
}

/**
 * 节流 - 固定间隔内最多执行一次
 * @param {Function} fn - 目标函数
 * @param {number} [wait=100] - 间隔毫秒数
 * @returns {Function} 节流后的函数
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
 * @param {string} msg - 提示文案
 */
export function showError(msg) {
  // 用 alert 替代复杂的 toast 系统 - 简单可靠
  alert(msg)
}

/**
 * 友好的成功提示
 * @param {string} msg - 提示文案
 */
export function showSuccess(msg) {
  console.log('[Success]', msg)
}

/**
 * 检测是否移动端
 * @returns {boolean}
 */
export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/**
 * 检测是否 iOS Safari
 * @returns {boolean}
 */
export function isIOSSafari() {
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const webkit = /WebKit/.test(ua)
  return iOS && webkit && !/CriOS|FxiOS/.test(ua)
}

/**
 * 检测 Lockdown Mode
 * @returns {boolean} WASM 不可用时为 true
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
 * @returns {boolean}
 */
export function supportsSharedArrayBuffer() {
  return typeof SharedArrayBuffer !== 'undefined'
}

/**
 * 检查 OffscreenCanvas 支持
 * @returns {boolean}
 */
export function supportsOffscreenCanvas() {
  return typeof OffscreenCanvas !== 'undefined'
}

/**
 * 检查 File System Access API 支持
 * @returns {boolean}
 */
export function supportsFileSystemAccess() {
  return 'showOpenFilePicker' in window
}

/**
 * 安全执行 - 捕获异常并提示用户
 * @template T
 * @param {() => Promise<T>|T} fn - 执行体
 * @param {string} [errorMsg='处理失败'] - 错误提示前缀
 * @returns {Promise<T|null>} 成功返回值，异常时返回 null
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

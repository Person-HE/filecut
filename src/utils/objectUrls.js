/**
 * ObjectURL 生命周期管理
 *
 * 浏览器端工具会为每个处理结果创建 blob: URL。若不显式释放，
 * 用户连续处理多个文件后内存会持续增长（尤其在移动端 Safari）。
 *
 * 方案：全局追踪所有 createObjectURL 生成的地址，
 * 在路由切换或页面卸载时统一 revoke。
 */

const registry = new Set()

let installed = false

/**
 * 安装全局追踪钩子 - 拦截 URL.createObjectURL / revokeObjectURL
 * 应在应用入口调用一次
 */
export function installObjectURLTracker() {
  if (installed || typeof URL === 'undefined' || !URL.createObjectURL) return
  installed = true

  const nativeCreate = URL.createObjectURL.bind(URL)
  const nativeRevoke = URL.revokeObjectURL.bind(URL)

  URL.createObjectURL = (obj) => {
    const url = nativeCreate(obj)
    registry.add(url)
    return url
  }

  URL.revokeObjectURL = (url) => {
    registry.delete(url)
    nativeRevoke(url)
  }
}

/**
 * 释放全部已追踪的 ObjectURL
 */
export function releaseAllObjectURLs() {
  if (typeof URL === 'undefined' || !URL.revokeObjectURL) return
  for (const url of registry) {
    try {
      URL.revokeObjectURL(url)
    } catch (e) {
      // 忽略单个释放失败，不影响其余
    }
  }
  registry.clear()
}

/**
 * 当前已追踪但未释放的 URL 数量 - 用于测试与调试
 */
export function trackedObjectURLCount() {
  return registry.size
}

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import './styles/components.css'
import { installObjectURLTracker, releaseAllObjectURLs } from './utils/objectUrls.js'

// 追踪 blob: URL，路由切换时统一释放，避免大文件处理后内存持续增长
installObjectURLTracker()
router.beforeEach(() => releaseAllObjectURLs())
window.addEventListener('beforeunload', () => releaseAllObjectURLs())

const app = createApp(App)

// 全局错误边界 - 兜底捕获组件内未处理的异常
app.config.errorHandler = (err, instance, info) => {
  console.error('[FileCut] 未捕获错误:', err, info)
}

app.use(router).mount('#app')

// 兜底捕获 Promise 中未处理的 rejection
window.addEventListener('unhandledrejection', (e) => {
  console.error('[FileCut] 未处理的 Promise 拒绝:', e.reason)
})

// 注册 Service Worker（生产环境启用 PWA 离线能力）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[FileCut] Service Worker 注册失败:', err)
    })
  })
}

/**
 * FileCut Service Worker
 * 缓存策略：
 * - 核心资源（HTML/CSS/JS）缓存优先，后台更新（stale-while-revalidate）
 * - WASM / 字体等大资源长期缓存，命中直接返回
 * - 其他请求回退到网络
 */
const CACHE_VERSION = 'filecut-v1'
const CORE_CACHE = `${CACHE_VERSION}-core`
const ASSET_CACHE = `${CACHE_VERSION}-assets`

const CORE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 仅缓存同源请求与已知 CDN
  const sameOrigin = url.origin === self.location.origin
  const isCdn = /cdn\.jsdelivr\.net|unpkg\.com|fonts\.gstatic\.com|fonts\.googleapis\.com/.test(url.origin)
  if (!sameOrigin && !isCdn) return

  // WASM / 大资源（长期缓存）
  if (/\.wasm$/.test(url.pathname) || isCdn) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((resp) => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(req, clone))
          }
          return resp
        }).catch(() => cached)
      })
    )
    return
  }

  // 同源导航 / 静态资源：stale-while-revalidate
  if (sameOrigin && (req.mode === 'navigate' || /\.(?:js|css|svg|woff2?)$/.test(url.pathname))) {
    event.respondWith(
      caches.open(CORE_CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        const networkPromise = fetch(req).then((resp) => {
          if (resp.ok) cache.put(req, resp.clone())
          return resp
        }).catch(() => cached)
        return cached || networkPromise
      })
    )
  }
})

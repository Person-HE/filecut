/**
 * 预渲染脚本
 * - 基于已有 dist 产物，用 Playwright + Edge 渲染每条路由
 * - 将渲染后的完整 HTML（含动态注入的 meta/Schema/内容）写入对应目录的 index.html
 * - 让纯前端 SPA 也能被搜索引擎和 AI 爬虫直接读取独立内容
 */
import { chromium } from 'playwright'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { categories, allTools } from '../src/router/categories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')
const PORT = 3456

const PREFERRED_BROWSER = process.env.PRERENDER_EXECUTABLE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

// 首选路径不存在时回落到 Playwright 自带的 Chromium，使脚本可在任意机器与 CI 上运行
const BROWSER_EXECUTABLE = fs.existsSync(PREFERRED_BROWSER) ? PREFERRED_BROWSER : undefined

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon'
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname
    let filePath = path.join(DIST_DIR, decodeURIComponent(urlPath))

    if (!path.extname(filePath)) {
      const indexPath = path.join(filePath, 'index.html')
      filePath = fs.existsSync(indexPath) ? indexPath : path.join(DIST_DIR, 'index.html')
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html')
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    })
    fs.createReadStream(filePath).pipe(res)
  })

  return new Promise(resolve => server.listen(PORT, () => resolve(server)))
}

function getRoutes() {
  const routes = ['/']

  // 分类页
  categories.forEach(cat => routes.push(`/category/${cat.id}`))

  // 工具页
  allTools.forEach(tool => routes.push(tool.path))

  // 静态内容页
  routes.push('/about')
  routes.push('/guide/pdf-to-word')
  routes.push('/guide/best-free-pdf-tools')
  routes.push('/guide/image-compress-privacy')
  routes.push('/guide/student-file-workflow')

  return routes
}

async function prerender() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist 目录不存在，请先执行 npm run build')
  }

  const server = await startServer()
  const browser = await chromium.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  const context = await browser.newContext()
  const routes = getRoutes()
  console.log(`[prerender] 共 ${routes.length} 条路由`)

  for (const route of routes) {
    const page = await context.newPage()
    try {
      await page.goto(`http://127.0.0.1:${PORT}${route}`, {
        waitUntil: 'networkidle',
        timeout: 90000
      })

      // 等待 Vue Router 完成首次渲染并注入 meta/Schema
      await page.waitForFunction(
        () => window.__PRERENDER_READY__ === true,
        { timeout: 30000 }
      )

      // 额外等待动态内容（FAQ、Schema 等）稳定
      await page.waitForTimeout(800)

      const html = await page.content()

      // 生成 .html 文件，再通过 _redirects 200 rewrite 隐藏 .html 后缀，
      // 避免 Cloudflare Pages 对目录 index.html 的默认 308 重定向
      if (route === '/') {
        fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf-8')
      } else {
        const filePath = path.join(DIST_DIR, `${route}.html`)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, html, 'utf-8')
      }

      const title = await page.title()
      console.log(`✓ ${route}  →  ${title}`)
    } catch (err) {
      console.error(`✗ ${route}: ${err.message}`)
    } finally {
      await page.close()
    }
  }

  await context.close()
  await browser.close()
  server.close()

  // 生成 _redirects：仅保留 SPA fallback。
  // Cloudflare Pages 默认启用 Pretty URLs，/foo.html 会自动以 /foo 访问，
  // 若再显式写 200 rewrite 会与 Pretty URLs 形成 308 自循环，因此不再为每条路由单独配置。
  const redirectLines = [
    '# Cloudflare Pages SPA fallback',
    '# 预渲染页面通过 Pretty URLs 自动以无后缀地址访问；未命中静态文件时回退到 index.html',
    '/*    /index.html   200'
  ]
  fs.writeFileSync(path.join(DIST_DIR, '_redirects'), redirectLines.join('\n') + '\n', 'utf-8')
  console.log('[prerender] _redirects 已生成')
  console.log('[prerender] 完成')
}

prerender().catch(err => {
  console.error(err)
  process.exit(1)
})

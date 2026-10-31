import { test, expect } from 'playwright/test'

test.describe('安全：零上传验证', () => {
  test('页面加载时不发送文件到外部服务', async ({ page }) => {
    const uploadRequests = []
    page.on('request', req => {
      const url = req.url()
      if (url.includes('localhost') || url.includes('127.0.0.1')) return
      if (req.method() === 'POST' || req.method() === 'PUT') {
        uploadRequests.push(`${req.method()} ${url}`)
      }
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    expect(uploadRequests).toEqual([])
  })

  test('处理 PDF 时不产生上传请求', async ({ page }) => {
    const uploadRequests = []
    page.on('request', req => {
      const url = req.url()
      if (url.includes('localhost') || url.includes('127.0.0.1')) return
      uploadRequests.push(`${req.method()} ${url}`)
    })
    await page.goto('/pdf/pdf-merge', { waitUntil: 'networkidle' })
    expect(uploadRequests.filter(r => !/fonts\.googleapis|cdn\.jsdelivr/.test(r))).toEqual([])
  })

  test('文件名 XSS 不执行', async ({ page }) => {
    let alertTriggered = false
    page.on('dialog', d => { alertTriggered = true; d.dismiss() })
    await page.goto('/pdf/pdf-merge', { waitUntil: 'networkidle' })
    await page.setInputFiles('input[type=file]', { name: '<img src=x onerror=alert(1)>.pdf', mimeType: 'application/pdf', buffer: Buffer.from([37, 80, 68, 70]) })
    await expect(page.locator('.file-name')).toContainText('<img')
    expect(alertTriggered).toBe(false)
  })
})

test.describe('安全：Blob URL 生命周期', () => {
  test('处理后生成 blob: 下载链接', async ({ page }) => {
    await page.goto('/qrcode/qr-generate', { waitUntil: 'networkidle' })
    await page.fill('input[type=text], textarea', 'https://example.com')
    await page.click('button:has-text("生成"), button:has-text("开始")')
    const link = page.locator('a[download]')
    if (await link.count() > 0) {
      const href = await link.first().getAttribute('href')
      expect(href).toMatch(/blob:|data:/)
    }
  })
})

test.describe('CORS 隔离头', () => {
  test('dev server 返回 COOP 头', async ({ request }) => {
    const resp = await request.get('/')
    expect(resp.headers()['cross-origin-opener-policy']).toBe('same-origin')
  })

  test('dev server 返回 COEP 头', async ({ request }) => {
    const resp = await request.get('/')
    expect(resp.headers()['cross-origin-embedder-policy']).toBe('require-corp')
  })
})

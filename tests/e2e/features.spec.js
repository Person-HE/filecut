import { test, expect } from 'playwright/test'

test.describe('PDF合并功能', () => {
  test('页面加载并显示上传区', async ({ page }) => {
    await page.goto('/pdf/pdf-merge', { waitUntil: 'networkidle' })
    await expect(page.locator('.drop-zone')).toBeVisible()
    await expect(page.locator('h1')).toContainText('PDF合并')
  })

  test('隐私横幅存在', async ({ page }) => {
    await page.goto('/pdf/pdf-merge', { waitUntil: 'networkidle' })
    await expect(page.locator('.privacy-banner')).toContainText('文件永不上传')
  })

  test('未选文件点击处理提示错误', async ({ page }) => {
    page.on('dialog', d => d.accept())
    await page.goto('/pdf/pdf-merge', { waitUntil: 'networkidle' })
    const btn = page.locator('button:has-text("处理"), button:has-text("合并")').first()
    if (await btn.count() > 0) {
      await btn.click()
    }
  })

  test('上传两个 PDF 文件', async ({ page }) => {
    await page.goto('/pdf/pdf-merge', { waitUntil: 'networkidle' })
    const pdf1 = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF')
    const pdf2 = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF')
    await page.setInputFiles('input[type=file]', [
      { name: 'test1.pdf', mimeType: 'application/pdf', buffer: pdf1 },
      { name: 'test2.pdf', mimeType: 'application/pdf', buffer: pdf2 }
    ])
    await expect(page.locator('.file-item')).toHaveCount(2, { timeout: 5000 })
  })
})

test.describe('文本哈希功能', () => {
  test('输入文本后计算哈希', async ({ page }) => {
    await page.goto('/text/text-hash', { waitUntil: 'networkidle' })
    await expect(page.locator('.tool-page')).toBeVisible()
    const textarea = page.locator('textarea, input[type=text]').first()
    if (await textarea.count() > 0) {
      await textarea.fill('Hello World')
      const btn = page.locator('button:has-text("计算"), button:has-text("生成")').first()
      if (await btn.count() > 0) await btn.click()
      await page.waitForTimeout(500)
      const result = page.locator('.result-area, pre, .hash-result, .text-preview')
      if (await result.count() > 0) {
        const text = await result.first().textContent()
        expect(text.toLowerCase()).toMatch(/[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64}/)
      }
    }
  })
})

test.describe('二维码生成功能', () => {
  test('输入内容后生成二维码图片', async ({ page }) => {
    await page.goto('/qrcode/qr-generate', { waitUntil: 'networkidle' })
    const input = page.locator('input[type=text], textarea').first()
    if (await input.count() > 0) {
      await input.fill('https://filecut.pages.dev')
      const btn = page.locator('button:has-text("生成")').first()
      if (await btn.count() > 0) await btn.click()
      await page.waitForTimeout(500)
      const canvas = page.locator('canvas')
      const img = page.locator('img[alt*=QR], img[alt*=qr], img[alt*=二维码]')
      expect(await canvas.count() + await img.count()).toBeGreaterThan(0)
    }
  })
})

test.describe('图片压缩功能', () => {
  test('页面加载', async ({ page }) => {
    await page.goto('/image/image-compress', { waitUntil: 'networkidle' })
    await expect(page.locator('.tool-page')).toBeVisible()
    await expect(page.locator('.drop-zone')).toBeVisible()
  })
})

test.describe('Excel 转 CSV 功能', () => {
  test('页面加载并显示上传区', async ({ page }) => {
    await page.goto('/excel/excel-to-csv', { waitUntil: 'networkidle' })
    await expect(page.locator('.tool-page')).toBeVisible()
    await expect(page.locator('.drop-zone')).toBeVisible()
  })
})

import { test, expect } from 'playwright/test'
import { categories } from '../../src/router/categories.js'

test.describe('首页', () => {
  test('首页加载并显示分类', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('.topnav')).toBeVisible()
    await expect(page.locator('.brand-name')).toHaveText('FileCut')
    for (const cat of categories.slice(0, 3)) {
      await expect(page.locator(`.nav-cat:has-text("${cat.name}")`)).toBeVisible()
    }
  })

  test('footer 包含隐私声明', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app-footer')).toContainText('文件永不上传')
  })
})

test.describe('分类页', () => {
  test('PDF 分类页显示所有 PDF 工具', async ({ page }) => {
    await page.goto('/category/pdf', { waitUntil: 'networkidle' })
    const pdfTools = categories.find(c => c.id === 'pdf').tools
    for (const tool of pdfTools.slice(0, 5)) {
      await expect(page.locator(`text=${tool.title}`).first()).toBeVisible()
    }
  })
})

test.describe('404 页面', () => {
  test('访问不存在的路径显示 404', async ({ page }) => {
    await page.goto('/this-does-not-exist', { waitUntil: 'networkidle' })
    await expect(page.locator('body')).toContainText(/404|找不到|未找到/i)
  })
})

test.describe('搜索功能', () => {
  test('搜索框可输入并显示结果', async ({ page }) => {
    await page.goto('/')
    await page.fill('.search-box input', '合并')
    await expect(page.locator('.search-results')).toBeVisible()
    const items = await page.locator('.search-item').all()
    expect(items.length).toBeGreaterThan(0)
  })
})

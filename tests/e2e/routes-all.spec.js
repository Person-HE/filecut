import { test, expect } from 'playwright/test'
import { allTools } from '../../src/router/categories.js'

test.describe.configure({ mode: 'parallel' })

test.describe('路由全量回归 - 112 个工具', () => {
  for (const tool of allTools) {
    test(`${tool.id} 页面可加载`, async ({ page }) => {
      const consoleErrors = []
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await page.goto(tool.path, { waitUntil: 'networkidle', timeout: 30000 })

      expect(page.locator('.tool-page')).toBeVisible({ timeout: 10000 })

      const realErrors = consoleErrors.filter(e =>
        !/workerSrc|Failed to load resource|net::ERR|favicon|cmap/i.test(e)
      )
      expect(realErrors, `控制台错误: ${realErrors.join('\n')}`).toEqual([])
    })
  }
})

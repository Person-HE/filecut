import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
})

const context = await browser.newContext()
const page = await context.newPage()

page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()))
page.on('pageerror', err => console.log('PAGEERROR:', err.message))
page.on('requestfailed', req => console.log('REQFAIL:', req.url(), req.failure()?.errorText))

try {
  await page.goto('http://127.0.0.1:3456/', { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForFunction(() => window.__PRERENDER_READY__ === true, { timeout: 30000 })
  console.log('TITLE:', await page.title())
} catch (err) {
  console.error('ERR:', err.message)
}

await browser.close()

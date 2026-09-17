import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  ignoreHTTPSErrors: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-cache',
    '--disable-features=site-per-process',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ]
})

const page = await browser.newPage()
page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()))
page.on('pageerror', err => console.log('PAGEERROR:', err.message))
page.on('requestfailed', req => console.log('REQFAIL:', req.url(), req.failure()?.errorText))

try {
  await page.goto('http://127.0.0.1:3456/', { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => window.__PRERENDER_READY__ === true, { timeout: 30000 })
  console.log('TITLE:', await page.title())
} catch (err) {
  console.error('ERR:', err.message)
}

await browser.close()

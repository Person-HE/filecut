import { categories, allTools } from '../src/router/categories.js'
import fs from 'fs'
import path from 'path'

const ORIGIN = 'https://filecut.pages.dev'
const PUBLIC_DIR = path.resolve(process.cwd(), 'public')

const pages = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/about', priority: '0.8', changefreq: 'monthly' },
  { loc: '/guide/pdf-to-word', priority: '0.9', changefreq: 'monthly' },
  { loc: '/guide/best-free-pdf-tools', priority: '0.9', changefreq: 'monthly' },
  { loc: '/guide/image-compress-privacy', priority: '0.9', changefreq: 'monthly' },
  { loc: '/guide/student-file-workflow', priority: '0.9', changefreq: 'monthly' },
]

// 分类页
categories.forEach(cat => {
  pages.push({ loc: `/category/${cat.id}`, priority: '0.8', changefreq: 'weekly' })
})

// 工具页
allTools.forEach(tool => {
  pages.push({ loc: tool.path, priority: '0.7', changefreq: 'monthly' })
})

const today = new Date().toISOString().split('T')[0]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${ORIGIN}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`

fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap, 'utf-8')
console.log(`✅ sitemap.xml generated with ${pages.length} URLs`)

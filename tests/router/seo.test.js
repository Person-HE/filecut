import { describe, it, expect, beforeAll } from 'vitest'
import router from '../../src/router/index.js'
import { allTools, categories } from '../../src/router/categories.js'

function metaContent(selector) {
  const el = document.querySelector(selector)
  return el ? el.getAttribute('content') : null
}

beforeAll(async () => {
  await router.push('/')
  await router.isReady()
})

describe('路由表结构', () => {
  it('包含首页路由', () => {
    const home = router.getRoutes().find(r => r.path === '/')
    expect(home).toBeDefined()
    expect(home.meta.title).toContain('FileCut')
  })

  it('包含分类页路由', () => {
    const cat = router.getRoutes().find(r => r.path === '/category/:id')
    expect(cat).toBeDefined()
  })

  it('包含关于页与指南页路由', () => {
    const paths = router.getRoutes().map(r => r.path)
    expect(paths).toContain('/about')
    expect(paths).toContain('/guide/pdf-to-word')
    expect(paths).toContain('/guide/best-free-pdf-tools')
    expect(paths).toContain('/guide/image-compress-privacy')
    expect(paths).toContain('/guide/student-file-workflow')
  })

  it('包含 404 兜底路由', () => {
    const notFound = router.getRoutes().find(r => r.name === 'notfound')
    expect(notFound).toBeDefined()
  })

  it('为每个工具生成独立路由', () => {
    const paths = router.getRoutes().map(r => r.path)
    for (const tool of allTools) {
      expect(paths, `缺少路由 ${tool.path}`).toContain(tool.path)
    }
  })

  it('工具路由 name 与工具 id 一致', () => {
    for (const tool of allTools) {
      const route = router.getRoutes().find(r => r.path === tool.path)
      expect(route.name).toBe(tool.id)
    }
  })
})

describe('路由 meta - SEO 字段完整性', () => {
  it('每个工具路由都有 title/desc/keywords/category', () => {
    for (const tool of allTools) {
      const route = router.getRoutes().find(r => r.path === tool.path)
      expect(route.meta.title, `工具 ${tool.id} 缺少 title`).toContain(tool.title)
      expect(route.meta.desc, `工具 ${tool.id} 缺少 desc`).toBeTruthy()
      expect(route.meta.keywords, `工具 ${tool.id} 缺少 keywords`).toContain(tool.keywords)
      expect(route.meta.category, `工具 ${tool.id} 缺少 category`).toBe(tool.categoryId)
      expect(route.meta.categoryName).toBeTruthy()
      expect(route.meta.image).toMatch(/^https:\/\//)
    }
  })

  it('标题包含站点品牌名', () => {
    for (const tool of allTools) {
      const route = router.getRoutes().find(r => r.path === tool.path)
      expect(route.meta.title).toContain('FileCut')
    }
  })

  it('描述强调本地处理不上传', () => {
    for (const tool of allTools) {
      const route = router.getRoutes().find(r => r.path === tool.path)
      expect(route.meta.desc).toContain('浏览器本地处理')
    }
  })
})

describe('路由导航 - 动态 SEO 注入', () => {
  it('首页设置 document.title', async () => {
    await router.push('/')
    expect(document.title).toContain('FileCut')
  })

  it('导航到工具页注入 description', async () => {
    await router.push('/pdf/pdf-merge')
    expect(document.title).toContain('PDF合并')
    expect(metaContent('meta[name="description"]')).toContain('浏览器本地处理')
  })

  it('注入 keywords meta', async () => {
    await router.push('/pdf/pdf-merge')
    expect(metaContent('meta[name="keywords"]')).toContain('pdf合并')
  })

  it('注入 Open Graph 标签', async () => {
    await router.push('/pdf/pdf-merge')
    expect(metaContent('meta[property="og:title"]')).toContain('PDF合并')
    expect(metaContent('meta[property="og:description"]')).toBeTruthy()
    expect(metaContent('meta[property="og:type"]')).toBe('website')
    expect(metaContent('meta[property="og:site_name"]')).toBe('FileCut')
    expect(metaContent('meta[property="og:url"]')).toContain('/pdf/pdf-merge')
  })

  it('注入 Twitter Card 标签', async () => {
    await router.push('/pdf/pdf-merge')
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary_large_image')
    expect(metaContent('meta[name="twitter:title"]')).toContain('PDF合并')
  })

  it('注入 canonical 链接', async () => {
    await router.push('/pdf/pdf-merge')
    const link = document.querySelector('link[rel="canonical"]')
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toContain('/pdf/pdf-merge')
  })

  it('切换路由后 meta 覆盖旧值而非重复堆积', async () => {
    await router.push('/pdf/pdf-merge')
    await router.push('/excel/excel-to-csv')
    expect(metaContent('meta[property="og:title"]')).toContain('Excel转CSV')
    expect(metaContent('meta[property="og:title"]')).not.toContain('PDF合并')
    expect(document.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
  })

  it('设置预渲染就绪标记', async () => {
    await router.push('/')
    expect(window.__PRERENDER_READY__).toBe(true)
  })
})

describe('路由 - 分类工具数量一致性', () => {
  it('路由数量与分类工具数量匹配', () => {
    const toolRoutes = router.getRoutes().filter(r => r.meta?.category)
    expect(toolRoutes.length).toBe(allTools.length)
  })

  it('每个分类都有对应的分类页可访问', () => {
    for (const cat of categories) {
      expect(cat.tools.length).toBeGreaterThan(0)
      const resolved = router.resolve(`/category/${cat.id}`)
      expect(resolved.name).toBe('category')
      expect(resolved.matched.length).toBeGreaterThan(0)
      expect(resolved.params.id).toBe(cat.id)
    }
  })
})

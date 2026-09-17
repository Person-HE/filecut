import { createRouter, createWebHistory } from 'vue-router'
import { categories } from './categories.js'

// 站点基础信息（用于 SEO/GEO）
const SITE_ORIGIN = 'https://filecut.pages.dev'
const SITE_BRAND = 'FileCut'
const SITE_DESC = 'FileCut 是纯前端文档工具站，112 个工具全部在浏览器本地运行，文件永不上传、无次数限制、无需注册。'

// 首页
const Home = () => import('../views/Home.vue')
const CategoryPage = () => import('../views/CategoryPage.vue')
const NotFound = () => import('../views/NotFound.vue')

// 动态生成所有工具路由 - 基于categories配置
const toolRoutes = categories.flatMap(cat => {
  return cat.tools.map(tool => ({
    path: tool.path,
    name: tool.id,
    component: () => import(`../views/${cat.id}/${tool.id}.vue`).catch(() => import('../views/PlaceholderTool.vue')),
    meta: {
      title: `${tool.title} - 免费在线${tool.title}工具 · FileCut`,
      desc: `${tool.desc}。100% 浏览器本地处理，文件不上传，无大小/次数限制，免费使用。`,
      keywords: `${tool.keywords},${tool.title},在线${tool.title},免费`,
      category: cat.id,
      categoryName: cat.name,
      icon: tool.icon,
      image: `${SITE_ORIGIN}/og-default.png`
    }
  }))
})

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
    meta: {
      title: 'FileCut · 纯前端文档工具站 · 112 个免费在线文件工具',
      desc: 'FileCut 提供 112 个免费在线文件工具：PDF/Word/Excel/PPT/图片/音视频/二维码/字体等。所有处理在浏览器本地完成，文件永不上传、无限制、零依赖。',
      keywords: '在线文件工具,PDF转换,Word转PDF,Excel转PDF,图片压缩,免费工具,文件处理',
      image: `${SITE_ORIGIN}/og-hero.png`
    }
  },
  {
    path: '/category/:id',
    name: 'category',
    component: CategoryPage,
    meta: { title: '分类', desc: SITE_DESC }
  },
  ...toolRoutes,
  {
    path: '/about',
    name: 'about',
    component: () => import('../views/About.vue'),
    meta: {
      title: '关于 FileCut · 纯前端本地文件处理工具',
      desc: 'FileCut 坚持文件永不上传，所有处理在浏览器本地完成。了解我们的隐私承诺、技术原理与使用场景。',
      keywords: 'FileCut,隐私保护,本地处理,文件安全,无服务器'
    }
  },
  {
    path: '/guide/pdf-to-word',
    name: 'guide-pdf-to-word',
    component: () => import('../views/guides/PdfToWord.vue'),
    meta: {
      title: 'PDF 转 Word 完全指南：免费、可编辑、保留排版的 5 种方法',
      desc: '2026 年最新 PDF 转 Word 方法对比：在线工具、Office、Adobe、AI 工具与 FileCut 本地方案，含步骤、优缺点与常见问题。',
      keywords: 'PDF转Word,PDF转可编辑Word,免费PDF转Word,PDF转Word保留排版'
    }
  },
  {
    path: '/guide/best-free-pdf-tools',
    name: 'guide-best-free-pdf-tools',
    component: () => import('../views/guides/BestFreePdfTools.vue'),
    meta: {
      title: '2026 年 10 款免费 PDF 工具实测对比：学生与办公族选型指南',
      desc: '基于真实文件测试 10 款免费 PDF 工具（迅捷、万兴、Smallpdf、iLovePDF、FileCut 等），从转换质量、隐私、速度、限制维度给出选型建议。',
      keywords: '免费PDF工具,PDF工具对比,PDF转换器推荐,学生PDF工具,办公PDF工具'
    }
  },
  {
    path: '/guide/image-compress-privacy',
    name: 'guide-image-compress-privacy',
    component: () => import('../views/guides/ImageCompressPrivacy.vue'),
    meta: {
      title: '图片压缩隐私指南：为什么你的证件照/合同不该上传在线工具',
      desc: '在线图片压缩工具如何处理你的文件？上传风险有哪些？教你用浏览器本地工具压缩图片，保护身份证、合同、发票隐私。',
      keywords: '图片压缩隐私,在线图片压缩安全,本地图片压缩,证件照压缩,合同图片处理'
    }
  },
  {
    path: '/guide/student-file-workflow',
    name: 'guide-student-file-workflow',
    component: () => import('../views/guides/StudentFileWorkflow.vue'),
    meta: {
      title: '学生党文件处理工作流：论文/课件/资料一键转换与整理',
      desc: '针对学生与教师的文件处理工作流：PDF 转 Word 改论文、PPT 转图片做课件、图片压缩交作业、批量重命名整理资料，全部本地完成。',
      keywords: '学生文件处理,论文PDF转Word,课件PPT转图片,图片压缩,资料整理工具'
    }
  },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: NotFound, meta: { title: '页面未找到' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0, behavior: 'smooth' } }
})

// 动态注入 SEO/GEO 元信息
function setMeta(name, content) {
  if (!content) return
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setPropertyMeta(property, content) {
  if (!content) return
  let el = document.querySelector(`meta[property="${property}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLinkRel(rel, href) {
  if (!href) return
  let el = document.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

router.afterEach((to) => {
  const title = to.meta?.title || SITE_BRAND
  const desc = to.meta?.desc || SITE_DESC
  const keywords = to.meta?.keywords || ''
  const image = to.meta?.image || `${SITE_ORIGIN}/og-default.png`
  const canonical = `${SITE_ORIGIN}${to.path}`

  document.title = title
  setMeta('description', desc)
  if (keywords) setMeta('keywords', keywords)

  // Open Graph
  setPropertyMeta('og:title', title)
  setPropertyMeta('og:description', desc)
  setPropertyMeta('og:url', canonical)
  setPropertyMeta('og:type', 'website')
  setPropertyMeta('og:image', image)
  setPropertyMeta('og:site_name', SITE_BRAND)

  // Twitter Card
  setMeta('twitter:card', 'summary_large_image')
  setMeta('twitter:title', title)
  setMeta('twitter:description', desc)
  setMeta('twitter:image', image)

  // Canonical
  setLinkRel('canonical', canonical)

  // 标记路由渲染完成，供预渲染脚本捕获
  if (typeof window !== 'undefined') {
    window.__PRERENDER_READY__ = true
  }
})

export default router

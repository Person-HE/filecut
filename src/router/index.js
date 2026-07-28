import { createRouter, createWebHashHistory } from 'vue-router'
import { categories } from './categories.js'

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
    meta: { title: tool.title, category: cat.id, categoryName: cat.name, desc: tool.desc, icon: tool.icon }
  }))
})

const routes = [
  { path: '/', name: 'home', component: Home, meta: { title: 'FileCut · 纯前端文档工具站' } },
  { path: '/category/:id', name: 'category', component: CategoryPage, meta: { title: '分类' } },
  ...toolRoutes,
  { path: '/:pathMatch(.*)*', name: 'notfound', component: NotFound, meta: { title: '页面未找到' } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() { return { top: 0, behavior: 'smooth' } }
})

router.afterEach((to) => {
  const title = to.meta?.title
  if (title) document.title = `${title} · FileCut`
})

export default router

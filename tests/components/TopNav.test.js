import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TopNav from '../../src/components/TopNav.vue'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({ push: routerPush })
}))

beforeEach(() => {
  routerPush.mockClear()
})

describe('TopNav.vue', () => {
  it('渲染品牌 Logo 与名称', () => {
    const wrapper = mount(TopNav)
    expect(wrapper.find('.brand-mark').text()).toBe('FC')
    expect(wrapper.find('.brand-name').text()).toBe('FileCut')
  })

  it('渲染隐私标语', () => {
    const wrapper = mount(TopNav)
    expect(wrapper.find('.brand-tag').text()).toContain('本地')
    expect(wrapper.find('.brand-tag').text()).toContain('零上传')
  })

  it('渲染全部分类导航', () => {
    const wrapper = mount(TopNav)
    const cats = wrapper.findAll('.nav-cat')
    expect(cats.length).toBeGreaterThan(10)
  })

  it('搜索框存在且可输入', () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    expect(input.exists()).toBe(true)
  })

  it('输入关键词显示搜索结果', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('合并')
    await input.trigger('input')
    expect(wrapper.find('.search-results').exists()).toBe(true)
    const items = wrapper.findAll('.search-item')
    expect(items.length).toBeGreaterThan(0)
  })

  it('按标题匹配搜索结果', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('PDF合并')
    await input.trigger('input')
    const titles = wrapper.findAll('.search-item-title').map(el => el.text())
    expect(titles).toContain('PDF合并')
  })

  it('按关键词匹配搜索结果', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('ocr')
    await input.trigger('input')
    expect(wrapper.findAll('.search-item').length).toBeGreaterThan(0)
  })

  it('搜索大小写不敏感', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('PDF')
    await input.trigger('input')
    expect(wrapper.findAll('.search-item').length).toBeGreaterThan(0)
  })

  it('无匹配结果时不显示结果面板', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('zzzzznotexist')
    await input.trigger('input')
    expect(wrapper.find('.search-results').exists()).toBe(false)
  })

  it('搜索结果最多显示 8 条', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('pdf')
    await input.trigger('input')
    const items = wrapper.findAll('.search-item')
    expect(items.length).toBeLessThanOrEqual(8)
  })

  it('清空搜索后结果消失', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('pdf')
    await input.trigger('input')
    expect(wrapper.find('.search-results').exists()).toBe(true)
    await input.setValue('')
    await input.trigger('input')
    expect(wrapper.find('.search-results').exists()).toBe(false)
  })

  it('移动端菜单按钮存在', () => {
    const wrapper = mount(TopNav)
    expect(wrapper.find('.mobile-toggle').exists()).toBe(true)
  })

  it('点击移动端按钮切换菜单', async () => {
    const wrapper = mount(TopNav)
    const btn = wrapper.find('.mobile-toggle')
    expect(wrapper.find('.nav-cats').classes()).not.toContain('open')
    await btn.trigger('click')
    expect(wrapper.find('.nav-cats').classes()).toContain('open')
    await btn.trigger('click')
    expect(wrapper.find('.nav-cats').classes()).not.toContain('open')
  })

  it('点击分类链接调用 router.push', async () => {
    const wrapper = mount(TopNav)
    await wrapper.findAll('.nav-cat')[0].trigger('click')
    expect(routerPush).toHaveBeenCalled()
    expect(routerPush.mock.calls[0][0]).toMatch(/^\/category\//)
  })

  it('点击搜索结果跳转到对应工具并清空搜索', async () => {
    const wrapper = mount(TopNav)
    const input = wrapper.find('.search-box input')
    await input.setValue('PDF合并')
    await input.trigger('input')
    await wrapper.findAll('.search-item')[0].trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/pdf/pdf-merge')
    expect(wrapper.find('.search-results').exists()).toBe(false)
  })
})

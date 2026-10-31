import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolLayout from '../../src/components/ToolLayout.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    meta: { category: 'pdf', categoryName: 'PDF工具' }
  })
}))

describe('ToolLayout.vue', () => {
  it('渲染隐私横幅', () => {
    const wrapper = mount(ToolLayout, { props: { title: '测试', desc: '描述' } })
    expect(wrapper.find('.privacy-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('文件永不上传')
  })

  it('显示标题与描述', () => {
    const wrapper = mount(ToolLayout, { props: { title: 'PDF合并', desc: '多个文件合并' } })
    expect(wrapper.find('h1').text()).toBe('PDF合并')
    expect(wrapper.find('.desc').text()).toBe('多个文件合并')
  })

  it('显示图标', () => {
    const wrapper = mount(ToolLayout, { props: { title: '测试', icon: '📕' } })
    expect(wrapper.find('.title-icon').text()).toBe('📕')
  })

  it('无图标时不渲染图标元素', () => {
    const wrapper = mount(ToolLayout, { props: { title: '测试' } })
    expect(wrapper.find('.title-icon').exists()).toBe(false)
  })

  it('无描述时不渲染 desc', () => {
    const wrapper = mount(ToolLayout, { props: { title: '测试' } })
    expect(wrapper.find('.desc').exists()).toBe(false)
  })

  it('渲染面包屑导航', () => {
    const wrapper = mount(ToolLayout, { props: { title: '测试', desc: '' } })
    const bc = wrapper.find('.breadcrumb').text()
    expect(bc).toContain('首页')
    expect(bc).toContain('PDF工具')
    expect(bc).toContain('测试')
  })

  it('内容区接受默认 slot', () => {
    const wrapper = mount(ToolLayout, {
      props: { title: '测试', desc: '' },
      slots: { default: '<div class="my-content">slot content</div>' }
    })
    expect(wrapper.find('.tool-content').text()).toContain('slot content')
  })
})

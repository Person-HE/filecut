import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ResultViewer from '../../src/components/ResultViewer.vue'

function makeResultFile(name, size = 1024) {
  return {
    name,
    blob: new Blob([new Uint8Array(size)]),
    url: 'blob:mock',
    size,
    type: ''
  }
}

describe('ResultViewer.vue - 空状态', () => {
  it('所有 props 为空时不渲染内容', () => {
    const wrapper = mount(ResultViewer)
    expect(wrapper.find('.result-area').exists()).toBe(false)
  })
})

describe('ResultViewer.vue - 文件模式', () => {
  it('单文件显示大下载按钮', () => {
    const wrapper = mount(ResultViewer, {
      props: { files: [makeResultFile('output.pdf', 2048)] }
    })
    expect(wrapper.find('.single-download').exists()).toBe(true)
    expect(wrapper.find('.single-download a').text()).toContain('output.pdf')
    expect(wrapper.find('.single-download a').text()).toContain('2 KB')
  })

  it('多文件显示列表', () => {
    const wrapper = mount(ResultViewer, {
      props: { files: [makeResultFile('a.pdf'), makeResultFile('b.pdf')] }
    })
    expect(wrapper.find('.download-list').exists()).toBe(true)
    expect(wrapper.findAll('.download-item')).toHaveLength(2)
  })

  it('单文件且 imageUrls 不为空时不显示 single-download', () => {
    const wrapper = mount(ResultViewer, {
      props: {
        files: [makeResultFile('img.png')],
        imageUrls: ['http://example.com/preview.png']
      }
    })
    expect(wrapper.find('.single-download').exists()).toBe(false)
    expect(wrapper.find('.image-previews').exists()).toBe(true)
  })

  it('文件有 size 时显示大小', () => {
    const wrapper = mount(ResultViewer, {
      props: { files: [makeResultFile('test.pdf', 5120)] }
    })
    expect(wrapper.find('.single-download a').text()).toContain('5 KB')
  })
})

describe('ResultViewer.vue - 图片模式', () => {
  it('渲染图片预览网格', () => {
    const wrapper = mount(ResultViewer, {
      props: { imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'] }
    })
    expect(wrapper.find('.image-previews').exists()).toBe(true)
    expect(wrapper.findAll('.image-preview')).toHaveLength(2)
  })

  it('每个预览图带 alt 属性', () => {
    const wrapper = mount(ResultViewer, {
      props: { imageUrls: ['https://example.com/a.png'] }
    })
    const img = wrapper.find('.image-preview img')
    expect(img.attributes('alt')).toBe('预览1')
  })
})

describe('ResultViewer.vue - 文本模式', () => {
  it('短文本完整显示', () => {
    const wrapper = mount(ResultViewer, { props: { text: 'Hello World' } })
    expect(wrapper.find('.text-preview pre').text()).toBe('Hello World')
  })

  it('超长文本截断并提示', () => {
    const longText = 'A'.repeat(6000)
    const wrapper = mount(ResultViewer, { props: { text: longText } })
    const text = wrapper.find('.text-preview pre').text()
    expect(text.length).toBeLessThan(5500)
    expect(text).toContain('仅显示前5000字符')
  })

  it('正好 5000 字符不截断', () => {
    const text = 'B'.repeat(5000)
    const wrapper = mount(ResultViewer, { props: { text } })
    const rendered = wrapper.find('.text-preview pre').text()
    expect(rendered).toBe(text)
    expect(rendered).not.toContain('仅显示')
  })
})

describe('ResultViewer.vue - 自定义模式', () => {
  it('custom=true 时渲染 slot 内容', () => {
    const wrapper = mount(ResultViewer, {
      props: { custom: true },
      slots: { default: '<div class="my-content">custom content</div>' }
    })
    expect(wrapper.find('.my-content').text()).toBe('custom content')
  })
})

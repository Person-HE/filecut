import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileList from '../../src/components/FileList.vue'

function makeFile(name, size = 1024) {
  return new File([new Uint8Array(size)], name, { type: '' })
}

describe('FileList.vue', () => {
  it('空数组不渲染任何文件项', () => {
    const wrapper = mount(FileList, { props: { files: [] } })
    expect(wrapper.findAll('.file-item')).toHaveLength(0)
  })

  it('单文件显示文件名和大小', () => {
    const wrapper = mount(FileList, { props: { files: [makeFile('test.pdf', 2048)] } })
    const items = wrapper.findAll('.file-item')
    expect(items).toHaveLength(1)
    expect(items[0].find('.file-name').text()).toBe('test.pdf')
    expect(items[0].find('.file-size').text()).toBe('2 KB')
  })

  it('多文件全部显示', () => {
    const wrapper = mount(FileList, {
      props: { files: [makeFile('a.pdf', 1024), makeFile('b.pdf', 2048)] }
    })
    expect(wrapper.findAll('.file-item')).toHaveLength(2)
  })

  it('点击移除按钮触发 remove 事件且索引正确', async () => {
    const wrapper = mount(FileList, {
      props: { files: [makeFile('first.pdf'), makeFile('second.pdf')] }
    })
    await wrapper.findAll('.file-remove')[1].trigger('click')
    const emitted = wrapper.emitted('remove')
    expect(emitted[0][0]).toBe(1)
  })

  it('showSize=false 时不显示文件大小', () => {
    const wrapper = mount(FileList, {
      props: { files: [makeFile('a.pdf', 4096)], showSize: false }
    })
    expect(wrapper.find('.file-size').exists()).toBe(false)
    expect(wrapper.find('.file-name').exists()).toBe(true)
  })

  it('不同文件扩展名显示不同图标', () => {
    const files = [makeFile('doc.docx'), makeFile('img.png'), makeFile('data.xlsx'), makeFile('pres.pptx')]
    const wrapper = mount(FileList, { props: { files } })
    const icons = wrapper.findAll('.file-icon').map(el => el.text())
    expect(icons).toContain('📘')
    expect(icons).toContain('🖼')
    expect(icons).toContain('📗')
    expect(icons).toContain('📙')
  })

  it('未知类型显示默认图标', () => {
    const wrapper = mount(FileList, { props: { files: [makeFile('mystery.dat')] } })
    expect(wrapper.find('.file-icon').text()).toBe('📄')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileDrop from '../../src/components/FileDrop.vue'

function makeFile(name, { type = '', size = 100 } = {}) {
  const file = new File([new Uint8Array(size)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

async function selectFiles(wrapper, files) {
  const input = wrapper.find('input[type=file]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
}

async function dropFiles(wrapper, files) {
  await wrapper.find('.drop-zone').trigger('drop', { dataTransfer: { files } })
}

describe('FileDrop.vue - 渲染', () => {
  it('渲染拖拽区与提示文案', () => {
    const wrapper = mount(FileDrop)
    expect(wrapper.find('.drop-zone').exists()).toBe(true)
    expect(wrapper.text()).toContain('点击选择')
    expect(wrapper.text()).toContain('拖拽文件到此处')
  })

  it('默认不显示 hint', () => {
    const wrapper = mount(FileDrop)
    expect(wrapper.find('.drop-zone-hint').exists()).toBe(false)
  })

  it('传入 hint 时显示提示', () => {
    const wrapper = mount(FileDrop, { props: { hint: '支持 PDF，最大 50MB' } })
    expect(wrapper.find('.drop-zone-hint').text()).toBe('支持 PDF，最大 50MB')
  })

  it('渲染自定义图标', () => {
    const wrapper = mount(FileDrop, { props: { icon: '📕' } })
    expect(wrapper.find('.drop-zone-icon').text()).toBe('📕')
  })

  it('accept 为 * 时 input 的 accept 为空', () => {
    const wrapper = mount(FileDrop)
    expect(wrapper.find('input[type=file]').attributes('accept')).toBe('')
  })

  it('accept 不为 * 时透传给 input', () => {
    const wrapper = mount(FileDrop, { props: { accept: '.pdf,application/pdf' } })
    expect(wrapper.find('input[type=file]').attributes('accept')).toBe('.pdf,application/pdf')
  })

  it('multiple 默认开启', () => {
    const wrapper = mount(FileDrop)
    expect(wrapper.find('input[type=file]').attributes('multiple')).toBeDefined()
  })
})

describe('FileDrop.vue - 选择文件', () => {
  it('选择单个文件触发 select 事件（数组）', async () => {
    const wrapper = mount(FileDrop)
    await selectFiles(wrapper, [makeFile('a.pdf')])
    const emitted = wrapper.emitted('select')
    expect(emitted).toBeTruthy()
    expect(emitted[0][0]).toHaveLength(1)
    expect(emitted[0][0][0].name).toBe('a.pdf')
  })

  it('multiple=false 时 select 事件携带单个文件对象', async () => {
    const wrapper = mount(FileDrop, { props: { multiple: false } })
    await selectFiles(wrapper, [makeFile('a.pdf')])
    const payload = wrapper.emitted('select')[0][0]
    expect(Array.isArray(payload)).toBe(false)
    expect(payload.name).toBe('a.pdf')
  })

  it('multiple=false 时选择多个文件触发 error', async () => {
    const wrapper = mount(FileDrop, { props: { multiple: false } })
    await selectFiles(wrapper, [makeFile('a.pdf'), makeFile('b.pdf')])
    expect(wrapper.emitted('error')[0][0]).toBe('只能选择一个文件')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('空文件列表不触发任何事件', async () => {
    const wrapper = mount(FileDrop)
    await selectFiles(wrapper, [])
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('error')).toBeUndefined()
  })

  it('拖拽文件触发 select 事件', async () => {
    const wrapper = mount(FileDrop)
    await dropFiles(wrapper, [makeFile('drop.txt')])
    expect(wrapper.emitted('select')[0][0][0].name).toBe('drop.txt')
  })

  it('拖拽时添加 dragover 样式类', async () => {
    const wrapper = mount(FileDrop)
    await wrapper.find('.drop-zone').trigger('dragover')
    expect(wrapper.find('.drop-zone').classes()).toContain('dragover')
    await wrapper.find('.drop-zone').trigger('dragleave')
    expect(wrapper.find('.drop-zone').classes()).not.toContain('dragover')
  })
})

describe('FileDrop.vue - 类型校验', () => {
  it('接受扩展名匹配的文件', async () => {
    const wrapper = mount(FileDrop, { props: { accept: '.pdf' } })
    await selectFiles(wrapper, [makeFile('doc.pdf')])
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('error')).toBeUndefined()
  })

  it('拒绝扩展名不匹配的文件', async () => {
    const wrapper = mount(FileDrop, { props: { accept: '.pdf' } })
    await selectFiles(wrapper, [makeFile('doc.txt')])
    expect(wrapper.emitted('error')[0][0]).toContain('doc.txt')
    expect(wrapper.emitted('error')[0][0]).toContain('类型不被支持')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('接受完整 MIME 类型匹配', async () => {
    const wrapper = mount(FileDrop, { props: { accept: 'application/pdf' } })
    await selectFiles(wrapper, [makeFile('a.pdf', { type: 'application/pdf' })])
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('接受通配 MIME 类型 image/*', async () => {
    const wrapper = mount(FileDrop, { props: { accept: 'image/*' } })
    await selectFiles(wrapper, [makeFile('a.png', { type: 'image/png' })])
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('通配 MIME 类型拒绝其他类型', async () => {
    const wrapper = mount(FileDrop, { props: { accept: 'image/*' } })
    await selectFiles(wrapper, [makeFile('a.pdf', { type: 'application/pdf' })])
    expect(wrapper.emitted('error')).toBeTruthy()
  })

  it('accept 为 * 时接受任意文件', async () => {
    const wrapper = mount(FileDrop, { props: { accept: '*' } })
    await selectFiles(wrapper, [makeFile('any.xyz')])
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('error')).toBeUndefined()
  })

  it('混合文件时只 emit 合法的文件', async () => {
    const wrapper = mount(FileDrop, { props: { accept: '.pdf' } })
    await selectFiles(wrapper, [makeFile('good.pdf'), makeFile('bad.txt')])
    expect(wrapper.emitted('error')).toBeTruthy()
    expect(wrapper.emitted('select')[0][0]).toHaveLength(1)
    expect(wrapper.emitted('select')[0][0][0].name).toBe('good.pdf')
  })

  it('扩展名匹配大小写不敏感', async () => {
    const wrapper = mount(FileDrop, { props: { accept: '.pdf' } })
    await selectFiles(wrapper, [makeFile('UPPER.PDF')])
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})

describe('FileDrop.vue - 大小校验', () => {
  it('超过 maxSize 时触发 error', async () => {
    const wrapper = mount(FileDrop, { props: { maxSize: 1024 } })
    await selectFiles(wrapper, [makeFile('big.pdf', { size: 2048 })])
    expect(wrapper.emitted('error')[0][0]).toContain('超过最大限制')
    expect(wrapper.emitted('error')[0][0]).toContain('big.pdf')
  })

  it('未超过 maxSize 时正常选中', async () => {
    const wrapper = mount(FileDrop, { props: { maxSize: 1024 } })
    await selectFiles(wrapper, [makeFile('small.pdf', { size: 512 })])
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('error')).toBeUndefined()
  })

  it('maxSize 为 0 时不限制大小', async () => {
    const wrapper = mount(FileDrop, { props: { maxSize: 0 } })
    await selectFiles(wrapper, [makeFile('huge.pdf', { size: 100 * 1024 * 1024 })])
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('error')).toBeUndefined()
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useSchemaOrg } from '../../src/composables/useSchemaOrg.js'

function mountWith(schema, id) {
  const Comp = defineComponent({
    setup() {
      useSchemaOrg(schema, id)
      return () => null
    }
  })
  return mount(Comp, { attachTo: document.body })
}

afterEach(() => {
  document.querySelectorAll('script[type="application/ld+json"]').forEach(el => el.remove())
})

describe('useSchemaOrg', () => {
  it('挂载时注入 JSON-LD script 标签', () => {
    const schema = { '@context': 'https://schema.org', '@type': 'FAQPage' }
    mountWith(schema, 'test-faq')
    const el = document.getElementById('test-faq')
    expect(el).not.toBeNull()
    expect(el.tagName).toBe('SCRIPT')
    expect(el.type).toBe('application/ld+json')
    expect(JSON.parse(el.textContent)).toEqual(schema)
  })

  it('注入到 document.head', () => {
    mountWith({ '@type': 'Article' }, 'test-article')
    expect(document.head.contains(document.getElementById('test-article'))).toBe(true)
  })

  it('已存在同 id 元素时复用而不重复创建', () => {
    mountWith({ '@type': 'HowTo' }, 'test-reuse')
    const first = document.getElementById('test-reuse')
    mountWith({ '@type': 'WebPage' }, 'test-reuse')
    const second = document.getElementById('test-reuse')
    expect(second).toBe(first)
    expect(document.querySelectorAll('#test-reuse').length).toBe(1)
    expect(JSON.parse(second.textContent)['@type']).toBe('WebPage')
  })

  it('卸载时移除元素', () => {
    const wrapper = mountWith({ '@type': 'Article' }, 'test-unmount')
    expect(document.getElementById('test-unmount')).not.toBeNull()
    wrapper.unmount()
    expect(document.getElementById('test-unmount')).toBeNull()
  })

  it('未传 id 时自动生成唯一 id', () => {
    const wrapper = mountWith({ '@type': 'Article' })
    const el = document.querySelector('script[type="application/ld+json"]')
    expect(el).not.toBeNull()
    expect(el.id).toMatch(/^schema-/)
    wrapper.unmount()
  })

  it('schema 内容被正确序列化', () => {
    const schema = { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q1' }] }
    mountWith(schema, 'test-serialize')
    const el = document.getElementById('test-serialize')
    expect(el.textContent).toBe(JSON.stringify(schema))
  })
})

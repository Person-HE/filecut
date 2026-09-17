import { onMounted, onUnmounted } from 'vue'

/**
 * 注入 JSON-LD Schema 到 document.head
 * 用于 SEO/GEO 的结构化数据（FAQPage、Article、HowTo 等）
 * @param {object} schema - 符合 Schema.org 的 JSON 对象
 * @param {string} id - 唯一标识，用于卸载时移除
 */
export function useSchemaOrg(schema, id = 'schema-' + Math.random().toString(36).slice(2, 9)) {
  onMounted(() => {
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('script')
      el.id = id
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
  })

  onUnmounted(() => {
    const el = document.getElementById(id)
    if (el) el.remove()
  })
}

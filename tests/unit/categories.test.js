import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { categories, allTools, findTool, findToolByPath } from '../../src/router/categories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIEWS_DIR = path.resolve(__dirname, '../../src/views')

describe('categories.js - 数据结构完整性', () => {
  it('分类 id 唯一', () => {
    const ids = categories.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个分类有名称、图标、描述', () => {
    for (const cat of categories) {
      expect(cat.id).toBeTruthy()
      expect(cat.name).toBeTruthy()
      expect(cat.icon).toBeTruthy()
      expect(cat.desc).toBeTruthy()
      expect(Array.isArray(cat.tools)).toBe(true)
      expect(cat.tools.length).toBeGreaterThan(0)
    }
  })

  it('工具 id 全局唯一', () => {
    const ids = allTools.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('工具 path 全局唯一', () => {
    const paths = allTools.map(t => t.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('每个工具都有完整元信息', () => {
    for (const t of allTools) {
      expect(t.id, `工具 ${t.id} 缺少 id`).toBeTruthy()
      expect(t.title, `工具 ${t.id} 缺少 title`).toBeTruthy()
      expect(t.path, `工具 ${t.id} 缺少 path`).toBeTruthy()
      expect(t.keywords, `工具 ${t.id} 缺少 keywords`).toBeTruthy()
      expect(t.desc, `工具 ${t.id} 缺少 desc`).toBeTruthy()
      expect(t.icon, `工具 ${t.id} 缺少 icon`).toBeTruthy()
      expect(Array.isArray(t.inputs), `工具 ${t.id} 的 inputs 必须是数组`).toBe(true)
    }
  })

  it('工具 path 与所在分类一致', () => {
    for (const t of allTools) {
      expect(t.path, `工具 ${t.id} 路径应属于分类 ${t.categoryId}`).toBe(`/${t.categoryId}/${t.id}`)
    }
  })

  it('allTools 数量与分类内工具总数一致', () => {
    const total = categories.reduce((sum, c) => sum + c.tools.length, 0)
    expect(allTools.length).toBe(total)
  })

  it('allTools 携带分类信息', () => {
    for (const t of allTools) {
      expect(t.categoryId).toBeTruthy()
      expect(t.categoryName).toBeTruthy()
    }
  })
})

describe('categories.js - 工具页面文件存在性', () => {
  it('每个工具都有对应的 .vue 文件', () => {
    const missing = []
    for (const t of allTools) {
      const file = path.join(VIEWS_DIR, t.categoryId, `${t.id}.vue`)
      if (!fs.existsSync(file)) missing.push(t.id)
    }
    expect(missing, `缺少视图文件: ${missing.join(', ')}`).toEqual([])
  })
})

describe('categories.js - findTool', () => {
  it('按 id 查找存在的工具', () => {
    const tool = findTool('pdf-merge')
    expect(tool).toBeDefined()
    expect(tool.title).toBe('PDF合并')
    expect(tool.categoryId).toBe('pdf')
  })

  it('查找不存在的工具返回 undefined', () => {
    expect(findTool('not-exist-tool')).toBeUndefined()
  })

  it('对全部工具都能查到', () => {
    for (const t of allTools) {
      expect(findTool(t.id)?.path).toBe(t.path)
    }
  })
})

describe('categories.js - findToolByPath', () => {
  it('按 path 查找存在的工具', () => {
    const tool = findToolByPath('/pdf/pdf-merge')
    expect(tool).toBeDefined()
    expect(tool.id).toBe('pdf-merge')
  })

  it('查找不存在的 path 返回 undefined', () => {
    expect(findToolByPath('/pdf/not-exist')).toBeUndefined()
  })

  it('对全部工具路径都能查到', () => {
    for (const t of allTools) {
      expect(findToolByPath(t.path)?.id).toBe(t.id)
    }
  })
})

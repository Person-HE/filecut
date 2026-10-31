import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf-8'))
}

describe('package.json', () => {
  const pkg = readJson('package.json')

  it('声明 type 为 module', () => {
    expect(pkg.type).toBe('module')
  })

  it('提供 dev/build/preview 脚本', () => {
    expect(pkg.scripts.dev).toBeTruthy()
    expect(pkg.scripts.build).toBeTruthy()
    expect(pkg.scripts.preview).toBeTruthy()
  })

  it('提供测试脚本', () => {
    expect(pkg.scripts.test).toBeTruthy()
    expect(pkg.scripts['test:unit']).toBeTruthy()
    expect(pkg.scripts['test:components']).toBeTruthy()
    expect(pkg.scripts['test:e2e']).toBeTruthy()
  })

  it('开发依赖包含测试框架', () => {
    expect(pkg.devDependencies.vitest).toBeTruthy()
    expect(pkg.devDependencies['@vue/test-utils']).toBeTruthy()
    expect(pkg.devDependencies.jsdom).toBeTruthy()
    expect(pkg.devDependencies.playwright).toBeTruthy()
  })

  it('核心依赖版本已锁定在主版本范围内', () => {
    expect(pkg.dependencies.vue).toMatch(/^\^3\./)
    expect(pkg.dependencies['vue-router']).toMatch(/^\^4\./)
    expect(pkg.devDependencies.vite).toMatch(/^\^5\./)
  })
})

describe('pnpm-workspace.yaml', () => {
  it('存在且配置了 allowBuilds', () => {
    const content = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf-8')
    expect(content).toMatch(/allowBuilds:/)
  })

  it('allowBuilds 的值均为布尔值（无占位符）', () => {
    const content = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf-8')
    expect(content).not.toMatch(/set this to true or false/)
  })

  it('esbuild 构建被允许', () => {
    const content = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf-8')
    expect(content).toMatch(/esbuild:\s*true/)
  })
})

describe('测试目录结构', () => {
  it('存在关键测试目录', () => {
    for (const dir of ['tests/unit', 'tests/components', 'tests/composables', 'tests/router', 'tests/config', 'tests/e2e']) {
      expect(fs.existsSync(path.join(ROOT, dir)), `缺少目录 ${dir}`).toBe(true)
    }
  })

  it('测试配置文件存在', () => {
    expect(fs.existsSync(path.join(ROOT, 'vitest.config.js'))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'playwright.config.js'))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'tests/setup.js'))).toBe(true)
  })
})

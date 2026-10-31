import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VITE_CONFIG_PATH = path.resolve(__dirname, '../../vite.config.js')
const configSrc = fs.readFileSync(VITE_CONFIG_PATH, 'utf-8')

describe('vite.config.js - COOP/COEP 隔离头', () => {
  it('server 配置 Cross-Origin-Opener-Policy', () => {
    expect(configSrc).toMatch(/'Cross-Origin-Opener-Policy':\s*'same-origin'/)
  })

  it('server 配置 Cross-Origin-Embedder-Policy', () => {
    expect(configSrc).toMatch(/'Cross-Origin-Embedder-Policy':\s*'require-corp'/)
  })

  it('server 配置 Cross-Origin-Resource-Policy', () => {
    expect(configSrc).toMatch(/'Cross-Origin-Resource-Policy':\s*'cross-origin'/)
  })

  it('preview 配置同样的隔离头', () => {
    const previewSection = configSrc.slice(configSrc.indexOf('preview:'))
    expect(previewSection).toMatch(/'Cross-Origin-Opener-Policy':\s*'same-origin'/)
    expect(previewSection).toMatch(/'Cross-Origin-Embedder-Policy':\s*'require-corp'/)
  })
})

describe('vite.config.js - 构建配置', () => {
  it('base 为根路径', () => {
    expect(configSrc).toMatch(/base:\s*'\/'/)
  })

  it('输出目录为 dist', () => {
    expect(configSrc).toMatch(/outDir:\s*'dist'/)
  })

  it('构建目标为 es2020', () => {
    expect(configSrc).toMatch(/target:\s*'es2020'/)
  })

  it('配置 wasm 插件', () => {
    expect(configSrc).toMatch(/wasm\(\)/)
  })

  it('配置 vue 插件', () => {
    expect(configSrc).toMatch(/vue\(\)/)
  })
})

describe('vite.config.js - 大型库分包', () => {
  const chunks = ['pdfjs', 'pdflib', 'sheetjs', 'docx', 'image', 'wasm']

  for (const chunk of chunks) {
    it(`定义了 ${chunk} 分包`, () => {
      expect(configSrc).toMatch(new RegExp(`'${chunk}':\\s*\\[`))
    })
  }
})

describe('vite.config.js - 依赖预打包', () => {
  it('排除需要运行时处理的依赖', () => {
    const excludeSection = configSrc.slice(configSrc.indexOf('exclude:'), configSrc.indexOf('include:'))
    for (const dep of ['@imgly/background-removal', 'pdfjs-dist', 'tesseract.js']) {
      expect(excludeSection, `应排除 ${dep}`).toContain(dep)
    }
  })

  it('包含关键运行时依赖', () => {
    const includeSection = configSrc.slice(configSrc.indexOf('include:'))
    for (const dep of ['pdf-lib', 'xlsx', 'jszip', 'hash-wasm']) {
      expect(includeSection, `应包含 ${dep}`).toContain(dep)
    }
  })
})

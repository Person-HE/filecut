import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSS_PATH = path.resolve(__dirname, '../../src/styles/main.css')
const cssContent = fs.readFileSync(CSS_PATH, 'utf-8')
// 剥离注释后再做颜色检查，避免注释中提到的禁用色被误判
const cssWithoutComments = cssContent.replace(/\/\*[\s\S]*?\*\//g, '')

describe('设计规范验证 - main.css', () => {
  describe('禁止紫色（反AI味）', () => {
    it('不含 #6366f1 系列', () => {
      expect(cssWithoutComments.toLowerCase()).not.toContain('#6366f1')
    })

    it('不含 indigo 关键字', () => {
      expect(cssWithoutComments.toLowerCase()).not.toMatch(/indigo/)
    })

    it('不含 purple 关键字', () => {
      expect(cssWithoutComments.toLowerCase()).not.toMatch(/purple/)
    })

    it('不含 violet 关键字', () => {
      expect(cssWithoutComments.toLowerCase()).not.toMatch(/violet/)
    })
  })

  describe('圆角规范', () => {
    it('设计令牌 --r 为 0', () => {
      expect(cssContent).toMatch(/--r:\s*0px/)
    })

    it('--r-sm 为 0', () => {
      expect(cssContent).toMatch(/--r-sm:\s*0px/)
    })
  })

  describe('硬偏移阴影', () => {
    it('阴影格式为 Npx Npx 0（无 blur）', () => {
      expect(cssContent).toMatch(/--shadow-sm:\s*3px\s+3px\s+0/)
      expect(cssContent).toMatch(/--shadow-md:\s*5px\s+5px\s+0/)
      expect(cssContent).toMatch(/--shadow-lg:\s*8px\s+8px\s+0/)
    })
  })

  describe('纸质背景色', () => {
    it('paper-bg 为暖米黄', () => {
      expect(cssContent).toMatch(/--paper-bg:\s*#f4ecd8/i)
    })
  })

  describe('字体栈', () => {
    it('标题字体含 Caveat', () => {
      expect(cssContent).toMatch(/--font-display:.*Caveat/)
    })

    it('等宽字体含 IBM Plex Mono', () => {
      expect(cssContent).toMatch(/--font-mono:[^;]*IBM Plex Mono/)
    })
  })

  describe('强调色', () => {
    it('主强调色为橙红', () => {
      expect(cssContent).toMatch(/--accent:\s*#ff5a1f/i)
    })

    it('副强调色为荧光黄绿', () => {
      expect(cssContent).toMatch(/--neon:\s*#c4ff00/i)
    })
  })
})

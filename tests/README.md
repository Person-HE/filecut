# 测试说明

FileCut 的自动化测试分为三层：**单元测试**、**组件测试**、**E2E 测试**，覆盖工具库、共享组件、路由 SEO 注入、设计规范、安全约束与 112 个工具页面的加载回归。

---

## 目录结构

```
tests/
├── setup.js                    # vitest 全局环境（mock alert、Blob polyfill）
├── unit/                       # 单元测试 — 纯函数与数据层
│   ├── common.test.js          # debounce/throttle/safeRun/环境检测
│   ├── format.test.js          # formatBytes/formatDate/uid
│   ├── fileReader.test.js      # readFile*/toArrayBuffer/streamFile
│   ├── download.test.js        # downloadBlob/replaceExt/getBaseName/getExt
│   ├── pdfjs.test.js           # loadPdf/renderPage/extractText/isEncrypted（mock pdfjs-dist）
│   ├── pdflib.test.js          # createPdf/loadPdfLib/hexToRgb/embedFont
│   └── categories.test.js      # allTools/findTool/findToolByPath/视图文件存在性
├── composables/
│   └── useSchemaOrg.test.js    # JSON-LD 注入/复用/卸载
├── components/                 # 组件测试 — Vue Test Utils
│   ├── FileDrop.test.js        # 渲染/选择/拖拽/类型校验/大小校验
│   ├── FileList.test.js        # 列表渲染/删除/图标/showSize
│   ├── ResultViewer.test.js    # 文件/图片/文本/自定义模式
│   ├── ToolLayout.test.js      # 隐私横幅/标题/面包屑/slot
│   └── TopNav.test.js          # 品牌/分类导航/搜索/移动端菜单/路由跳转
├── router/
│   └── seo.test.js             # 路由表/meta 完整性/OG/Twitter/canonical/预渲染标记
├── config/                     # 配置与规范验证
│   ├── design-tokens.test.js   # 禁紫色/圆角/硬阴影/字体栈/强调色
│   ├── vite-config.test.js     # COOP/COEP 头/分包/预打包
│   └── project-config.test.js  # package.json/pnpm-workspace/测试目录结构
└── e2e/                        # Playwright 端到端测试
    ├── navigation.spec.js      # 首页/分类页/404/搜索
    ├── security.spec.js        # 零上传/XSS/CORS 头/Blob 生命周期
    ├── features.spec.js        # PDF合并/文本哈希/二维码/图片压缩/Excel转CSV
    └── routes-all.spec.js      # 112 个工具路由全量回归
```

---

## 运行测试

### 前置条件

```bash
pnpm install
```

### 命令速查

| 命令 | 说明 | 框架 |
|------|------|------|
| `pnpm test` | 运行全部 vitest 测试（单元 + 组件 + 路由 + 配置） | Vitest |
| `pnpm test:unit` | 仅单元测试与 composables | Vitest |
| `pnpm test:components` | 仅组件测试 | Vitest |
| `pnpm test:router` | 仅路由 SEO 测试 | Vitest |
| `pnpm test:coverage` | 运行测试并生成覆盖率报告 | Vitest + v8 |
| `pnpm test:e2e` | 运行 Playwright E2E 测试 | Playwright |

### 单元/组件测试

```bash
pnpm test                 # 全部 241 个用例，约 30 秒
pnpm test:unit            # 仅 124 个单元用例
pnpm test:coverage        # 生成 coverage/ 目录，含 HTML/LCOV/text 报告
```

覆盖率报告输出到 `coverage/` 目录，打开 `coverage/index.html` 查看详情。

### E2E 测试

```bash
pnpm test:e2e                                    # 全部 E2E
pnpm exec playwright test tests/e2e/navigation   # 仅导航测试
pnpm exec playwright test -g "PDF合并"            # 按名称筛选
pnpm exec playwright test --reporter=line        # 紧凑输出
```

E2E 测试需要浏览器：

- **本机已装 Edge**（默认配置）：`playwright.config.js` 中 `channel: 'msedge'`，直接使用本机 Edge。
- **CI 环境**：运行 `pnpm exec playwright install chromium` 安装 Playwright 自带 Chromium。

`playwright.config.js` 的 `webServer` 会自动启动 `pnpm run dev`（端口 5173），本机已有 dev server 时复用。

---

## 测试分层说明

### 第一层：单元测试（`tests/unit/`）

测试 `src/utils/` 下的纯函数与数据层。所有依赖浏览器的 API（`FileReader`、`Blob`、`URL`）由 jsdom 环境提供；jsdom 缺失的 `Blob.prototype.arrayBuffer` 在 `tests/setup.js` 中补齐。

涉及第三方库的函数（`pdfjs.js`、`pdflib.js`）使用 `vi.mock` 替换库实现，只测自身逻辑：

```js
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args) => getDocumentMock(...args)
}))
```

### 第二层：组件测试（`tests/components/`）

使用 `@vue/test-utils` 挂载 Vue 组件，验证 props、事件、插槽、渲染逻辑。依赖 `vue-router` 的组件（`ToolLayout`、`TopNav`）通过 `vi.mock('vue-router')` 替换 `useRoute`/`useRouter`。

```js
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({ push: routerPush })
}))
```

### 第三层：E2E 测试（`tests/e2e/`）

使用 Playwright 驱动真实浏览器，验证页面加载、交互流程、安全约束。`routes-all.spec.js` 遍历 `categories.js` 中全部 112 个工具路由，断言每个页面能加载且无控制台错误。

---

## 编写新测试

### 新增单元测试

在 `tests/unit/` 下创建 `xxx.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { myFunction } from '../../src/utils/myModule.js'

describe('myModule - myFunction', () => {
  it('正常输入返回预期结果', () => {
    expect(myFunction('input')).toBe('expected')
  })

  it('空输入返回默认值', () => {
    expect(myFunction('')).toBe('')
  })
})
```

### 新增组件测试

在 `tests/components/` 下创建 `Xxx.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from '../../src/components/MyComponent.vue'

describe('MyComponent.vue', () => {
  it('渲染 props', () => {
    const wrapper = mount(MyComponent, { props: { title: '测试' } })
    expect(wrapper.text()).toContain('测试')
  })

  it('点击触发事件', async () => {
    const wrapper = mount(MyComponent)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })
})
```

### 新增 E2E 测试

在 `tests/e2e/` 下创建 `xxx.spec.js`：

```js
import { test, expect } from 'playwright/test'

test.describe('功能名称', () => {
  test('页面加载', async ({ page }) => {
    await page.goto('/category/tool-id', { waitUntil: 'networkidle' })
    await expect(page.locator('.tool-page')).toBeVisible()
  })
})
```

### 编写规范

1. **测试文件命名**：`被测文件名.test.js`（单元/组件）或 `功能名.spec.js`（E2E）
2. **describe 命名**：`模块名 - 函数名` 或 `组件名.vue`
3. **it 命名**：用中文描述具体行为，避免"测试正常""测试异常"等模糊表述
4. **断言**：每个 `it` 至少一个 `expect`，断言要具体到值或状态
5. **隔离性**：每个测试独立，`beforeEach` 清理 mock；涉及模块级缓存的用 `vi.resetModules()` 隔离
6. **不添加注释**：测试代码自身即为文档，命名清晰即可

---

## 覆盖率

当前覆盖率（`pnpm test:coverage`）：

| 指标 | 值 |
|------|------|
| 行覆盖 | 99.23% |
| 分支覆盖 | 93.25% |
| 函数覆盖 | 90.62% |

覆盖率统计范围（`vitest.config.js` → `coverage.include`）：

- `src/utils/**`
- `src/composables/**`
- `src/components/**`
- `src/router/categories.js`

---

## 已知限制

- **E2E 浏览器**：本机默认使用 Edge（`channel: 'msedge'`）；CI 需 `playwright install chromium`，网络受限环境下可能超时。
- **`networkidle` 等待**：部分页面加载 CDN 资源（Google Fonts、jsDelivr cmaps），网络受限时 `networkidle` 可能不触发，导致超时。可改用 `domcontentloaded`。
- **WASM 工具**：依赖 `@imgly/background-removal`、`tesseract.js` 的工具在 E2E 中仅验证页面加载，不验证完整处理流程（WASM 初始化耗时大）。
- **覆盖率未覆盖视图层**：`src/views/**/*.vue`（112 个工具页面）不在覆盖率统计范围内，其加载正确性由 E2E `routes-all.spec.js` 保证。

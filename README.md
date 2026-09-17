# FileCut

> **纯前端文档工具站 · 112 个工具 · 文件永不上传**

所有处理在浏览器本地完成（WebAssembly + Web Worker）。无后端、无账号、无次数限制。

**在线地址**：https://filecut.pages.dev

---

## 一句话定位

面向学生与办公族的隐私优先文件工具箱：PDF / Word / Excel / PPT / 图片 / 音视频 / 字体 / 二维码等 13 类 112 个工具，打开网页即用，文件不出本机。

## 核心能力

| 类别 | 工具数 | 代表能力 |
|------|--------|----------|
| PDF | 24 | 合并、拆分、压缩、转 Word/Excel/PPT/图片、水印、加密、OCR、脱敏 |
| Word | 10 | 预览、转 PDF/HTML/TXT、模板填充、编辑、对比、隐私清理 |
| Excel | 12 | 预览、转 PDF/CSV/JSON、筛选排序、公式校验、图表、合并 |
| PPT | 7 | 预览、转 PDF/图片/Markdown、模板填充、媒体提取 |
| 图片 | 15 | 格式转换、压缩、裁剪、水印、抠图、EXIF、OCR、GIF、SVG |
| 文本编码 | 10 | 编码转换/检测、JSON/YAML/XML/Markdown 互转、Diff、加密、哈希 |
| 压缩文件 | 4 | ZIP 压缩/解压/预览/包内编辑 |
| 电子书 | 3 | EPUB 阅读、转 PDF/TXT |
| 音视频 | 6 | 转码、压缩、剪辑、GIF、抽音频 |
| 二维码 | 4 | 生成/识别/条形码/批量 |
| 字体 | 3 | 转换、预览、子集化 |
| 文件通用 | 6 | 哈希、类型识别、压缩、重命名、内容搜索、时间戳 |
| 特殊场景 | 8 | 解密助手、损坏修复、兼容检测、大文件分块、批量中心、中文字体嵌入、隐私扫描、转换向导 |

## 隐私承诺

1. **零上传**：文件仅进入浏览器内存 / IndexedDB 临时区，不发往任何业务服务器。
2. **可验证**：DevTools Network 面板中，选择文件后应看不到对应文件体的上行请求。
3. **COOP/COEP**：通过 `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` 启用 SharedArrayBuffer，支撑多线程 WASM。

## 技术栈

- Vue 3 + Vite 5 + Vue Router 4
- 纯静态 SPA，无 Node 运行时依赖
- 处理引擎：pdf-lib / pdfjs / sheetjs / mammoth / pptxgenjs / ffmpeg.wasm / tesseract.js / onnxruntime（抠图）等
- 构建时预渲染全部路由（SEO / 首屏 HTML）
- 部署：Cloudflare Pages（`public/_redirects` SPA fallback + 长缓存头）

## 快速开始

```bash
# 环境：Node.js 18+（实测 Node 24.12.0 / npm 11.6.2）
npm ci
npm run dev            # 本地开发 http://localhost:5173

npm run build          # 仅生产构建 → dist/
npm run build:prerender  # 构建 + 路由预渲染 + 生成 _redirects
npm run preview        # 本地预览生产包
```

## 部署到 Cloudflare Pages

```bash
# 1. 登录（浏览器授权一次）
npx wrangler login

# 2. 部署
npx wrangler pages deploy dist --project-name=filecut --branch=main
```

Pages 构建设置（Dashboard 可选）：

| 项 | 值 |
|----|----|
| Build command | `npm run build:prerender` |
| Build output directory | `dist` |
| Node version | 18+ |

## 项目结构

```
FileCut/
├── public/
│   ├── _headers          # COOP/COEP + 静态资源长缓存
│   └── _redirects        # SPA fallback（预渲染也会生成）
├── src/
│   ├── router/
│   │   ├── categories.js # 13 类 / 112 工具元数据（单一真源）
│   │   └── index.js      # 动态路由 + SEO meta
│   ├── views/<category>/<tool>.vue
│   ├── components/       # ToolLayout / FileDrop / FileList / ResultViewer
│   └── utils/            # pdfjs / pdflib / download / format
├── scripts/prerender.js  # 构建时全路由预渲染
└── vite.config.js
```

新增工具：在 `categories.js` 声明元数据 → 创建 `src/views/<cat>/<id>.vue` → 路由自动生效。

## 量化数据（可复现）

采集环境：**Windows 11 · Node.js v24.12.0 · npm 11.6.2**  
采集日期：**2026-09-17**  
复现命令：

```bash
npm ci
npm run build:prerender
# 体积统计
Get-ChildItem dist -Recurse -File | Measure-Object Length -Sum
```

| 指标 | 数值 |
|------|------|
| 工具分类 | 13 |
| 功能工具 | 112 |
| 预渲染路由 | 131（含首页/分类/关于/指南） |
| `vite build` 耗时 | **17.10 s** |
| `build:prerender` 总耗时 | **261 s**（含预渲染写盘） |
| 产出文件数 | 397 |
| `dist/` 总体积 | **33.92 MB**（含 ONNX WASM，见下） |
| 最大 chunk | `ort-wasm-simd-threaded.jsep*.wasm` 22.8 MB（抠图推理，按需加载） |
| 次大 chunk | `pdf.worker.min` 1.31 MB · `image-convert` 1.29 MB · `docx` 0.55 MB |

说明：抠图等 AI 能力依赖 onnxruntime WASM，体积大但**懒加载**，首屏只加载路由对应 JS。

## 本地验证（零上传）

1. 打开站点 → DevTools → Network。
2. 选择任意 PDF/图片处理，确认无文件体上行。
3. 处理完成后结果可直接在页面下载。

## License

Private（见仓库策略）。欢迎 Star 与 Issue。

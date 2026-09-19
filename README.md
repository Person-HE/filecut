# FileCut

**112 file tools that run entirely in your browser. Nothing is ever uploaded.**

[![Live demo](https://img.shields.io/badge/Live%20demo-filecut.pages.dev-2f7cf6?style=flat-square)](https://filecut.pages.dev)
![Tools](https://img.shields.io/badge/tools-112-1a7f37?style=flat-square)
![Backend](https://img.shields.io/badge/backend-none-informational?style=flat-square)
![Uploads](https://img.shields.io/badge/uploads-0-critical?style=flat-square)

PDF, Word, Excel, PPT, images, audio/video, QR codes, fonts, archives, encoding — 13 categories, 112 tools, all client-side via WASM and Web Workers. Open a tool, drop a file, get the result. No account, no quota, no server that could log your documents.

**→ [filecut.pages.dev](https://filecut.pages.dev)**

---

## Why this exists

Every "free online converter" uploads your file to someone's server. That is unacceptable for contracts, ID scans, financial exports, unreleased designs and source code. FileCut is the alternative where the claim is *architecturally* true rather than a policy promise: there is no upload endpoint in the codebase, so there is nothing to trust.

You can verify this yourself in 30 seconds:

1. Open DevTools → **Network** tab → set throttling to **Offline**.
2. Load [filecut.pages.dev](https://filecut.pages.dev) and run any tool on a local file.
3. It works. The Network tab shows requests only to `filecut.pages.dev` and the CDN hosts of the engines it loads — never a file-upload POST.

## What's in it

| Category | Tools | Representative capabilities |
| --- | ---: | --- |
| PDF | 24 | merge, split, compress, → Word/Excel/PPT/image, watermark, encrypt, OCR, redact |
| Image | 15 | convert, compress, crop, watermark, background removal, EXIF, OCR, GIF, SVG |
| Excel | 12 | preview, → PDF/CSV/JSON, filter/sort, formula check, charts, merge |
| Word | 10 | preview, → PDF/HTML/TXT, mail-merge fill, edit, compare, strip metadata |
| Text & encoding | 10 | encoding convert/detect, JSON/YAML/XML/Markdown, diff, hash, encrypt |
| Special scenarios | 8 | repair helpers, compatibility checks, chunked large files, privacy scan |
| Audio / video | 6 | transcode, compress, trim, GIF, extract audio |
| General file | 6 | hash, type sniff, compress, batch rename, content search, timestamps |
| Archive | 4 | zip create/extract/preview/edit-in-place |
| QR & barcode | 4 | generate, read, barcode, batch |
| E-book | 3 | EPUB reader, → PDF/TXT |
| Font | 3 | convert, preview, subset |
| PPT | 7 | preview, → PDF/image/Markdown, template fill, media extraction |

Engines are loaded on demand per tool: `pdf-lib`, `pdf.js`, SheetJS, `mammoth`, `pptxgenjs`, `ffmpeg.wasm`, `tesseract.js`, and ONNX Runtime WASM for background removal.

## Measured, not claimed

All numbers below are produced by one command on this checkout —
`npm run metrics` → `docs/metrics.json` — and record the machine they came from.

| Metric | Value |
| --- | --- |
| Production build + prerender | 309.2 s |
| Build output | 397 files · 33.91 MB raw · 8.81 MB gzip |
| Prerendered SEO pages | 131 |
| Source | 143 files · 33,489 lines (28,915 code) |
| Backend / API keys required | none |
| Largest single asset | `ort-wasm-simd-threaded.jsep.wasm` — 23.4 MB (background removal) |

Live behaviour, cold cache, measured in a real browser against the deployed site:

| Metric | Value |
| --- | --- |
| TTFB | 740 ms |
| `load` event | 2.66 s |
| First-page transfer | ~104 KB (engines load lazily per tool) |
| Links reachable from home | 148 |

The 23.4 MB ONNX asset is why the first background-removal run is slow and every other tool is not: it is fetched only when that tool opens.

## Running it

```bash
node -v            # 18+ (measured on 24.12.0)
npm install
npm run dev        # http://localhost:5173
npm run build      # SPA only, ~18 s
npm run build:prerender   # production: build + 131 static HTML routes, ~5 min
npm run metrics    # regenerate docs/metrics.json and docs/metrics.md
```

`prerender` drives a headless Chromium over every route. It prefers
`%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe` and falls back to the
Chromium bundled with Playwright, so it runs on any machine that has either.
Point `PRERENDER_EXECUTABLE_PATH` at a browser to override.

## Deploying

The site is fully static.

```bash
npx wrangler pages deploy dist --project-name filecut
```

`public/_redirects` provides the SPA fallback and `public/_headers` sets long-lived
immutable caching on hashed assets plus a `Cross-Origin-Embedder-Policy`. If you
serve behind a different host, update `SITE_ORIGIN` in `src/router/index.js` so
canonical URLs and JSON-LD match your domain.

## Repository layout

```
src/
  router/categories.js   the tool registry — 112 entries, 13 categories
  views/<category>/      one .vue per tool (121 views)
  utils/                 shared engine loaders (pdf, sheets, fonts, workers)
scripts/
  prerender.js           renders every route to static HTML for SEO
  metrics.mjs            reproducible build/bundle/source measurement
public/
  _redirects _headers    hosting config consumed by Cloudflare Pages
docs/
  metrics.json           machine-readable output of `npm run metrics`
```

## Limitations, stated plainly

- **No automated test suite.** Correctness is verified per tool in the browser; the build and prerender steps fail loudly if a route breaks. This is the project's biggest gap.
- Some engines load from public CDNs (jsDelivr, unpkg, `esm.sh`, Google Fonts). Offline, or if a CDN is blocked in your region, the tools that depend on them degrade while the rest of the site still works.
- The deployed `Cross-Origin-Embedder-Policy: require-corp` and CDN-loaded engines interact: a tool that fetches a cross-origin script can fail silently under that header.
- UI and documentation pages are written in Chinese; the tool labels are short and icon-led enough to use otherwise.

## 中文说明

FileCut 是一个**纯前端**文档工具站：112 个工具、13 个分类，PDF / Word / Excel / PPT / 图片 / 音视频 / 二维码 / 字体 / 压缩包全部在浏览器内用 WASM 与 Web Worker 完成，**文件不上传、不注册、无次数限制**。

- 在线使用：<https://filecut.pages.dev>
- 隐私可自行验证：DevTools 切到离线模式后仍可正常处理本地文件，网络面板中不存在任何上传请求。
- 上表所有数字来自一条命令：`npm run metrics`，结果落在 `docs/metrics.json`，并记录了采集机器（Windows 11 / Node 24.12.0 / Ryzen 7 7735H）。
- 构建：`npm run build:prerender` 生成 131 个静态 HTML 路由，用于搜索引擎与 AI 爬虫收录。
- 已知不足：无自动化测试；部分引擎依赖公共 CDN，网络受限环境下会退化。

## License

All rights reserved.

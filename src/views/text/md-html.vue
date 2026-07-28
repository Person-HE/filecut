<script setup>
/**
 * Markdown/HTML互转
 * MD→HTML: 用 marked + DOMPurify 防 XSS (DOMPurify CDN 动态加载)
 * HTML→MD: 用 turndown
 */
import { ref, onMounted, watch } from 'vue'
import { marked } from 'marked'
import TurndownService from 'turndown'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, replaceExt, getExt } from '../../utils/download.js'
import { readFileAsText } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const input = ref('')
const inputFormat = ref('md')  // 'md' or 'html'
const output = ref('')
const outputFormat = ref('html')
const renderedHtml = ref('')
const result = ref([])
const processing = ref(false)
const error = ref('')
const domPurifyReady = ref(false)

const options = ref({
  gfm: true,
  breaks: false,
  sanitize: true,
  headingIds: false
})

async function loadDomPurify() {
  if (window.DOMPurify) { domPurifyReady.value = true; return }
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js'
    s.onload = () => { domPurifyReady.value = true; resolve() }
    s.onerror = () => reject(new Error('DOMPurify 加载失败'))
    document.head.appendChild(s)
  })
}

onMounted(() => {
  loadDomPurify().catch(e => console.warn('DOMPurify lazy:', e))
})

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: false,
  mangle: false
})

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  result.value = []
  output.value = ''
  renderedHtml.value = ''
  error.value = ''
  const ext = getExt(f.name)
  if (ext === 'md' || ext === 'markdown') {
    inputFormat.value = 'md'
    outputFormat.value = 'html'
  } else if (ext === 'html' || ext === 'htm') {
    inputFormat.value = 'html'
    outputFormat.value = 'md'
  }
  await safeRun(async () => {
    if (f.size === 0) throw new Error('文件为空')
    input.value = await readFileAsText(f)
    await convert()
  }, '读取文件失败')
}

async function convert() {
  error.value = ''
  output.value = ''
  renderedHtml.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    if (!input.value.trim()) throw new Error('请输入内容')

    let text, blob, name, html
    if (inputFormat.value === 'md' && outputFormat.value === 'html') {
      marked.setOptions({
        gfm: options.value.gfm,
        breaks: options.value.breaks
      })
      html = marked.parse(input.value)
      if (options.value.sanitize) {
        if (!domPurifyReady.value) await loadDomPurify()
        html = window.DOMPurify.sanitize(html, {
          ADD_ATTR: ['target', 'id'],
          FORBID_TAGS: ['style', 'script'],
          FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
        })
      }
      text = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Converted from Markdown</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 12px; font-weight: 600; }
h1 { border-bottom: 2px solid #eee; padding-bottom: 8px; }
h2 { border-bottom: 1px solid #eee; padding-bottom: 6px; }
code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
pre { background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #ddd; padding-left: 12px; color: #666; margin: 12px 0; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ddd; padding: 6px 12px; }
img { max-width: 100%; }
a { color: #ff5a1f; }
</style>
</head>
<body>
${html}
</body>
</html>`
      blob = new Blob([text], { type: 'text/html;charset=utf-8' })
      name = file.value ? replaceExt(file.value.name, '.html') : 'output.html'
      renderedHtml.value = html
    } else if (inputFormat.value === 'html' && outputFormat.value === 'md') {
      const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-'
      })
      // 添加表格规则
      turndown.addRule('tableCell', {
        filter: ['th', 'td'],
        replacement: function(content, node) {
          return ' ' + content.trim().replace(/\n/g, ' ') + ' |'
        }
      })
      turndown.addRule('tableRow', {
        filter: 'tr',
        replacement: function(content, node) {
          return '|' + content + '\n'
        }
      })
      turndown.addRule('table', {
        filter: 'table',
        replacement: function(content, node) {
          return '\n\n' + content + '\n\n'
        }
      })
      text = turndown.turndown(input.value)
      blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
      name = file.value ? replaceExt(file.value.name, '.md') : 'output.md'
      renderedHtml.value = input.value
    } else {
      throw new Error('不支持的转换方向')
    }
    if (!text) throw new Error('输出为空')
    output.value = text
    const url = URL.createObjectURL(blob)
    result.value = [{ name, blob, url, size: blob.size }]
  }, '转换失败')

  processing.value = false
}

function swapFormats() {
  const tmp = inputFormat.value
  inputFormat.value = outputFormat.value
  outputFormat.value = tmp
  if (output.value) {
    input.value = output.value
    output.value = ''
    result.value = []
    renderedHtml.value = ''
  }
}

function loadSample() {
  file.value = null
  input.value = `# Markdown 示例

## 标题 2

这是一段 **加粗** 与 *斜体* 文本。

### 列表
- 项目 1
- 项目 2
  - 嵌套项
- 项目 3

### 任务列表
- [x] 已完成
- [ ] 待办

### 代码
\`\`\`javascript
function hello() {
  console.log("Hello World")
}
\`\`\`

### 引用
> 这是一段引用文本
> 多行引用

### 表格
| 名称 | 值 | 描述 |
|------|-----|------|
| A    | 1   | 第一 |
| B    | 2   | 第二 |

### 链接与图片
[FileCut](https://example.com)

\`行内代码\`
`
  inputFormat.value = 'md'
  outputFormat.value = 'html'
  convert()
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
  result.value = []
  renderedHtml.value = ''
  file.value = null
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value).then(() => showError('已复制'))
    .catch(() => showError('复制失败'))
}
</script>

<template>
  <ToolLayout title="Markdown/HTML互转" desc="MD与HTML互转，DOMPurify防XSS，可实时预览" icon="⇄">
    <FileDrop accept=".md,.markdown,.html,.htm,text/markdown,text/html"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传 .md/.html 文件" icon="⇄" />

    <div class="nb-card mt-16">
      <div class="toolbar">
        <div class="toolbar-actions">
          <button class="nb-btn sm" @click="loadSample">📝 示例</button>
          <button class="nb-btn sm" @click="clearAll">✕ 清空</button>
        </div>
        <div class="format-selector">
          <div>
            <label class="nb-label">源格式</label>
            <select v-model="inputFormat" class="nb-select">
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
            </select>
          </div>
          <button class="nb-btn sm" @click="swapFormats">⇄</button>
          <div>
            <label class="nb-label">目标格式</label>
            <select v-model="outputFormat" class="nb-select">
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
            </select>
          </div>
        </div>
      </div>

      <div class="options mt-16" v-if="inputFormat === 'md'">
        <label class="nb-label">
          <input type="checkbox" v-model="options.gfm" /> GitHub Flavored
        </label>
        <label class="nb-label">
          <input type="checkbox" v-model="options.breaks" /> 换行转 &lt;br&gt;
        </label>
        <label class="nb-label">
          <input type="checkbox" v-model="options.sanitize" /> DOMPurify 防 XSS
        </label>
      </div>

      <div class="dual-pane mt-16">
        <div class="pane">
          <label class="nb-label">输入 ({{ inputFormat }})</label>
          <textarea v-model="input" class="nb-textarea code-area"
                    :placeholder="`输入 ${inputFormat} 内容...`" spellcheck="false"></textarea>
        </div>
        <div class="pane">
          <label class="nb-label">输出 ({{ outputFormat }})</label>
          <pre class="code-area output-area">{{ output || '(执行后显示)' }}</pre>
          <button v-if="output" class="nb-btn sm mt-8" @click="copyOutput">📋 复制</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div class="mt-16">
      <button class="nb-btn primary lg" @click="convert" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>⇄ {{ inputFormat }} → {{ outputFormat }}</span>
      </button>
    </div>

    <div v-if="renderedHtml" class="nb-card mt-16">
      <h3 class="nb-h3">👁 实时预览</h3>
      <div class="html-preview mt-16" v-html="renderedHtml"></div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.format-selector { display: flex; gap: 8px; align-items: end; }
.options {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
  padding: 8px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
}
.dual-pane {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pane { display: flex; flex-direction: column; }
.code-area {
  min-height: 320px;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.5;
  padding: 12px;
  border: 3px solid var(--ink);
  background: var(--paper-card);
}
.output-area {
  background: var(--ink);
  color: var(--neon);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.mt-8 { margin-top: 8px; }
.html-preview {
  background: var(--paper-card);
  padding: 24px;
  border: 3px solid var(--ink);
  font-family: var(--font-body);
  line-height: 1.6;
  max-height: 600px;
  overflow: auto;
}
.html-preview :deep(h1), .html-preview :deep(h2), .html-preview :deep(h3) {
  margin: 16px 0 8px;
  font-weight: 700;
}
.html-preview :deep(h1) { border-bottom: 3px solid var(--ink); padding-bottom: 4px; font-family: var(--font-display); font-size: 1.8em; }
.html-preview :deep(h2) { border-bottom: 2px solid var(--ink-soft); padding-bottom: 3px; font-family: var(--font-display); font-size: 1.4em; }
.html-preview :deep(h3) { font-size: 1.2em; }
.html-preview :deep(code) {
  background: var(--paper-darker);
  padding: 2px 6px;
  font-family: var(--font-mono);
  border: 1px solid var(--ink);
}
.html-preview :deep(pre) {
  background: var(--ink);
  color: var(--neon);
  padding: 12px;
  overflow-x: auto;
  border: 2px solid var(--ink);
}
.html-preview :deep(pre) :deep(code) {
  background: none;
  border: none;
  color: inherit;
}
.html-preview :deep(blockquote) {
  border-left: 4px solid var(--accent);
  padding-left: 12px;
  color: var(--ink-soft);
  margin: 12px 0;
}
.html-preview :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
}
.html-preview :deep(th), .html-preview :deep(td) {
  border: 2px solid var(--ink);
  padding: 6px 12px;
}
.html-preview :deep(th) { background: var(--neon); }
.html-preview :deep(a) { color: var(--accent); text-decoration: underline; }
.html-preview :deep(ul), .html-preview :deep(ol) { padding-left: 24px; }
.html-preview :deep(img) { max-width: 100%; border: 3px solid var(--ink); }
@media (max-width: 768px) {
  .dual-pane { grid-template-columns: 1fr; }
  .format-selector { flex-direction: column; align-items: stretch; }
}
</style>

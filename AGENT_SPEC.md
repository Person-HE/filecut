# FileCut 实现规范 - 子代理参考文档

## 项目背景
纯前端文档工具站，112个独立功能页面。所有处理在浏览器本地完成（WebAssembly + Web Worker），零后端依赖。部署到Cloudflare Pages。

## 项目根目录
`d:\project\PersonCreate\FileCut`

## 技术栈
- Vue 3 + Vite + Vue Router 4
- 已配置: package.json, vite.config.js, src/main.js, src/App.vue, src/router/, src/styles/main.css
- 已配置共享组件: src/components/{TopNav, FileDrop, FileList, ToolLayout, ResultViewer}.vue
- 已配置工具库: src/utils/{pdfjs.js, pdflib.js, fileReader.js, download.js, format.js, common.js}

## 关键约束
1. **每个功能页面必须真实可用，不能是占位符**
2. **必须处理特殊情况**: 加密PDF、损坏文件、大文件、中文字体、空文件
3. **必须显示错误信息**: 用户友好提示
4. **文件永不上传**: 所有处理在浏览器
5. **结果必须验证**: 处理完成后必须能下载/查看

## 文件命名规则
- 视图文件: `src/views/{categoryId}/{toolId}.vue` (例: src/views/pdf/pdf-merge.vue)
- categoryId 在 `src/router/categories.js` 中定义
- toolId 与 categories.js 中的 id 一致

## 每个功能页面的标准结构
```vue
<script setup>
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, replaceExt, getBaseName } from '../../utils/download.js'
import { readFileAsArrayBuffer, readFileAsText } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')

async function onFileSelect(selected) {
  // 接收 FileDrop 的 select 事件
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [selected]
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

async function process() {
  if (!files.value.length) {
    showError('请先选择文件')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  await safeRun(async () => {
    // === 实际处理逻辑 ===
    // 使用 pdf.js / pdf-lib / SheetJS / etc.
    
    // === 验证结果 ===
    // 检查输出是否有效
    
    // === 创建下载链接 ===
    result.value = [{ name: 'output.pdf', blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '处理失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="工具名" desc="工具描述" icon="icon">
    <FileDrop accept=".pdf" :multiple="false" @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    
    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>开始处理</span>
      </button>
    </div>
    
    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    
    <ResultViewer :files="result" />
  </ToolLayout>
</template>
```

## UI 设计规范 (Neobrutalism 手绘粗黑边框风)
- 粗黑边框: 3-4px solid var(--ink) (#1a1a1a)
- 硬偏移阴影: 5px 5px 0 var(--ink)
- 0px圆角
- 纸质背景: var(--paper-bg) (#f4ecd8) 暖米黄
- 字体: var(--font-display) Caveat手写体用于标题, var(--font-mono) IBM Plex Mono用于代码
- 强调色: var(--accent) 橙红 #ff5a1f, var(--neon) 荧光黄绿 #c4ff00
- **严禁紫色** (反AI味)
- **严禁使用居中Hero+三列卡片**标准结构

## 共享组件用法
```js
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
```

- `ToolLayout`: 自动渲染面包屑+标题+隐私提示。props: title, desc, icon
- `FileDrop`: 文件拖拽上传。props: accept('.pdf,application/pdf'), multiple, maxSize, hint, icon。events: select(file或file[]), error(msg)
- `FileList`: 显示文件列表。props: files, showSize。events: remove(idx)
- `ResultViewer`: 显示结果。props: files[{name,blob,url,size}], text, imageUrls[], custom(bool)

## 共享工具库用法
```js
import { readFileAsArrayBuffer, readFileAsText } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt, getBaseName, getExt } from '../../utils/download.js'
import { formatBytes, uid } from '../../utils/format.js'
import { safeRun, showError, isMobile, isLockdownMode } from '../../utils/common.js'

// PDF专用
import * as pdfjs from '../../utils/pdfjs.js'  // loadPdf, renderPage, renderPageToImage, extractAllText, isEncrypted
import * as pdflib from '../../utils/pdflib.js' // loadPdfLib, createPdf, embedChineseFont, hexToRgb
```

## 处理特殊情况的标准流程
每个功能必须处理:
1. **空文件**: 文件大小为0 → 提示用户
2. **损坏文件**: try-catch, 友好错误提示
3. **加密PDF**: 检测到加密 → 让用户输入密码
4. **大文件**: >50MB → 显示进度提示, 考虑分块
5. **中文字体**: PDF生成场景必须嵌入字体
6. **不支持格式**: 友好提示用户转换格式

## 输出验证
每个功能处理后必须验证:
1. 输出文件非空(blob.size > 0)
2. 输出格式正确(扩展名/MIME)
3. 如有内容, 检查关键内容是否正确

## 测试要求
1. 创建后启动 `npm run dev` 验证页面能正常加载(无控制台错误)
2. 准备真实测试文件(每个功能至少1个)
3. 验证处理结果正确(打开下载的文件确认)

## 开发服务器
已在 d:\project\PersonCreate\FileCut 跑 `npm run dev`, 端口 5173
不要重启服务, 直接创建文件即可, Vite HMR 会自动加载

## 不要做的事
1. 不要修改 package.json (依赖已装好)
2. 不要修改 vite.config.js
3. 不要修改 src/router/categories.js (路由已配置)
4. 不要修改 src/router/index.js
5. 不要修改共享组件
6. 不要创建占位符页面 - 每个功能必须真实可用

## 创建文件清单
按本任务的指示创建所有指定的 .vue 文件,每个文件必须真实完整可用。

## 完成后
1. 在终端确认无 vite 错误
2. 通过 PowerShell Invoke-WebRequest 测试每个页面能加载
3. 提交完成报告(创建的文件列表, 测试结果)

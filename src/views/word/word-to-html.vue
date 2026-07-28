<script setup>
/**
 * Word转HTML - 用 mammoth.js 转 HTML (语义化)
 * 输出独立HTML文件(资源内联)
 */
import { ref } from 'vue'
import mammoth from 'mammoth'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const htmlPreview = ref('')

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  htmlPreview.value = ''
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  htmlPreview.value = ''
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const arrayBuffer = buf.slice(0)
    const res = await mammoth.convertToHtml({ arrayBuffer })
    const html = res.value
    if (!html || !html.trim()) throw new Error('文档内容为空')

    htmlPreview.value = html

    const standalone = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${file.value.name.replace(/\.docx?$/i, '')}</title>
<style>
  body { font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.8; }
  h1, h2, h3, h4 { margin-top: 1.5em; margin-bottom: 0.5em; }
  p { margin: 0.8em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #999; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  ul, ol { margin: 0.8em 0; padding-left: 2em; }
  blockquote { border-left: 4px solid #ccc; padding-left: 1em; color: #555; margin: 1em 0; }
  a { color: #ff5a1f; }
</style>
</head>
<body>
${html}
</body>
</html>`

    const blob = new Blob([standalone], { type: 'text/html;charset=utf-8' })
    if (blob.size === 0) throw new Error('生成的HTML为空')

    const name = replaceExt(file.value.name, '.html')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, 'Word转HTML失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Word转HTML" desc="Word转网页HTML，语义化保留格式" icon="H">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 输出独立HTML文件" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="htmlPreview" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">HTML预览</h3>
      <div class="html-preview" v-html="htmlPreview"></div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.html-preview {
  max-height: 400px;
  overflow: auto;
  padding: 16px;
  background: #fff;
  border: 2px solid var(--ink);
  font-family: -apple-system, "Microsoft YaHei", sans-serif;
  line-height: 1.8;
}
.html-preview :deep(h1), .html-preview :deep(h2), .html-preview :deep(h3) {
  margin: 0.5em 0;
}
.html-preview :deep(table) { border-collapse: collapse; }
.html-preview :deep(td), .html-preview :deep(th) { border: 1px solid #999; padding: 4px 8px; }
.html-preview :deep(img) { max-width: 100%; }
</style>

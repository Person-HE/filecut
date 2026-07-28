<script setup>
/**
 * Word文档编辑 - docx-preview 显示，contenteditable 编辑
 * 保存时序列化回 .docx (简化为 HTML+导出 .doc 兼容Word)
 */
import { ref, nextTick } from 'vue'
import { renderAsync } from 'docx-preview'
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
const saving = ref(false)
const error = ref('')
const containerRef = ref(null)
const isEditing = ref(false)
const loaded = ref(false)

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  error.value = ''
  loaded.value = false
  isEditing.value = false
  nextTick(() => loadDoc())
}

function removeFile() {
  file.value = null
  result.value = []
  loaded.value = false
  isEditing.value = false
  if (containerRef.value) containerRef.value.innerHTML = ''
}

async function loadDoc() {
  if (!file.value) return
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    if (containerRef.value) containerRef.value.innerHTML = ''
    await renderAsync(buf, containerRef.value, null, {
      className: 'docx-render',
      inWrapper: false,
      breakPages: true,
      experimental: true,
      useBaseStyles: true,
      renderHeaders: true,
      renderFooters: true
    })
    await nextTick()
    loaded.value = true
  }, 'Word文档加载失败')
  processing.value = false
}

function toggleEdit() {
  if (!loaded.value) return
  isEditing.value = !isEditing.value
  if (containerRef.value) {
    if (isEditing.value) {
      containerRef.value.setAttribute('contenteditable', 'true')
      containerRef.value.classList.add('editing')
    } else {
      containerRef.value.removeAttribute('contenteditable')
      containerRef.value.classList.remove('editing')
    }
  }
}

function formatDoc(command, value = null) {
  if (!isEditing.value) {
    showError('请先开启编辑模式')
    return
  }
  containerRef.value?.focus()
  document.execCommand(command, false, value)
}

async function save() {
  if (!containerRef.value) return
  error.value = ''
  result.value = []
  saving.value = true

  await safeRun(async () => {
    const htmlContent = containerRef.value.innerHTML
    if (!htmlContent || !htmlContent.trim()) throw new Error('内容为空')

    // 包装为 Word 兼容的 HTML (.doc)
    const fullHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<title>${file.value.name.replace(/\.docx?$/i, '')}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument><w:View>Print</w:View></w:WordDocument>
</xml><![endif]-->
<style>
@page WordSection1 { size: 595.3pt 841.9pt; margin: 72pt 90pt 72pt 90pt; }
div.WordSection1 { page: WordSection1; }
body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
table { border-collapse: collapse; }
td, th { border: 1px solid #000; padding: 4px 8px; }
h1, h2, h3, h4 { margin: 1em 0 0.5em; }
p { margin: 0.5em 0; }
</style>
</head>
<body>
<div class="WordSection1">
${htmlContent}
</div>
</body>
</html>`

    // 保存为 .doc 格式 (Word 可直接打开)
    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' })
    if (blob.size === 0) throw new Error('生成文档为空')

    const name = replaceExt(file.value.name, '-edited.doc')
    result.value = [{ name, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '保存失败')
  saving.value = false
}

function insertLink() {
  const url = prompt('输入链接 URL:')
  if (url) formatDoc('createLink', url)
}

function insertImage() {
  const url = prompt('输入图片 URL:')
  if (url) formatDoc('insertImage', url)
}
</script>

<template>
  <ToolLayout title="Word文档编辑" desc="在线编辑Word文档，可直接修改文字和样式" icon="✎">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 加载后可点击编辑按钮开始修改" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="loaded" class="mt-16 nb-card">
      <div class="toolbar">
        <div class="toolbar-group">
          <button class="nb-btn sm" :class="{ primary: isEditing }" @click="toggleEdit">
            {{ isEditing ? '✓ 编辑中' : '✎ 编辑' }}
          </button>
        </div>
        <div class="toolbar-group">
          <button class="nb-btn sm" @click="formatDoc('bold')" title="加粗"><b>B</b></button>
          <button class="nb-btn sm" @click="formatDoc('italic')" title="斜体"><i>I</i></button>
          <button class="nb-btn sm" @click="formatDoc('underline')" title="下划线"><u>U</u></button>
          <button class="nb-btn sm" @click="formatDoc('strikeThrough')" title="删除线"><s>S</s></button>
        </div>
        <div class="toolbar-group">
          <select class="nb-select sm" @change="(e) => formatDoc('formatBlock', e.target.value)">
            <option value="">段落</option>
            <option value="h1">标题1</option>
            <option value="h2">标题2</option>
            <option value="h3">标题3</option>
            <option value="p">正文</option>
          </select>
          <select class="nb-select sm" @change="(e) => formatDoc('fontSize', e.target.value)">
            <option value="">字号</option>
            <option value="2">小</option>
            <option value="3">正常</option>
            <option value="5">大</option>
            <option value="7">特大</option>
          </select>
        </div>
        <div class="toolbar-group">
          <button class="nb-btn sm" @click="formatDoc('justifyLeft')" title="左对齐">⬅</button>
          <button class="nb-btn sm" @click="formatDoc('justifyCenter')" title="居中">↔</button>
          <button class="nb-btn sm" @click="formatDoc('justifyRight')" title="右对齐">➡</button>
        </div>
        <div class="toolbar-group">
          <button class="nb-btn sm" @click="formatDoc('insertUnorderedList')" title="项目符号">• 列表</button>
          <button class="nb-btn sm" @click="formatDoc('insertOrderedList')" title="编号">1. 列表</button>
          <button class="nb-btn sm" @click="insertLink" title="链接">🔗</button>
          <button class="nb-btn sm" @click="insertImage" title="图片">🖼</button>
        </div>
        <div class="toolbar-group">
          <button class="nb-btn sm" @click="formatDoc('removeFormat')" title="清除格式">✕ 格式</button>
          <button class="nb-btn sm" @click="formatDoc('undo')" title="撤销">↶</button>
          <button class="nb-btn sm" @click="formatDoc('redo')" title="重做">↷</button>
        </div>
        <div class="toolbar-group">
          <button class="nb-btn primary sm" @click="save" :disabled="saving">
            <span v-if="saving"><span class="nb-spinner"></span></span> 保存
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="file" class="preview-container mt-16">
      <div class="preview-scroll">
        <div ref="containerRef" class="docx-container" :class="{ editable: isEditing }"></div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.toolbar-group {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  border: 2px solid var(--ink);
  background: var(--paper-bg);
}
.nb-select.sm {
  padding: 4px 8px;
  font-size: 12px;
  width: auto;
}
.preview-container {
  background: var(--paper-darker);
  padding: 24px;
  border: var(--border-w-thick) solid var(--ink);
  box-shadow: var(--shadow-md);
}
.preview-scroll {
  overflow: auto;
  max-height: 70vh;
  display: flex;
  justify-content: center;
}
.docx-container {
  background: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  min-width: 600px;
  padding: 40px;
  max-width: 900px;
  outline: none;
}
.docx-container.editable {
  outline: 3px dashed var(--accent);
}
.docx-container :deep(.docx-wrapper) {
  background: #fff;
}
.docx-container :deep(.docx-wrapper) > section.docx {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}
</style>

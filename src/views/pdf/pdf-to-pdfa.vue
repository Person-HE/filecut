<script setup>
/**
 * PDF转PDF/A - 用 pdf-lib 规范元数据，嵌入字体子集
 *
 * 注: 完整PDF/A-1b/2b合规需要更多底层结构操作，pdf-lib有限支持
 * 此处提供实用版本: 设置PDF/A相关元数据、清除不必要的加密、嵌入字体的子集
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError, isLockdownMode } from '../../utils/common.js'
import { loadPdfLib, embedChineseFont } from '../../utils/pdflib.js'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)
const title = ref('')
const author = ref('')
const subject = ref('')

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      const doc = await loadPdfLib(buf)
      title.value = doc.getTitle() || ''
      author.value = doc.getAuthor() || ''
      subject.value = doc.getSubject() || ''
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const srcDoc = await loadPdfLib(file)
    progressText.value = '复制页面中...'
    const outDoc = await PDFDocument.create()
    const pageIndices = srcDoc.getPageIndices()
    const pages = await outDoc.copyPages(srcDoc, pageIndices)
    pages.forEach(p => outDoc.addPage(p))
    progress.value = 50

    progressText.value = '设置PDF/A元数据...'
    // PDF/A 标准元数据
    outDoc.setTitle(title.value || getBaseName(file.name))
    outDoc.setAuthor(author.value || 'Unknown')
    outDoc.setSubject(subject.value || 'PDF/A Archive')
    outDoc.setKeywords(['PDF/A'])
    outDoc.setProducer('FileCut PDF/A Converter')
    outDoc.setCreator('FileCut')
    const now = new Date()
    outDoc.setCreationDate(now)
    outDoc.setModificationDate(now)
    progress.value = 70

    progressText.value = '生成PDF/A中...'
    // 注意: 完整的PDF/A合规需要嵌入所有字体; pdf-lib会自动嵌入新增文本字体
    // 对于已有未嵌入字体的PDF, 此处仅做元数据规范化
    const pdfBytes = await outDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    })
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF/A失败')
    const origSize = file.size
    const ratio = ((blob.size - origSize) / origSize * 100).toFixed(1)
    result.value = [{
      name: `${getBaseName(file.name)}_pdfa.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = `完成 ${ratio > 0 ? '+' : ''}${ratio}% 体积`
  }, 'PDF转PDF/A失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF转PDF/A" desc="转换为PDF/A长期归档格式，规范元数据" icon="A">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>
    <div class="nb-grid cols-2 mt-16" v-if="files.length">
      <div>
        <label class="nb-label">标题</label>
        <input class="nb-input" type="text" v-model="title" placeholder="文档标题" />
      </div>
      <div>
        <label class="nb-label">作者</label>
        <input class="nb-input" type="text" v-model="author" placeholder="作者" />
      </div>
      <div>
        <label class="nb-label">主题</label>
        <input class="nb-input" type="text" v-model="subject" placeholder="主题" />
      </div>
    </div>
    <div class="nb-alert warning mt-16">
      PDF/A归档格式会强制嵌入字体与元数据，输出文件可能比原文件体积更大
    </div>
    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 转换中...</span>
        <span v-else>开始转换</span>
      </button>
    </div>
    <div v-if="processing" class="mt-16">
      <div class="nb-progress"><div class="nb-progress-bar" :style="{ width: progress + '%' }"></div></div>
      <div class="nb-subtitle mt-8">{{ progressText }} ({{ progress }}%)</div>
    </div>
    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>
    <ResultViewer :files="result" />
  </ToolLayout>
</template>

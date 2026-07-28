<script setup>
/**
 * PDF元数据编辑 - 显示并编辑 Title/Author/Subject/Keywords/Creator/Producer
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib } from '../../utils/pdflib.js'

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
const keywords = ref('')
const creator = ref('')
const producer = ref('')
const creationDate = ref('')
const modDate = ref('')

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  if (files.value.length) {
    await safeRun(async () => {
      const buf = await files.value[0].arrayBuffer()
      const doc = await loadPdfLib(buf)
      title.value = doc.getTitle() || ''
      author.value = doc.getAuthor() || ''
      subject.value = doc.getSubject() || ''
      const kw = doc.getKeywords()
      keywords.value = Array.isArray(kw) ? kw.join(', ') : (kw || '')
      creator.value = doc.getCreator() || ''
      producer.value = doc.getProducer() || ''
      const cd = doc.getCreationDate()
      creationDate.value = cd ? cd.toISOString().slice(0, 16) : ''
      const md = doc.getModificationDate()
      modDate.value = md ? md.toISOString().slice(0, 16) : ''
    }, '加载元数据失败')
  }
}
function removeFile(idx) {
  files.value.splice(idx, 1)
  title.value = ''; author.value = ''; subject.value = ''
  keywords.value = ''; creator.value = ''; producer.value = ''
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    progressText.value = '更新元数据...'
    doc.setTitle(title.value || '')
    doc.setAuthor(author.value || '')
    doc.setSubject(subject.value || '')
    const kwArr = keywords.value.split(',').map(s => s.trim()).filter(Boolean)
    doc.setKeywords(kwArr)
    doc.setCreator(creator.value || 'FileCut')
    doc.setProducer(producer.value || 'FileCut')
    if (creationDate.value) {
      try { doc.setCreationDate(new Date(creationDate.value)) } catch (e) {}
    }
    if (modDate.value) {
      try { doc.setModificationDate(new Date(modDate.value)) } catch (e) {}
    } else {
      doc.setModificationDate(new Date())
    }
    progress.value = 70
    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_meta.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF元数据编辑失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF元数据编辑" desc="编辑PDF标题作者等元信息" icon="ⓘ">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div v-if="files.length" class="nb-grid cols-2 mt-16">
      <div>
        <label class="nb-label">标题 (Title)</label>
        <input class="nb-input" v-model="title" placeholder="文档标题" />
      </div>
      <div>
        <label class="nb-label">作者 (Author)</label>
        <input class="nb-input" v-model="author" placeholder="作者" />
      </div>
      <div>
        <label class="nb-label">主题 (Subject)</label>
        <input class="nb-input" v-model="subject" placeholder="主题" />
      </div>
      <div>
        <label class="nb-label">关键词 (Keywords, 逗号分隔)</label>
        <input class="nb-input" v-model="keywords" placeholder="关键词1, 关键词2" />
      </div>
      <div>
        <label class="nb-label">创建者 (Creator)</label>
        <input class="nb-input" v-model="creator" placeholder="创建程序" />
      </div>
      <div>
        <label class="nb-label">生产者 (Producer)</label>
        <input class="nb-input" v-model="producer" placeholder="生产程序" />
      </div>
      <div>
        <label class="nb-label">创建日期</label>
        <input class="nb-input" type="datetime-local" v-model="creationDate" />
      </div>
      <div>
        <label class="nb-label">修改日期</label>
        <input class="nb-input" type="datetime-local" v-model="modDate" />
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 保存中...</span>
        <span v-else>保存元数据</span>
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

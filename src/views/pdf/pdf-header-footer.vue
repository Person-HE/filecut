<script setup>
/**
 * PDF加页眉页脚 - 自定义文字、位置、字号
 * 用 pdf-lib
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getBaseName } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'
import { loadPdfLib, embedChineseFont } from '../../utils/pdflib.js'
import { StandardFonts } from 'pdf-lib'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressText = ref('')
const password = ref('')
const needPassword = ref(false)

const headerLeft = ref('')
const headerCenter = ref('')
const headerRight = ref('')
const footerLeft = ref('')
const footerCenter = ref('')
const footerRight = ref('')
const fontSize = ref(10)
const margin = ref(20)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  if (files.value.length) {
    try {
      const buf = await files.value[0].arrayBuffer()
      await loadPdfLib(buf)
    } catch (e) {
      if (/password|encrypt/i.test(e.message || '')) needPassword.value = true
    }
  }
}
function removeFile(idx) { files.value.splice(idx, 1) }

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  const hasHeader = headerLeft.value || headerCenter.value || headerRight.value
  const hasFooter = footerLeft.value || footerCenter.value || footerRight.value
  if (!hasHeader && !hasFooter) { showError('请至少输入一个页眉或页脚文字'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const pages = doc.getPages()
    let font
    try {
      font = await embedChineseFont(doc)
    } catch (e) {
      font = await doc.embedFont(StandardFonts.Helvetica)
    }

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const { width, height } = page.getSize()
      // 页眉 (顶部)
      if (hasHeader) {
        const y = height - fontSize.value - margin.value
        if (headerLeft.value) {
          page.drawText(headerLeft.value, { x: margin.value, y, size: fontSize.value, font })
        }
        if (headerCenter.value) {
          const w = font.widthOfTextAtSize(headerCenter.value, fontSize.value)
          page.drawText(headerCenter.value, { x: (width - w) / 2, y, size: fontSize.value, font })
        }
        if (headerRight.value) {
          const w = font.widthOfTextAtSize(headerRight.value, fontSize.value)
          page.drawText(headerRight.value, { x: width - w - margin.value, y, size: fontSize.value, font })
        }
      }
      // 页脚 (底部)
      if (hasFooter) {
        const y = margin.value
        if (footerLeft.value) {
          page.drawText(footerLeft.value, { x: margin.value, y, size: fontSize.value, font })
        }
        if (footerCenter.value) {
          const w = font.widthOfTextAtSize(footerCenter.value, fontSize.value)
          page.drawText(footerCenter.value, { x: (width - w) / 2, y, size: fontSize.value, font })
        }
        if (footerRight.value) {
          const w = font.widthOfTextAtSize(footerRight.value, fontSize.value)
          page.drawText(footerRight.value, { x: width - w - margin.value, y, size: fontSize.value, font })
        }
      }
      progress.value = Math.round(((i + 1) / pages.length) * 90)
      progressText.value = `加页眉页脚 ${i + 1}/${pages.length}`
    }

    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_hf.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF加页眉页脚失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF加页眉页脚" desc="添加自定义页眉页脚" icon="☰">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div v-if="files.length" class="mt-16">
      <h3 class="nb-h3 mb-8">页眉</h3>
      <div class="nb-grid cols-3">
        <div>
          <label class="nb-label">左</label>
          <input class="nb-input" v-model="headerLeft" placeholder="如: 公司名" />
        </div>
        <div>
          <label class="nb-label">中</label>
          <input class="nb-input" v-model="headerCenter" placeholder="如: 文档标题" />
        </div>
        <div>
          <label class="nb-label">右</label>
          <input class="nb-input" v-model="headerRight" placeholder="如: 日期" />
        </div>
      </div>

      <h3 class="nb-h3 mb-8 mt-16">页脚</h3>
      <div class="nb-grid cols-3">
        <div>
          <label class="nb-label">左</label>
          <input class="nb-input" v-model="footerLeft" placeholder="如: 作者" />
        </div>
        <div>
          <label class="nb-label">中</label>
          <input class="nb-input" v-model="footerCenter" placeholder="如: 版权声明" />
        </div>
        <div>
          <label class="nb-label">右</label>
          <input class="nb-input" v-model="footerRight" placeholder="如: 链接" />
        </div>
      </div>

      <div class="nb-grid cols-2 mt-16">
        <div>
          <label class="nb-label">字号</label>
          <input class="nb-input" type="number" v-model="fontSize" min="6" max="36" />
        </div>
        <div>
          <label class="nb-label">边距(磅)</label>
          <input class="nb-input" type="number" v-model="margin" min="10" max="100" />
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>开始添加</span>
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

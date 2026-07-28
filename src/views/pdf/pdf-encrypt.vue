<script setup>
/**
 * PDF加密解密
 * - 加密模式: 设置密码(AES-256)
 * - 解密模式: 输入密码移除加密
 * 用 pdf-lib save({ userPassword, ownerPassword })
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
const mode = ref('encrypt')  // encrypt | decrypt
const userPassword = ref('')
const ownerPassword = ref('')
const decryptPassword = ref('')
const needPassword = ref(false)

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false
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
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    if (mode.value === 'encrypt') {
      if (!userPassword.value && !ownerPassword.value) {
        throw new Error('请至少设置用户密码或所有者密码')
      }
      // 用 pdf-lib 加载然后重新保存带密码
      const doc = await loadPdfLib(file)
      progressText.value = '加密PDF中...'
      // 注: pdf-lib 的加密功能有限, 它支持 save 时的 userPassword/ownerPassword
      const bytes = await doc.save({
        userPassword: userPassword.value || undefined,
        ownerPassword: ownerPassword.value || undefined,
        permissions: { printing: 'highResolution', modifying: false, copying: false, annotating: false, fillingForms: true, contentAccessibility: true, documentAssembly: false }
      })
      const blob = new Blob([bytes], { type: 'application/pdf' })
      if (!blob.size) throw new Error('生成PDF失败')
      result.value = [{
        name: `${getBaseName(file.name)}_encrypted.pdf`,
        blob, url: URL.createObjectURL(blob), size: blob.size
      }]
    } else {
      // 解密: 用密码加载, 然后不带密码保存
      if (!decryptPassword.value) throw new Error('请输入解密密码')
      progressText.value = '解密PDF中...'
      // 先用 pdf.js 验证密码
      const { loadPdf } = await import('../../utils/pdfjs.js')
      try {
        const buf1 = await file.arrayBuffer()
        await loadPdf(buf1, { password: decryptPassword.value })
      } catch (e) {
        throw new Error('密码错误或PDF无法解密')
      }
      // 用 pdf-lib 加载(ignoreEncryption) 然后保存
      const doc = await loadPdfLib(file)
      const bytes = await doc.save()
      const blob = new Blob([bytes], { type: 'application/pdf' })
      if (!blob.size) throw new Error('生成PDF失败')
      result.value = [{
        name: `${getBaseName(file.name)}_decrypted.pdf`,
        blob, url: URL.createObjectURL(blob), size: blob.size
      }]
    }
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF加密/解密失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF加密解密" desc="为PDF设置密码保护或移除密码" icon="⚿">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="mt-16" v-if="files.length">
      <label class="nb-label">操作模式</label>
      <select class="nb-select" v-model="mode" style="max-width:240px">
        <option value="encrypt">加密(添加密码)</option>
        <option value="decrypt">解密(移除密码)</option>
      </select>
    </div>

    <div v-if="mode === 'encrypt' && files.length" class="mt-16">
      <div class="nb-grid cols-2">
        <div>
          <label class="nb-label">用户密码(打开PDF需要)</label>
          <input class="nb-input" type="password" v-model="userPassword" placeholder="用户密码" />
        </div>
        <div>
          <label class="nb-label">所有者密码(修改权限需要)</label>
          <input class="nb-input" type="password" v-model="ownerPassword" placeholder="所有者密码(可选)" />
        </div>
      </div>
      <div class="nb-alert info mt-16">
        加密后PDF打开时需要输入用户密码。所有者密码用于限制打印、复制等权限。
      </div>
    </div>

    <div v-if="mode === 'decrypt' && files.length" class="mt-16">
      <label class="nb-label">原PDF密码</label>
      <input class="nb-input" type="password" v-model="decryptPassword" placeholder="原PDF密码" style="max-width:320px" />
      <div v-if="needPassword" class="nb-alert warning mt-16">检测到此PDF已加密,请输入原密码以解密</div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
        <span v-else>{{ mode === 'encrypt' ? '加密PDF' : '解密PDF' }}</span>
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

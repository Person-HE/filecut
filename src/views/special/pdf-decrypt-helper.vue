<script setup>
/**
 * 加密PDF解密助手
 * - 用户上传加密PDF
 * - 输入密码, 用 pdf.js 加载验证
 * - 密码正确则用 pdf-lib 重写为无密码PDF
 * 重要: 仅限合法所有者使用, UI需显示警告
 */
import { ref } from 'vue'
import * as pdfjs from '../../utils/pdfjs.js'
import { PDFDocument } from 'pdf-lib'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const password = ref('')
const status = ref('idle') // idle | testing | ok | fail
const statusMsg = ref('')
const result = ref([])
const processing = ref(false)
const error = ref('')

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  file.value = f
  status.value = 'idle'
  statusMsg.value = ''
  password.value = ''
  result.value = []
  // 立即测试是否需要密码
  await testEncrypted()
}

async function testEncrypted() {
  if (!file.value) return
  status.value = 'testing'
  statusMsg.value = '检测加密状态...'
  try {
    const doc = await pdfjs.loadPdf(file.value)
    status.value = 'ok'
    statusMsg.value = `✓ 此 PDF 未加密 (共 ${doc.numPages} 页)`
    password.value = ''
  } catch (e) {
    const msg = e?.message || ''
    if (/password/i.test(msg)) {
      status.value = 'need-password'
      statusMsg.value = '⚠ 文档已加密，请输入密码'
    } else {
      status.value = 'fail'
      statusMsg.value = '✕ 文件加载失败: ' + msg
    }
  }
}

async function verifyPassword() {
  if (!file.value) { showError('请先选择文件'); return }
  if (!password.value) { showError('请输入密码'); return }
  status.value = 'testing'
  statusMsg.value = '验证密码中...'
  error.value = ''
  await safeRun(async () => {
    const doc = await pdfjs.loadPdf(file.value, { password: password.value })
    status.value = 'ok'
    statusMsg.value = `✓ 密码正确！文档已解锁 (共 ${doc.numPages} 页)`
  }, '密码验证失败')
  if (status.value !== 'ok') {
    status.value = 'fail'
    statusMsg.value = '✕ 密码错误或文档损坏'
  }
}

async function decrypt() {
  if (!file.value) { showError('请先选择文件'); return }
  if (status.value !== 'ok') { showError('请先验证密码'); return }
  processing.value = true
  error.value = ''
  result.value = []
  await safeRun(async () => {
    // 用 pdf-lib 重新加载(忽略加密) 并保存为新 PDF (无密码)
    const buf = await file.value.arrayBuffer()
    const pdf = await PDFDocument.load(buf, {
      ignoreEncryption: true,
      password: password.value || undefined
    })
    const out = await pdf.save({ useObjectStreams: true })
    if (!out || out.length === 0) throw new Error('输出为空')
    const blob = new Blob([out], { type: 'application/pdf' })
    const name = `${getBaseName(file.value.name)}-decrypted.pdf`
    result.value = [{
      name,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size
    }]
  }, '解密失败')
  processing.value = false
}

function removeFile() {
  file.value = null
  status.value = 'idle'
  statusMsg.value = ''
  password.value = ''
  result.value = []
}
</script>

<template>
  <ToolLayout title="加密PDF解密助手" desc="忘记PDF密码的合法恢复工具，需输入正确密码才能解密" icon="⚿">
    <div class="nb-alert danger warning-banner">
      <strong>⚠ 法律警告</strong>
      <p>本工具仅用于 <strong>合法所有者</strong> 对自己拥有访问权限的 PDF 进行密码恢复。
      未经授权解密他人文件可能违反当地法律。使用本工具即表示您确认拥有合法使用权。</p>
    </div>

    <FileDrop accept=".pdf,application/pdf" :multiple="false"
              hint="选择加密的 PDF 文件 (仅您有权限访问的)"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
      </div>

      <div class="status-box mt-16" :class="status">
        <span v-if="status === 'testing'"><span class="nb-spinner"></span> {{ statusMsg }}</span>
        <span v-else>{{ statusMsg }}</span>
      </div>

      <div v-if="status === 'need-password' || status === 'fail'" class="mt-16">
        <label class="nb-label">PDF 密码</label>
        <input v-model="password" type="password" class="nb-input"
               placeholder="输入 PDF 密码" @keyup.enter="verifyPassword">
        <button class="nb-btn primary mt-16" @click="verifyPassword">🔑 验证密码</button>
      </div>

      <div v-if="status === 'ok'" class="mt-16">
        <button class="nb-btn primary lg block" @click="decrypt" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 解密中...</span>
          <span v-else>🔓 解密并导出无密码PDF</span>
        </button>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!file" class="nb-alert info mt-16">
      <strong>使用流程：</strong>
      <ol>
        <li>上传加密的 PDF</li>
        <li>输入您知道的密码进行验证</li>
        <li>验证通过后导出无密码版本</li>
      </ol>
      <strong>注意：</strong> 本工具不会尝试暴力破解密码。
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.warning-banner {
  margin-bottom: 16px;
  border-left: 8px solid var(--danger);
}
.warning-banner strong { display: block; margin-bottom: 6px; font-family: var(--font-mono); }
.warning-banner p { font-size: 12px; line-height: 1.5; }
.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.status-box {
  padding: 12px 16px;
  background: var(--paper-bg);
  border: 3px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
}
.status-box.ok { background: var(--neon); }
.status-box.fail, .status-box.need-password { background: var(--accent-soft); border-color: var(--accent); }
ol { margin: 6px 0 0 20px; }
</style>

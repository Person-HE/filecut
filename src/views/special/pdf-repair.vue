<script setup>
/**
 * 损坏PDF修复
 * - 用 pdf.js 容错加载
 * - 用 pdf-lib 重新保存为规范 PDF (重建xref, 修复文件头)
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
const processing = ref(false)
const result = ref([])
const diagnostics = ref(null)  // { headerOk, xrefOk, eofOk, pdfjsOk, pagesRecovered, errors[] }
const error = ref('')

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  file.value = f
  diagnostics.value = null
  result.value = []
  await diagnose()
}

async function diagnose() {
  if (!file.value) return
  error.value = ''
  const buf = await file.value.arrayBuffer()
  const u8 = new Uint8Array(buf)
  const diag = {
    headerOk: false,
    eofOk: false,
    pdfjsOk: false,
    pagesRecovered: 0,
    errors: [],
    info: []
  }

  // 1. 检查文件头
  const header = new TextDecoder().decode(u8.slice(0, 8))
  if (/^%PDF-1\.[0-9]/.test(header)) {
    diag.headerOk = true
    diag.info.push(`文件头正常: ${header.trim()}`)
  } else {
    diag.errors.push(`文件头异常: 应为 "%PDF-1.x"，实际为 "${header.replace(/\0/g, '?').trim()}"`)
  }

  // 2. 检查 EOF 标记 (%%EOF 应在最后 1024 字节内)
  const tail = new TextDecoder().decode(u8.slice(Math.max(0, u8.length - 1024)))
  if (/%%EOF\s*$/.test(tail.trim())) {
    diag.eofOk = true
    diag.info.push('EOF 标记正常')
  } else {
    diag.errors.push('缺少 %%EOF 标记或位置异常')
  }

  // 3. 检查 startxref
  if (tail.includes('startxref')) {
    diag.info.push('startxref 标记存在')
  } else {
    diag.errors.push('缺少 startxref 标记')
  }

  // 4. 用 pdf.js 尝试加载
  try {
    const doc = await pdfjs.loadPdf(file.value)
    diag.pdfjsOk = true
    diag.pagesRecovered = doc.numPages
    diag.info.push(`pdf.js 成功加载, 共 ${doc.numPages} 页`)
  } catch (e) {
    diag.errors.push('pdf.js 加载失败: ' + (e?.message || e))
  }

  diagnostics.value = diag
}

async function repair() {
  if (!file.value) { showError('请先选择文件'); return }
  processing.value = true
  error.value = ''
  result.value = []
  await safeRun(async () => {
    const buf = await file.value.arrayBuffer()
    let pdf = null
    try {
      // 用 pdf-lib 加载, 它有较强的容错能力
      pdf = await PDFDocument.load(buf, {
        ignoreEncryption: true,
        throwOnInvalidObject: false
      })
    } catch (e) {
      // 如果直接加载失败, 尝试修复文件头后重新加载
      const u8 = new Uint8Array(buf)
      // 查找 %PDF 位置 (有时前面有垃圾字节)
      let pdfStart = -1
      for (let i = 0; i < Math.min(1024, u8.length - 4); i++) {
        if (u8[i] === 0x25 && u8[i + 1] === 0x50 && u8[i + 2] === 0x44 && u8[i + 3] === 0x46) {
          pdfStart = i
          break
        }
      }
      if (pdfStart > 0) {
        const trimmed = u8.slice(pdfStart)
        pdf = await PDFDocument.load(trimmed.buffer, {
          ignoreEncryption: true,
          throwOnInvalidObject: false
        })
      } else {
        throw new Error('无法修复: ' + (e?.message || e))
      }
    }

    if (!pdf) throw new Error('修复失败: 未能解析 PDF')

    // 重新保存 - pdf-lib 会重建 xref 表, 规范化输出
    const out = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false
    })
    if (!out || out.length === 0) throw new Error('修复输出为空')

    const blob = new Blob([out], { type: 'application/pdf' })
    const name = `${getBaseName(file.value.name)}-repaired.pdf`
    result.value = [{
      name,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size
    }]
  }, '修复失败')
  processing.value = false
}

function removeFile() {
  file.value = null
  diagnostics.value = null
  result.value = []
}
</script>

<template>
  <ToolLayout title="损坏PDF修复" desc="修复结构损坏的PDF文件，重建交叉引用表与文件头" icon="✚">
    <FileDrop accept=".pdf,application/pdf" :multiple="false"
              hint="选择可能损坏的 PDF 文件"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
      </div>

      <div v-if="diagnostics" class="mt-16">
        <div class="nb-h3">诊断结果</div>
        <div class="diag-grid mt-16">
          <div class="diag-item" :class="{ ok: diagnostics.headerOk, fail: !diagnostics.headerOk }">
            <strong>文件头</strong>
            <span>{{ diagnostics.headerOk ? '✓ 正常' : '✕ 异常' }}</span>
          </div>
          <div class="diag-item" :class="{ ok: diagnostics.eofOk, fail: !diagnostics.eofOk }">
            <strong>EOF 标记</strong>
            <span>{{ diagnostics.eofOk ? '✓ 正常' : '✕ 异常' }}</span>
          </div>
          <div class="diag-item" :class="{ ok: diagnostics.pdfjsOk, fail: !diagnostics.pdfjsOk }">
            <strong>pdf.js 解析</strong>
            <span>{{ diagnostics.pdfjsOk ? `✓ ${diagnostics.pagesRecovered} 页` : '✕ 失败' }}</span>
          </div>
        </div>

        <div v-if="diagnostics.info.length" class="info-list mt-16">
          <div v-for="(i, idx) in diagnostics.info" :key="'i' + idx" class="info-line ok">ℹ {{ i }}</div>
        </div>
        <div v-if="diagnostics.errors.length" class="info-list mt-16">
          <div v-for="(e, idx) in diagnostics.errors" :key="'e' + idx" class="info-line fail">⚠ {{ e }}</div>
        </div>
      </div>

      <button v-if="diagnostics" class="nb-btn primary lg block mt-16" @click="repair" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 修复中...</span>
        <span v-else>🔧 尝试修复并导出</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!file" class="nb-alert info mt-16">
      <strong>常见可修复问题：</strong>
      <ul>
        <li>文件头有垃圾字节（如邮件附件下载错误）</li>
        <li>缺少 %%EOF 或 startxref 标记（下载未完成）</li>
        <li>交叉引用表 (xref) 损坏</li>
        <li>对象流异常</li>
      </ul>
      <strong>不可修复情况：</strong> 文件被截断、内容被覆盖、加密未提供密码。
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.file-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.diag-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
@media (max-width: 768px) { .diag-grid { grid-template-columns: 1fr; } }
.diag-item {
  padding: 12px;
  border: 3px solid var(--ink);
  background: var(--paper-bg);
  font-family: var(--font-mono);
  font-size: 13px;
}
.diag-item.ok { background: var(--neon); }
.diag-item.fail { background: var(--accent-soft); border-color: var(--accent); }
.diag-item strong { display: block; margin-bottom: 4px; }
.info-list {
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  padding: 8px 12px;
}
.info-line {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 0;
}
.info-line.ok { color: var(--ink); }
.info-line.fail { color: var(--danger); }
ul { margin: 6px 0 12px 20px; }
</style>

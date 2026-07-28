<script setup>
/**
 * ZIP压缩 - 多文件打包为ZIP
 * 用 JSZip，支持压缩级别、密码(可选，使用ZipCrypto)
 */
import { ref, computed } from 'vue'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName } from '../../utils/download.js'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])
const result = ref([])
const processing = ref(false)
const error = ref('')
const progress = ref(0)
const progressMsg = ref('')

const compressionLevel = ref(6)
const usePassword = ref(false)
const password = ref('')
const zipName = ref('archive.zip')

const totalSize = computed(() => files.value.reduce((s, f) => s + f.size, 0))

async function onFileSelect(selected) {
  if (Array.isArray(selected)) files.value = [...files.value, ...selected]
  else files.value = [...files.value, selected]
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

async function process() {
  if (!files.value.length) {
    showError('请先选择文件')
    return
  }
  if (usePassword.value && !password.value) {
    showError('请输入密码')
    return
  }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressMsg.value = '初始化...'

  await safeRun(async () => {
    const zip = new JSZip()
    const usedNames = new Set()

    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      progressMsg.value = `添加文件 ${i + 1}/${files.value.length}: ${f.name}`
      progress.value = Math.round((i / files.value.length) * 80)

      if (f.size === 0) {
        // 空文件也支持
        zip.file(f.name, new Uint8Array(0))
      } else {
        const buf = await readFileAsArrayBuffer(f)
        zip.file(f.name, buf)
      }
      usedNames.add(f.name)
    }

    progressMsg.value = '正在压缩...'
    progress.value = 90

    const options = {
      compression: 'DEFLATE',
      compressionOptions: { level: Math.max(0, Math.min(9, +compressionLevel.value || 6)) }
    }
    if (usePassword.value && password.value) {
      options.encryption = 'ZipCrypto'
      options.password = password.value
    }

    const blob = await zip.generateAsync(
      { type: 'blob', ...options },
      (meta) => {
        progress.value = 90 + Math.round(meta.percent * 0.1)
        progressMsg.value = `压缩中 ${Math.round(meta.percent)}%`
      }
    )

    if (!blob || blob.size === 0) throw new Error('压缩结果为空')

    progress.value = 100
    progressMsg.value = '完成'

    const outName = zipName.value || 'archive.zip'
    const url = URL.createObjectURL(blob)
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '压缩失败')

  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="ZIP压缩" desc="多文件打包为ZIP，支持压缩级别与密码" icon="+z">
    <FileDrop accept="*" :multiple="true" @select="onFileSelect" @error="showError"
              hint="支持任意类型文件，可多选" icon="🗜" />

    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div class="nb-card mt-16" v-if="files.length">
      <h3 class="nb-h3">压缩选项</h3>
      <div class="options-grid mt-16">
        <div>
          <label class="nb-label">输出文件名</label>
          <input v-model="zipName" class="nb-input" placeholder="archive.zip" />
        </div>
        <div>
          <label class="nb-label">压缩级别 (0=不压缩, 9=最高)</label>
          <select v-model.number="compressionLevel" class="nb-select">
            <option :value="0">0 - 仅存储</option>
            <option :value="1">1 - 最快</option>
            <option :value="3">3 - 快速</option>
            <option :value="6">6 - 标准</option>
            <option :value="9">9 - 最高</option>
          </select>
        </div>
        <div class="password-row">
          <label class="nb-label">
            <input type="checkbox" v-model="usePassword" /> 启用密码 (ZipCrypto)
          </label>
          <input v-if="usePassword" v-model="password" type="password" class="nb-input"
                 placeholder="输入密码" />
        </div>
      </div>
      <div class="summary mt-16">
        <span class="nb-tag">文件数: {{ files.length }}</span>
        <span class="nb-tag cyan">总大小: {{ formatBytes(totalSize) }}</span>
      </div>
    </div>

    <div class="mt-16" v-if="files.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> {{ progressMsg || '处理中...' }}</span>
        <span v-else>🗜 开始压缩</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-label">{{ progress }}% - {{ progressMsg }}</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.password-row { display: flex; flex-direction: column; gap: 6px; }
.summary { display: flex; gap: 8px; flex-wrap: wrap; }
.progress-label {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  color: var(--ink-soft);
}
</style>

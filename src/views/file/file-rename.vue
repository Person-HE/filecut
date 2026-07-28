<script setup>
/**
 * 文件批量重命名 - 模板 {name}/{ext}/{date}/{n}
 * 预览重命名结果, 输出ZIP
 */
import { ref, computed } from 'vue'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob, getBaseName, getExt } from '../../utils/download.js'
import { showError, safeRun, supportsFileSystemAccess } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const files = ref([])
const template = ref('{name}_{n}{ext}')
const startNum = ref(1)
const numPad = ref(3)
const dateFmt = ref('YYYYMMDD')
const caseMode = ref('original')
const processing = ref(false)
const result = ref([])
const error = ref('')

const hasFsApi = supportsFileSystemAccess()

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
  }
  files.value = [...files.value, ...arr]
}

function removeFile(idx) { files.value.splice(idx, 1) }

function formatDate(d, fmt) {
  const pad = (n) => String(n).padStart(2, '0')
  const map = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds())
  }
  let out = fmt
  for (const [k, v] of Object.entries(map)) {
    out = out.replace(new RegExp(k, 'g'), v)
  }
  return out
}

function applyCase(s, mode) {
  switch (mode) {
    case 'lower': return s.toLowerCase()
    case 'upper': return s.toUpperCase()
    case 'title': return s.replace(/\b\w/g, c => c.toUpperCase())
    default: return s
  }
}

const preview = computed(() => {
  const out = []
  const now = new Date()
  for (let i = 0; i < files.value.length; i++) {
    const f = files.value[i]
    const ext = '.' + getExt(f.name)
    const name = getBaseName(f.name)
    const n = String(startNum.value + i).padStart(numPad.value, '0')
    let newName = template.value
      .replace(/\{name\}/g, applyCase(name, caseMode.value))
      .replace(/\{ext\}/g, ext)
      .replace(/\{date\}/g, formatDate(now, dateFmt.value))
      .replace(/\{n\}/g, n)
    // 安全字符过滤
    newName = newName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    if (!newName) newName = `file-${n}${ext}`
    out.push({ original: f.name, renamed: newName, size: f.size })
  }
  return out
})

const hasConflict = computed(() => {
  const names = preview.value.map(p => p.renamed)
  return new Set(names).size !== names.length
})

async function process() {
  if (!files.value.length) { showError('请先选择文件'); return }
  if (hasConflict.value) { showError('存在重名冲突，请调整模板'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const zip = new JSZip()
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      const newName = preview.value[i].renamed
      const buf = await f.arrayBuffer()
      zip.file(newName, buf)
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }) // STORE 不重复压缩
    if (blob.size === 0) throw new Error('打包结果为空')
    result.value = [{
      name: `renamed-files-${Date.now()}.zip`,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size
    }]
  }, '打包失败')
  processing.value = false
}

async function downloadWithFsApi() {
  if (!hasFsApi) { showError('当前浏览器不支持 File System Access API'); return }
  if (hasConflict.value) { showError('存在重名冲突，请调整模板'); return }
  try {
    const dirHandle = await window.showDirectoryPicker()
    let written = 0
    for (let i = 0; i < files.value.length; i++) {
      const f = files.value[i]
      const newName = preview.value[i].renamed
      const fileHandle = await dirHandle.getFileHandle(newName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(f)
      await writable.close()
      written++
    }
    showError(`成功写入 ${written} 个文件到 ${dirHandle.name}`)
  } catch (e) {
    if (e?.name !== 'AbortError') showError('写入失败: ' + (e?.message || e))
  }
}

const templateHelp = [
  { tag: '{name}', desc: '原文件名(无扩展名)' },
  { tag: '{ext}', desc: '扩展名(含点)' },
  { tag: '{n}', desc: '序号(可补零)' },
  { tag: '{date}', desc: '当前日期' }
]
</script>

<template>
  <ToolLayout title="文件批量重命名" desc="模板化批量重命名，预览结果，输出 ZIP 或直接写入文件夹" icon="#">
    <FileDrop accept="*" :multiple="true" hint="支持任意文件批量重命名"
              @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div v-if="files.length" class="mt-16 nb-card">
      <label class="nb-label">重命名模板</label>
      <input v-model="template" class="nb-input" placeholder="{name}_{n}{ext}">
      <div class="template-help mt-16">
        <span v-for="h in templateHelp" :key="h.tag" class="nb-tag cyan">{{ h.tag }}</span>
        <span class="help-text">= 用于变量替换</span>
      </div>

      <div class="nb-grid cols-4 mt-16">
        <div>
          <label class="nb-label">起始序号</label>
          <input type="number" v-model.number="startNum" min="0" class="nb-input">
        </div>
        <div>
          <label class="nb-label">序号位数</label>
          <input type="number" v-model.number="numPad" min="1" max="10" class="nb-input">
        </div>
        <div>
          <label class="nb-label">日期格式</label>
          <select v-model="dateFmt" class="nb-select">
            <option value="YYYYMMDD">YYYYMMDD</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="YYYYMMDD-HHmmss">YYYYMMDD-HHmmss</option>
            <option value="YYYYMM">YYYYMM</option>
          </select>
        </div>
        <div>
          <label class="nb-label">大小写</label>
          <select v-model="caseMode" class="nb-select">
            <option value="original">原样</option>
            <option value="lower">小写</option>
            <option value="upper">大写</option>
            <option value="title">首字母大写</option>
          </select>
        </div>
      </div>

      <div class="mt-16 buttons">
        <button class="nb-btn primary lg" @click="process" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 打包中...</span>
          <span v-else>📦 输出 ZIP</span>
        </button>
        <button v-if="hasFsApi" class="nb-btn neon lg" @click="downloadWithFsApi">
          📁 直接写入文件夹
        </button>
      </div>
    </div>

    <div v-if="preview.length" class="mt-16 nb-card">
      <div class="preview-head">
        <span class="nb-h3">重命名预览</span>
        <span v-if="hasConflict" class="nb-tag accent">⚠ 存在重名冲突</span>
      </div>
      <table class="preview-table mt-16">
        <thead>
          <tr><th>#</th><th>原文件名</th><th>→</th><th>新文件名</th><th>大小</th></tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in preview" :key="i">
            <td>{{ i + 1 }}</td>
            <td class="orig">{{ p.original }}</td>
            <td>→</td>
            <td class="renamed">{{ p.renamed }}</td>
            <td>{{ formatBytes(p.size) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>模板示例：</strong> {name}_v2{ext} → photo_v2.jpg · {date}_{n}{ext} → 20260101_001.jpg · IMG_{n}{ext} → IMG_001.jpg
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.template-help { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.help-text { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); }
.buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.preview-head { display: flex; justify-content: space-between; align-items: center; }
.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--paper-bg);
}
.preview-table th, .preview-table td {
  border: 2px solid var(--ink);
  padding: 6px 8px;
  text-align: left;
}
.preview-table th { background: var(--ink); color: var(--neon); }
.preview-table td.orig { color: var(--ink-soft); }
.preview-table td.renamed { color: var(--accent); font-weight: 600; }
</style>

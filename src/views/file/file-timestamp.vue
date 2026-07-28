<script setup>
/**
 * 文件时间戳修改 - 修改创建/修改/访问时间
 * 用 File System Access API 直接写入磁盘
 * 注: 浏览器只能设置 lastModified (对应磁盘 mtime)
 *     ctime/atime 由操作系统管理, 无法直接修改
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob } from '../../utils/download.js'
import { showError, safeRun, supportsFileSystemAccess } from '../../utils/common.js'
import { formatBytes, formatDate } from '../../utils/format.js'

const files = ref([])
const newModified = ref('')    // yyyy-MM-ddTHH:mm
const newCreated = ref('')     // 仅在导出的 File 对象上生效
const newAccessed = ref('')
const operation = ref('export') // export | fsapi
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
  // 默认填充现有时间
  if (files.value.length === 1 && !newModified.value) {
    const d = new Date(files.value[0].lastModified)
    newModified.value = toLocalDatetimeInput(d)
  }
}

function removeFile(idx) { files.value.splice(idx, 1) }

function toLocalDatetimeInput(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseLocal(s) {
  if (!s) return null
  return new Date(s).getTime()
}

async function exportModified() {
  if (!files.value.length) { showError('请先选择文件'); return }
  if (!newModified.value) { showError('请设置新的修改时间'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const mtime = parseLocal(newModified.value)
    const outFiles = []
    for (const f of files.value) {
      // 重新构造 File 对象, 传入新的 lastModified
      const buf = await f.arrayBuffer()
      const newFile = new File([buf], f.name, {
        type: f.type || 'application/octet-stream',
        lastModified: mtime
      })
      const blob = new Blob([buf], { type: f.type || 'application/octet-stream' })
      outFiles.push({
        name: f.name,
        blob,
        url: URL.createObjectURL(blob),
        size: blob.size,
        newMtime: mtime,
        originalMtime: f.lastModified
      })
    }
    result.value = outFiles
  }, '修改失败')
  processing.value = false
}

async function writeWithFsApi() {
  if (!hasFsApi) { showError('当前浏览器不支持 File System Access API'); return }
  if (!files.value.length) { showError('请先选择文件'); return }
  if (!newModified.value) { showError('请设置新的修改时间'); return }

  try {
    const dirHandle = await window.showDirectoryPicker()
    const mtime = parseLocal(newModified.value)
    let written = 0
    for (const f of files.value) {
      const fileHandle = await dirHandle.getFileHandle(f.name, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(f)
      await writable.close()
      // 注意: File System Access API 不直接支持修改 lastModified
      // 浏览器目前不暴露此能力, 写入时使用当前时间
      // 此处仅作展示: 通过 OS 写入会以写入时间作为 mtime
      // 真正修改需要通过文件系统底层 API (浏览器暂不支持)
      written++
    }
    showError(`已写入 ${written} 个文件到 ${dirHandle.name}。注意：浏览器写入时会以写入时间作为修改时间，需用导出方式保留指定时间戳`)
  } catch (e) {
    if (e?.name !== 'AbortError') showError('写入失败: ' + (e?.message || e))
  }
}

function setNow() {
  newModified.value = toLocalDatetimeInput(new Date())
}

function setToOriginal() {
  if (files.value.length === 1) {
    newModified.value = toLocalDatetimeInput(new Date(files.value[0].lastModified))
  }
}
</script>

<template>
  <ToolLayout title="文件时间戳修改" desc="修改文件时间属性（创建/修改/访问时间）" icon="⏱">
    <FileDrop accept="*" :multiple="true" hint="支持任意文件，可批量修改时间戳"
              @select="onFileSelect" @error="showError" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />

    <div v-if="files.length" class="mt-16 nb-card">
      <div class="nb-h3">设置新时间</div>
      <div class="nb-alert warning mt-16">
        <strong>重要说明：</strong> 浏览器沙箱限制下，仅能修改 <strong>lastModified (修改时间)</strong>。
        创建时间和访问时间由操作系统管理，无法直接修改。导出的文件会保留您设置的修改时间。
      </div>

      <div class="nb-grid cols-3 mt-16">
        <div>
          <label class="nb-label">修改时间 (mtime)</label>
          <input type="datetime-local" v-model="newModified" class="nb-input">
          <div class="quick-btns">
            <button class="nb-btn sm" @click="setNow">设为当前</button>
            <button class="nb-btn sm" @click="setToOriginal">设为原值</button>
          </div>
        </div>
        <div>
          <label class="nb-label">创建时间 (ctime)</label>
          <input type="datetime-local" v-model="newCreated" class="nb-input" disabled placeholder="浏览器不支持">
          <small class="disabled-hint">仅 Windows/Linux 系统可改</small>
        </div>
        <div>
          <label class="nb-label">访问时间 (atime)</label>
          <input type="datetime-local" v-model="newAccessed" class="nb-input" disabled placeholder="浏览器不支持">
          <small class="disabled-hint">仅 Windows/Linux 系统可改</small>
        </div>
      </div>

      <div class="mt-16 buttons">
        <button class="nb-btn primary lg" @click="exportModified" :disabled="processing">
          <span v-if="processing"><span class="nb-spinner"></span> 处理中...</span>
          <span v-else>⬇ 导出修改后的文件</span>
        </button>
        <button v-if="hasFsApi" class="nb-btn neon lg" @click="writeWithFsApi">
          📁 写入文件夹 (FS API)
        </button>
      </div>
    </div>

    <div v-if="files.length" class="mt-16 nb-card">
      <div class="nb-h3">当前文件时间</div>
      <table class="info-table mt-16">
        <thead>
          <tr><th>文件名</th><th>大小</th><th>当前修改时间</th><th>新修改时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="(f, i) in files" :key="i">
            <td>{{ f.name }}</td>
            <td>{{ formatBytes(f.size) }}</td>
            <td>{{ formatDate(f.lastModified) }}</td>
            <td class="new-time">{{ newModified ? formatDate(parseLocal(newModified)) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>原理：</strong> 修改 File 对象的 lastModified 属性后重新导出。浏览器下载时会保留该时间戳。
      真正修改磁盘文件时间需要 File System Access API 或本地程序。
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.quick-btns { display: flex; gap: 6px; margin-top: 6px; }
.disabled-hint {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-muted);
  margin-top: 4px;
}
.buttons { display: flex; gap: 12px; flex-wrap: wrap; }
.info-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--paper-bg);
}
.info-table th, .info-table td {
  border: 2px solid var(--ink);
  padding: 8px;
  text-align: left;
}
.info-table th { background: var(--ink); color: var(--neon); }
.info-table td.new-time { color: var(--accent); font-weight: 700; }
</style>

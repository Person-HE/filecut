<script setup>
/**
 * PDF表单填写 - 用 pdf-lib getForm 列出所有表单字段,提供UI让用户填写
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
const fields = ref([])  // [{ name, type, value, options }]
const fieldValues = ref({})  // { name: value }

async function onFileSelect(selected) {
  files.value = Array.isArray(selected) ? [...selected] : [selected]
  needPassword.value = false; password.value = ''
  fields.value = []; fieldValues.value = {}
  if (files.value.length) {
    await safeRun(async () => {
      const buf = await files.value[0].arrayBuffer()
      const doc = await loadPdfLib(buf)
      const form = doc.getForm()
      const allFields = form.getFields()
      if (!allFields.length) {
        error.value = '该PDF不包含交互表单字段'
        return
      }
      fields.value = allFields.map(f => {
        const type = f.constructor.name
        let options = []
        let currentValue = ''
        try {
          if (type === 'PDFCheckBox') {
            currentValue = f.isChecked() ? 'true' : 'false'
            options = ['true', 'false']
          } else if (type === 'PDFDropdown' || type === 'PDFRadioGroup') {
            options = f.getOptions()
            currentValue = f.acroField.getOpt().map(o => o.toString()) || []
          } else {
            currentValue = f.getText?.() || ''
          }
        } catch (e) { /* skip */ }
        return { name: f.getName(), type, options, currentValue }
      })
      // 初始化字段值
      const initVals = {}
      for (const f of fields.value) {
        initVals[f.name] = f.currentValue || ''
      }
      fieldValues.value = initVals
    }, '加载表单失败')
  }
}
function removeFile(idx) {
  files.value.splice(idx, 1)
  fields.value = []; fieldValues.value = {}
}

async function process() {
  if (!files.value.length) { showError('请先选择PDF'); return }
  if (!fields.value.length) { showError('未发现表单字段'); return }
  error.value = ''; result.value = []; processing.value = true; progress.value = 0
  progressText.value = '加载PDF中...'
  await safeRun(async () => {
    const file = files.value[0]
    const doc = await loadPdfLib(file)
    const form = doc.getForm()
    let font
    try {
      font = await embedChineseFont(doc)
      form.updateFieldAppearances(font)
    } catch (e) { /* skip */ }

    progressText.value = '填写表单中...'
    for (const f of fields.value) {
      const value = fieldValues.value[f.name]
      if (value === undefined || value === null) continue
      try {
        const field = form.getField(f.name)
        const type = f.type
        if (type === 'PDFCheckBox') {
          const cb = form.getCheckBox(f.name)
          if (value === 'true' || value === true) cb.check()
          else cb.uncheck()
        } else if (type === 'PDFDropdown') {
          form.getDropdown(f.name).select(value)
        } else if (type === 'PDFRadioGroup') {
          form.getRadioGroup(f.name).select(value)
        } else if (type === 'PDFTextField') {
          form.getTextField(f.name).setText(String(value))
        } else if (type === 'PDFButton') {
          // 跳过按钮
        }
      } catch (e) {
        console.warn('字段填写失败:', f.name, e)
      }
    }
    progress.value = 80
    progressText.value = '生成PDF中...'
    const bytes = await doc.save()
    const blob = new Blob([bytes], { type: 'application/pdf' })
    if (!blob.size) throw new Error('生成PDF失败')
    result.value = [{
      name: `${getBaseName(file.name)}_filled.pdf`,
      blob, url: URL.createObjectURL(blob), size: blob.size
    }]
    progress.value = 100
    progressText.value = '完成'
  }, 'PDF表单填写失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="PDF表单填写" desc="填写PDF交互表单字段" icon="▤">
    <FileDrop accept=".pdf,application/pdf" :multiple="false" @select="onFileSelect" @error="showError" hint="单文件，需含交互表单" />
    <FileList :files="files" @remove="removeFile" class="mt-16" v-if="files.length" />
    <div class="mt-16" v-if="needPassword">
      <label class="nb-label">PDF已加密，请输入密码：</label>
      <input class="nb-input" type="password" v-model="password" placeholder="PDF密码" style="max-width:320px" />
    </div>

    <div v-if="fields.length" class="mt-16">
      <h3 class="nb-h3 mb-8">表单字段 ({{ fields.length }} 个)</h3>
      <div class="form-fields">
        <div v-for="f in fields" :key="f.name" class="form-field-item">
          <label class="nb-label">
            {{ f.name }}
            <span class="nb-tag sm">{{ f.type.replace('PDF', '') }}</span>
          </label>
          <div v-if="f.type === 'PDFCheckBox'">
            <select class="nb-select" v-model="fieldValues[f.name]">
              <option value="false">未勾选</option>
              <option value="true">勾选</option>
            </select>
          </div>
          <div v-else-if="f.type === 'PDFDropdown' || f.type === 'PDFRadioGroup'">
            <select class="nb-select" v-model="fieldValues[f.name]">
              <option value="">(不选)</option>
              <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div v-else>
            <input class="nb-input" v-model="fieldValues[f.name]" :placeholder="`输入${f.name}`" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-16" v-if="fields.length">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 生成中...</span>
        <span v-else>填写并生成PDF</span>
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

<style scoped>
.form-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.form-field-item {
  background: var(--paper-card);
  border: 2px solid var(--ink);
  padding: 12px;
  box-shadow: 2px 2px 0 var(--ink);
}
</style>

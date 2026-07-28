<script setup>
/**
 * EXIF 查看编辑
 * - 用 exifr 读取EXIF
 * - 用 piexifjs 修改JPEG的EXIF
 * - 显示相机型号、GPS、时间等
 */
import { ref, onUnmounted, computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { readFileAsDataURL, readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { replaceExt } from '../../utils/download.js'
import exifr from 'exifr'
import piexif from 'piexifjs'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

const exifData = ref(null)
const exifGroups = ref([])  // [{ group, items: [{key, value, label}] }]
const previewUrl = ref('')

// 编辑字段
const editMode = ref(false)
const editValues = ref({})  // { 'Make': 'Canon', ... }

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  exifData.value = null
  exifGroups.value = []
  editValues.value = {}
  editMode.value = false
  error.value = ''
  cleanupUrls()
  if (selected) {
    previewUrl.value = URL.createObjectURL(selected)
    objectUrls.value.push(previewUrl.value)
    loadExif()
  }
}

function removeFile() {
  file.value = null
  result.value = []
  exifData.value = null
  exifGroups.value = []
  editValues.value = {}
  previewUrl.value = ''
  cleanupUrls()
}

function cleanupUrls() {
  objectUrls.value.forEach(u => URL.revokeObjectURL(u))
  objectUrls.value = []
}

onUnmounted(cleanupUrls)

const EXIF_LABELS = {
  Make: '相机制造商',
  Model: '相机型号',
  LensModel: '镜头型号',
  LensMake: '镜头制造商',
  Software: '软件',
  DateTimeOriginal: '拍摄时间',
  CreateDate: '创建时间',
  ModifyDate: '修改时间',
  ExposureTime: '曝光时间',
  FNumber: '光圈值',
  ISO: 'ISO感光度',
  ISOSpeedRatings: 'ISO感光度',
  FocalLength: '焦距',
  FocalLengthIn35mmFormat: '35mm等效焦距',
  ExposureCompensation: '曝光补偿',
  WhiteBalance: '白平衡',
  Flash: '闪光灯',
  ExposureMode: '曝光模式',
  MeteringMode: '测光模式',
  ExposureProgram: '拍摄模式',
  GPSLatitude: 'GPS纬度',
  GPSLongitude: 'GPS经度',
  GPSAltitude: 'GPS海拔',
  ImageWidth: '图片宽度',
  ImageHeight: '图片高度',
  BitsPerSample: '色彩位深',
  ColorSpace: '色彩空间',
  Orientation: '方向',
  Artist: '作者',
  Copyright: '版权'
}

function formatValue(v) {
  if (v === null || v === undefined) return '-'
  if (v instanceof Date) return v.toLocaleString()
  if (typeof v === 'number') return Number.isInteger(v) ? v.toString() : v.toFixed(2)
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.join(', ')
    return JSON.stringify(v)
  }
  return String(v)
}

function getGroupLabel(group) {
  const map = {
    image: '基础信息',
    exif: '拍摄参数',
    gps: 'GPS位置',
    photoshop: 'Photoshop',
    iptc: 'IPTC',
    xmp: 'XMP'
  }
  return map[group?.toLowerCase?.()] || group
}

async function loadExif() {
  if (!file.value) return
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    // 解析所有EXIF
    const data = await exifr.parse(file.value, { tiff: true, ifd0: true, exif: true, gps: true, xmp: true, iptc: true })
    if (!data) {
      error.value = '未找到EXIF信息'
      return
    }
    exifData.value = data

    // 分组
    const groups = {}
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue
      // 简单分组
      let group = 'image'
      if (key.startsWith('GPS')) group = 'gps'
      else if (['ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings', 'FocalLength', 'FocalLengthIn35mmFormat',
               'ExposureCompensation', 'WhiteBalance', 'Flash', 'ExposureMode', 'MeteringMode', 'ExposureProgram',
               'DateTimeOriginal', 'CreateDate', 'ModifyDate', 'LensModel', 'LensMake'].includes(key)) {
        group = 'exif'
      }

      if (!groups[group]) groups[group] = []
      groups[group].push({
        key,
        value: formatValue(value),
        rawValue: value,
        label: EXIF_LABELS[key] || key
      })
    }
    exifGroups.value = Object.entries(groups).map(([group, items]) => ({ group, items }))
  }, '读取EXIF失败')

  processing.value = false
}

function startEdit() {
  if (!exifData.value) return
  editValues.value = {}
  for (const [k, v] of Object.entries(exifData.value)) {
    if (v !== null && v !== undefined) editValues.value[k] = formatValue(v)
  }
  editMode.value = true
}

function cancelEdit() {
  editMode.value = false
  editValues.value = {}
}

async function saveEdit() {
  if (!file.value) return
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    const ext = (file.value.name.split('.').pop() || '').toLowerCase()
    if (ext !== 'jpg' && ext !== 'jpeg') {
      throw new Error('仅支持 JPG/JPEG 格式的 EXIF 编辑')
    }

    // 读取为DataURL
    const dataUrl = await readFileAsDataURL(file.value)
    // 提取 EXIF 字典
    let exifObj
    try {
      exifObj = piexif.load(dataUrl)
    } catch (e) {
      exifObj = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, Interop: {}, thumbnail: null }
    }

    // 应用编辑值
    for (const [k, v] of Object.entries(editValues.value)) {
      const tagType = getTagType(k)
      if (tagType && exifObj[tagType]) {
        const tagId = piexif.TagName[k]?.id
        if (tagId !== undefined) {
          exifObj[tagType][tagId] = parseValueForTag(k, v, exifObj[tagType][tagId])
        }
      }
    }

    // 写回
    const exifBytes = piexif.dump(exifObj)
    const newDataUrl = piexif.insert(exifBytes, dataUrl)

    // 转 Blob
    const base64 = newDataUrl.split(',')[1]
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: 'image/jpeg' })
    if (!blob.size) throw new Error('写入失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_exif.jpg')
    result.value = [{ name: outName, blob, url, size: blob.size }]

    editMode.value = false
  }, '保存EXIF失败')

  processing.value = false
}

function getTagType(tagName) {
  const gpsKeys = ['GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef']
  if (gpsKeys.includes(tagName)) return 'GPS'
  const exifKeys = ['ExposureTime', 'FNumber', 'ISO', 'ISOSpeedRatings', 'FocalLength', 'DateTimeOriginal', 'CreateDate', 'LensModel', 'LensMake', 'ExposureCompensation', 'WhiteBalance', 'Flash', 'ExposureMode', 'MeteringMode', 'ExposureProgram']
  if (exifKeys.includes(tagName)) return 'Exif'
  return '0th'
}

function parseValueForTag(tagName, newValue, oldValue) {
  if (newValue === '' || newValue === null) return null
  // 数字类型
  if (typeof oldValue === 'number') {
    const n = parseFloat(newValue)
    return isNaN(n) ? oldValue : n
  }
  // 日期类型
  if (oldValue instanceof Date) {
    const d = new Date(newValue)
    return isNaN(d.getTime()) ? oldValue : d
  }
  return newValue
}

async function clearAllExif() {
  if (!file.value) return
  error.value = ''
  processing.value = true

  await safeRun(async () => {
    const ext = (file.value.name.split('.').pop() || '').toLowerCase()
    if (ext !== 'jpg' && ext !== 'jpeg') {
      throw new Error('仅支持 JPG/JPEG 格式的 EXIF 清除')
    }
    const dataUrl = await readFileAsDataURL(file.value)
    // 创建空 EXIF
    const emptyExif = piexif.dump({ '0th': {}, Exif: {}, GPS: {}, '1st': {}, Interop: {}, thumbnail: null })
    const newDataUrl = piexif.insert(emptyExif, dataUrl)

    const base64 = newDataUrl.split(',')[1]
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    const blob = new Blob([arr], { type: 'image/jpeg' })
    if (!blob.size) throw new Error('清除失败')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = replaceExt(file.value.name, '_no_exif.jpg')
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, '清除EXIF失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="EXIF查看编辑" desc="查看相机参数/GPS/时间，可编辑或清除" icon="ⓘ">
    <FileDrop accept=".jpg,.jpeg,.png,.tiff,.heic,image/*"
              :multiple="false" hint="支持 JPG/PNG/TIFF/HEIC"
              @select="onFileSelect" @error="showError" />

    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="processing" class="nb-alert info mt-16">
      <span class="nb-spinner"></span> 处理中...
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <!-- 预览图 -->
    <div v-if="previewUrl" class="nb-card mt-16">
      <img :src="previewUrl" style="max-height:300px; margin:0 auto; display:block; border:3px solid var(--ink);" />
    </div>

    <!-- EXIF 信息 -->
    <div v-if="exifGroups.length" class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">EXIF 信息</h3>
        <div v-if="!editMode" style="display:flex; gap:8px;">
          <button class="nb-btn sm" @click="startEdit">编辑</button>
          <button class="nb-btn sm danger" @click="clearAllExif">清除全部</button>
        </div>
        <div v-else style="display:flex; gap:8px;">
          <button class="nb-btn sm primary" @click="saveEdit">保存</button>
          <button class="nb-btn sm" @click="cancelEdit">取消</button>
        </div>
      </div>

      <div v-for="g in exifGroups" :key="g.group" class="mt-16">
        <h4 class="nb-h3" style="color:var(--accent);">{{ getGroupLabel(g.group) }}</h4>
        <div class="exif-table">
          <div v-for="item in g.items" :key="item.key" class="exif-row">
            <span class="exif-label">{{ item.label }}</span>
            <span v-if="!editMode" class="exif-value">{{ item.value }}</span>
            <input v-else v-model="editValues[item.key]" class="nb-input exif-input" />
          </div>
        </div>
      </div>
    </div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.exif-table {
  border: 3px solid var(--ink);
  background: var(--paper-card);
}
.exif-row {
  display: grid;
  grid-template-columns: 200px 1fr;
  border-bottom: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
}
.exif-row:last-child { border-bottom: none; }
.exif-label {
  padding: 8px 12px;
  background: var(--paper-darker);
  border-right: 2px solid var(--ink);
  font-weight: 600;
  color: var(--ink);
}
.exif-value {
  padding: 8px 12px;
  word-break: break-all;
}
.exif-input {
  border: none;
  box-shadow: none;
  border-left: 2px solid var(--ink);
}
.exif-input:focus { box-shadow: inset 0 0 0 2px var(--accent); }
</style>

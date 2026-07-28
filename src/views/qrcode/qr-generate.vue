<script setup>
/**
 * 二维码生成 - 文本/URL/名片(vCard)/WiFi/邮箱
 * 输出 PNG/SVG, 可调尺寸/纠错级别/颜色/边距
 */
import { ref, computed, watch } from 'vue'
import QRCode from 'qrcode'
import ToolLayout from '../../components/ToolLayout.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { downloadBlob } from '../../utils/download.js'

const types = [
  { id: 'text',  label: '纯文本', icon: 'T' },
  { id: 'url',   label: 'URL',   icon: 'U' },
  { id: 'vcard', label: '名片',  icon: 'C' },
  { id: 'wifi',  label: 'WiFi',  icon: 'W' },
  { id: 'email', label: '邮箱',  icon: 'E' }
]

const ecLevels = [
  { id: 'L', label: 'L (7%)' },
  { id: 'M', label: 'M (15%)' },
  { id: 'Q', label: 'Q (25%)' },
  { id: 'H', label: 'H (30%)' }
]

const type = ref('text')
const size = ref(320)
const ec = ref('M')
const fg = ref('#1a1a1a')
const bg = ref('#fffaf0')
const margin = ref(2)
const format = ref('png')

// 各类型字段
const text = ref('Hello, FileCut!')
const url = ref('https://github.com')
const vcard = ref({ name: '张三', phone: '13800138000', email: 'zhangsan@example.com', org: '示例公司', title: '工程师' })
const wifi = ref({ ssid: 'MyWiFi', password: 'password123', encryption: 'WPA', hidden: false })
const email = ref({ to: 'someone@example.com', subject: '主题', body: '正文内容' })

const payload = computed(() => {
  switch (type.value) {
    case 'text': return text.value || ' '
    case 'url':  return url.value || ' '
    case 'vcard': {
      const v = vcard.value
      const lines = ['BEGIN:VCARD', 'VERSION:3.0']
      if (v.name) lines.push(`FN:${v.name}`)
      if (v.org) lines.push(`ORG:${v.org}`)
      if (v.title) lines.push(`TITLE:${v.title}`)
      if (v.phone) lines.push(`TEL:${v.phone}`)
      if (v.email) lines.push(`EMAIL:${v.email}`)
      lines.push('END:VCARD')
      return lines.join('\n')
    }
    case 'wifi': {
      const w = wifi.value
      const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1')
      const t = w.encryption === 'nopass' ? 'nopass' : w.encryption
      let s = `WIFI:T:${t};S:${esc(w.ssid)};`
      if (t !== 'nopass') s += `P:${esc(w.password)};`
      if (w.hidden) s += 'H:true;'
      s += ';'
      return s
    }
    case 'email': {
      const e = email.value
      const params = []
      if (e.subject) params.push(`subject=${encodeURIComponent(e.subject)}`)
      if (e.body) params.push(`body=${encodeURIComponent(e.body)}`)
      return `mailto:${e.to}${params.length ? '?' + params.join('&') : ''}`
    }
    default: return ' '
  }
})

const previewUrl = ref('')
const previewError = ref('')

async function regenerate() {
  previewError.value = ''
  try {
    if (format.value === 'svg') {
      const svg = await QRCode.toString(payload.value, {
        errorCorrectionLevel: ec.value,
        margin,
        color: { dark: fg.value, light: bg.value }
      })
      previewUrl.value = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    } else {
      previewUrl.value = await QRCode.toDataURL(payload.value, {
        errorCorrectionLevel: ec.value,
        margin,
        width: Math.max(64, size.value),
        color: { dark: fg.value, light: bg.value }
      })
    }
  } catch (e) {
    previewUrl.value = ''
    previewError.value = e?.message || '生成失败'
  }
}

watch([payload, size, ec, fg, bg, margin, format], regenerate, { immediate: true })

const result = ref([])

async function download() {
  if (!previewUrl.value) {
    showError('二维码尚未生成')
    return
  }
  await safeRun(async () => {
    const res = await fetch(previewUrl.value)
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('生成的文件为空')
    const ext = format.value === 'svg' ? 'svg' : 'png'
    downloadBlob(blob, `qrcode-${type.value}-${Date.now()}.${ext}`)
    result.value = [{ name: `qrcode-${type.value}.${ext}`, blob, url: URL.createObjectURL(blob), size: blob.size }]
  }, '下载失败')
}
</script>

<template>
  <ToolLayout title="二维码生成" desc="生成文本/URL/名片/WiFi/邮箱二维码，支持自定义颜色与尺寸" icon="▢">
    <div class="qr-grid">
      <div class="nb-card qr-left">
        <label class="nb-label">类型</label>
        <div class="type-tabs">
          <button v-for="t in types" :key="t.id"
                  class="nb-btn sm"
                  :class="{ primary: type === t.id }"
                  @click="type = t.id">{{ t.icon }} {{ t.label }}</button>
        </div>

        <div class="mt-16 form-block">
          <div v-if="type === 'text'">
            <label class="nb-label">文本内容</label>
            <textarea v-model="text" class="nb-textarea" rows="3" placeholder="输入任意文本"></textarea>
          </div>
          <div v-else-if="type === 'url'">
            <label class="nb-label">URL 地址</label>
            <input v-model="url" class="nb-input" placeholder="https://example.com">
          </div>
          <div v-else-if="type === 'vcard'" class="nb-grid cols-2">
            <div><label class="nb-label">姓名</label><input v-model="vcard.name" class="nb-input"></div>
            <div><label class="nb-label">电话</label><input v-model="vcard.phone" class="nb-input"></div>
            <div><label class="nb-label">邮箱</label><input v-model="vcard.email" class="nb-input"></div>
            <div><label class="nb-label">公司</label><input v-model="vcard.org" class="nb-input"></div>
            <div><label class="nb-label">职位</label><input v-model="vcard.title" class="nb-input"></div>
          </div>
          <div v-else-if="type === 'wifi'" class="nb-grid cols-2">
            <div><label class="nb-label">SSID</label><input v-model="wifi.ssid" class="nb-input"></div>
            <div><label class="nb-label">密码</label><input v-model="wifi.password" class="nb-input" :disabled="wifi.encryption === 'nopass'"></div>
            <div>
              <label class="nb-label">加密方式</label>
              <select v-model="wifi.encryption" class="nb-select">
                <option value="WPA">WPA/WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">无密码</option>
              </select>
            </div>
            <div class="check-line">
              <label><input type="checkbox" v-model="wifi.hidden"> 隐藏网络</label>
            </div>
          </div>
          <div v-else-if="type === 'email'" class="col gap-8">
            <div><label class="nb-label">收件人</label><input v-model="email.to" class="nb-input"></div>
            <div><label class="nb-label">主题</label><input v-model="email.subject" class="nb-input"></div>
            <div><label class="nb-label">正文</label><textarea v-model="email.body" class="nb-textarea" rows="3"></textarea></div>
          </div>
        </div>

        <div class="mt-16 nb-grid cols-2">
          <div>
            <label class="nb-label">尺寸 ({{ size }}px)</label>
            <input type="range" v-model.number="size" min="128" max="1024" step="16" class="range-input">
          </div>
          <div>
            <label class="nb-label">纠错级别</label>
            <select v-model="ec" class="nb-select">
              <option v-for="e in ecLevels" :key="e.id" :value="e.id">{{ e.label }}</option>
            </select>
          </div>
          <div>
            <label class="nb-label">前景色</label>
            <input type="color" v-model="fg" class="color-input">
          </div>
          <div>
            <label class="nb-label">背景色</label>
            <input type="color" v-model="bg" class="color-input">
          </div>
          <div>
            <label class="nb-label">边距 ({{ margin }})</label>
            <input type="range" v-model.number="margin" min="0" max="10" step="1" class="range-input">
          </div>
          <div>
            <label class="nb-label">输出格式</label>
            <select v-model="format" class="nb-select">
              <option value="png">PNG (位图)</option>
              <option value="svg">SVG (矢量)</option>
            </select>
          </div>
        </div>
      </div>

      <div class="nb-card qr-right">
        <div class="nb-h3">实时预览</div>
        <div class="preview-box">
          <img v-if="previewUrl" :src="previewUrl" alt="QR Preview" class="qr-preview">
          <div v-else-if="previewError" class="nb-alert danger mt-16">{{ previewError }}</div>
          <div v-else class="nb-spinner"></div>
        </div>
        <button class="nb-btn primary lg block mt-16" @click="download">⬇ 下载二维码 ({{ format.toUpperCase() }})</button>
        <div class="nb-alert info mt-16">
          <strong>提示：</strong> 纠错级别越高，二维码越复杂但容错性越强。前景色与背景色需有足够对比度。
        </div>
      </div>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.qr-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
}
@media (max-width: 900px) {
  .qr-grid { grid-template-columns: 1fr; }
}
.type-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.form-block { min-height: 120px; }
.check-line { display: flex; align-items: center; padding-top: 28px; }
.check-line label { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 13px; cursor: pointer; }
.range-input { width: 100%; }
.color-input {
  width: 100%; height: 42px;
  padding: 4px;
  background: var(--paper-card);
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink);
  cursor: pointer;
}
.preview-box {
  margin-top: 12px;
  background: var(--paper-bg);
  border: 3px dashed var(--ink);
  padding: 24px;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr-preview {
  max-width: 100%;
  max-height: 360px;
  border: 3px solid var(--ink);
  background: var(--paper-card);
}
</style>

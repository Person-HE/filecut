<script setup>
/**
 * 批量二维码生成
 * 输入多行文本(每行一个) -> 批量生成二维码 -> 打包ZIP
 */
import { ref, computed } from 'vue'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { downloadBlob } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'

const linesText = ref('https://github.com\nhttps://google.com\nHello World\n文件1\n文件2')
const size = ref(256)
const ec = ref('M')
const fg = ref('#1a1a1a')
const bg = ref('#fffaf0')
const margin = ref(2)
const fileNameMode = ref('index') // index | content
const processing = ref(false)
const progress = ref(0)
const progressMax = ref(0)
const result = ref([])
const error = ref('')

const lines = computed(() => {
  return linesText.value.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
})

const stats = computed(() => ({
  total: lines.value.length,
  chars: lines.value.reduce((s, l) => s + l.length, 0)
}))

async function generate() {
  if (!lines.value.length) { showError('请输入至少一行文本'); return }
  error.value = ''
  result.value = []
  processing.value = true
  progress.value = 0
  progressMax.value = lines.value.length

  await safeRun(async () => {
    const zip = new JSZip()
    const used = new Set()

    for (let i = 0; i < lines.value.length; i++) {
      const text = lines.value[i]
      let name
      if (fileNameMode.value === 'index') {
        name = `qr-${String(i + 1).padStart(3, '0')}.png`
      } else {
        // content-based safe name
        const safe = text.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 30) || `qr-${i + 1}`
        let base = safe
        let n = 1
        while (used.has(base + '.png')) { base = `${safe}_${n++}` }
        name = base + '.png'
        used.add(name)
      }

      const dataUrl = await QRCode.toDataURL(text, {
        errorCorrectionLevel: ec.value,
        margin,
        width: Math.max(64, size.value),
        color: { dark: fg.value, light: bg.value }
      })
      const b64 = dataUrl.split(',')[1]
      zip.file(name, b64, { base64: true })

      progress.value = i + 1
      // 让出主线程避免卡顿
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0))
    }

    // 加一个索引文件
    const index = lines.value.map((l, i) => {
      const name = fileNameMode.value === 'index'
        ? `qr-${String(i + 1).padStart(3, '0')}.png`
        : (l.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 30) || `qr-${i + 1}`) + '.png'
      return `${i + 1}\t${name}\t${l}`
    }).join('\n')
    zip.file('_index.txt', `# 批量二维码索引\n# 序号\t文件名\t内容\n\n${index}`)

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    if (blob.size === 0) throw new Error('生成的ZIP为空')

    result.value = [{
      name: `qrcodes-batch-${Date.now()}.zip`,
      blob,
      url: URL.createObjectURL(blob),
      size: blob.size
    }]
  }, '批量生成失败')
  processing.value = false
}
</script>

<template>
  <ToolLayout title="批量二维码生成" desc="输入多行文本批量生成二维码，输出 ZIP 打包下载" icon="▤">
    <div class="nb-card">
      <label class="nb-label">输入文本（每行一个二维码）</label>
      <textarea v-model="linesText" class="nb-textarea" rows="10"
                placeholder="每行一个内容，例如：&#10;https://example.com&#10;产品编号001&#10;WiFi:..."></textarea>
      <div class="stats mt-16">
        <span class="nb-tag neon">共 {{ stats.total }} 行</span>
        <span class="nb-tag">{{ stats.chars }} 字符</span>
      </div>
    </div>

    <div class="nb-card mt-16">
      <div class="nb-grid cols-3">
        <div>
          <label class="nb-label">尺寸 ({{ size }}px)</label>
          <input type="range" v-model.number="size" min="128" max="512" step="32" class="range-input">
        </div>
        <div>
          <label class="nb-label">纠错级别</label>
          <select v-model="ec" class="nb-select">
            <option value="L">L (7%)</option>
            <option value="M">M (15%)</option>
            <option value="Q">Q (25%)</option>
            <option value="H">H (30%)</option>
          </select>
        </div>
        <div>
          <label class="nb-label">边距 ({{ margin }})</label>
          <input type="range" v-model.number="margin" min="0" max="8" step="1" class="range-input">
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
          <label class="nb-label">命名方式</label>
          <select v-model="fileNameMode" class="nb-select">
            <option value="index">序号 (qr-001.png)</option>
            <option value="content">内容前30字符</option>
          </select>
        </div>
      </div>
    </div>

    <div class="mt-16">
      <button class="nb-btn primary lg" @click="generate" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 生成中...</span>
        <span v-else>⚡ 批量生成 ZIP</span>
      </button>
    </div>

    <div v-if="processing" class="mt-16">
      <div class="nb-progress">
        <div class="nb-progress-bar" :style="{ width: progressMax ? (progress / progressMax * 100) + '%' : '0%' }"></div>
      </div>
      <div class="progress-text">{{ progress }} / {{ progressMax }}</div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.stats { display: flex; gap: 8px; }
.range-input { width: 100%; }
.color-input {
  width: 100%; height: 42px; padding: 4px;
  background: var(--paper-card); border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--ink); cursor: pointer;
}
.progress-text {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  text-align: right;
}
</style>

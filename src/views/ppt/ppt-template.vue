<script setup>
/**
 * PPT 模板填充
 * - 用 pptxgenjs 生成新PPT
 * - 提供几种内置模板样式（标题/内容/列表）
 */
import { ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { showError, safeRun } from '../../utils/common.js'
import { replaceExt } from '../../utils/download.js'
import pptxgen from 'pptxgenjs'

const result = ref([])
const processing = ref(false)
const error = ref('')
const objectUrls = ref([])

// 模板选择
const template = ref('business')
const templates = {
  business: { bg: 'FFFaf0', accent: 'FF5A1F', dark: '1A1A1A', name: '商务橙' },
  tech: { bg: '0F1A2E', accent: 'C4FF00', dark: 'FFFFFF', name: '科技黄绿' },
  paper: { bg: 'F4ECD8', accent: '1A1A1A', dark: '1A1A1A', name: '纸质极简' },
  neon: { bg: '1A1A1A', accent: 'C4FF00', dark: 'FFFFFF', name: '霓虹夜' }
}

// 内容输入
const title = ref('演示文稿标题')
const subtitle = ref('副标题或简要说明')
const slides = ref([
  { title: '第一页', bullets: ['要点一', '要点二', '要点三'] }
])

function addSlide() {
  slides.value.push({ title: `第${slides.value.length + 1}页`, bullets: ['', '', ''] })
}

function removeSlide(idx) {
  if (slides.value.length <= 1) {
    showError('至少需要保留一页')
    return
  }
  slides.value.splice(idx, 1)
}

function addBullet(slide) {
  slide.bullets.push('')
}

function removeBullet(slide, idx) {
  slide.bullets.splice(idx, 1)
}

async function process() {
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const style = templates[template.value]
    const pptx = new pptxgen()
    pptx.defineLayout({ name: 'CUSTOM', width: 13.33, height: 7.5 })
    pptx.layout = 'CUSTOM'
    pptx.author = 'FileCut'
    pptx.title = title.value

    // 封面
    const cover = pptx.addSlide()
    cover.background = { color: style.bg }
    cover.addText(title.value || '标题', {
      x: 0.5, y: 2.5, w: 12.33, h: 1.2,
      fontSize: 44, bold: true, color: style.dark,
      fontFace: 'Arial', align: 'center'
    })
    if (subtitle.value) {
      cover.addText(subtitle.value, {
        x: 0.5, y: 4.0, w: 12.33, h: 0.8,
        fontSize: 22, color: style.accent,
        fontFace: 'Arial', align: 'center'
      })
    }
    // 装饰条
    cover.addShape(pptx.ShapeType.rect, {
      x: 5.66, y: 5.0, w: 2, h: 0.1,
      fill: { color: style.accent }, line: { color: style.accent }
    })

    // 内容页
    for (const s of slides.value) {
      const slide = pptx.addSlide()
      slide.background = { color: style.bg }

      // 标题栏
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 13.33, h: 1.2,
        fill: { color: style.accent }, line: { color: style.accent }
      })
      slide.addText(s.title || '标题', {
        x: 0.5, y: 0.2, w: 12.33, h: 0.8,
        fontSize: 28, bold: true, color: 'FFFFFF',
        fontFace: 'Arial'
      })

      // 内容
      const bullets = s.bullets.filter(b => b && b.trim())
      if (bullets.length) {
        const text = bullets.map((b, i) => ({
          text: b,
          options: { bullet: { code: '25C6' }, breakLine: true, indentLevel: 0 }
        }))
        slide.addText(text, {
          x: 0.7, y: 1.6, w: 12, h: 5,
          fontSize: 22, color: style.dark,
          fontFace: 'Arial',
          lineSpacing: 36
        })
      }

      // 页脚
      slide.addText('FileCut · 纯前端生成', {
        x: 10.5, y: 7.0, w: 2.5, h: 0.4,
        fontSize: 10, color: style.dark,
        fontFace: 'Arial', align: 'right'
      })
    }

    const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' })
    const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    if (!blob.size) throw new Error('生成失败：PPT为空')

    const url = URL.createObjectURL(blob)
    objectUrls.value.push(url)
    const outName = (title.value || 'output') + '.pptx'
    result.value = [{ name: outName, blob, url, size: blob.size }]
  }, 'PPT生成失败')

  processing.value = false
}
</script>

<template>
  <ToolLayout title="PPT模板填充" desc="基于模板生成PPT，输入内容自动排版" icon="▤">
    <div class="nb-card">
      <h3 class="nb-h3">1. 选择模板风格</h3>
      <div class="nb-grid cols-4 mt-16">
        <button v-for="(t, key) in templates" :key="key"
                class="tpl-card"
                :class="{ active: template === key }"
                @click="template = key">
          <div class="tpl-preview" :style="{ background: '#' + t.bg, borderColor: '#' + t.accent }">
            <div class="tpl-bar" :style="{ background: '#' + t.accent }"></div>
            <div class="tpl-bar small" :style="{ background: '#' + t.dark }"></div>
          </div>
          <div class="tpl-name">{{ t.name }}</div>
        </button>
      </div>
    </div>

    <div class="nb-card mt-16">
      <h3 class="nb-h3">2. 封面信息</h3>
      <div class="mt-16">
        <label class="nb-label">主标题</label>
        <input v-model="title" class="nb-input" placeholder="请输入主标题" />
      </div>
      <div class="mt-16">
        <label class="nb-label">副标题</label>
        <input v-model="subtitle" class="nb-input" placeholder="请输入副标题" />
      </div>
    </div>

    <div class="nb-card mt-16">
      <div class="between">
        <h3 class="nb-h3">3. 内容页（{{ slides.length }} 页）</h3>
        <button class="nb-btn neon sm" @click="addSlide">+ 添加页面</button>
      </div>

      <div v-for="(s, i) in slides" :key="i" class="slide-edit-block mt-16">
        <div class="between">
          <h4 class="nb-h3">第 {{ i + 1 }} 页</h4>
          <button class="nb-btn danger sm" @click="removeSlide(i)">删除页</button>
        </div>
        <input v-model="s.title" class="nb-input mt-8" placeholder="页面标题" />
        <div class="bullets-area">
          <div v-for="(b, bi) in s.bullets" :key="bi" class="bullet-row">
            <span class="bullet-dot">◆</span>
            <input v-model="s.bullets[bi]" class="nb-input" :placeholder="`要点 ${bi+1}`" />
            <button class="nb-btn ghost sm" @click="removeBullet(s, bi)">×</button>
          </div>
          <button class="nb-btn sm mt-8" @click="addBullet(s)">+ 添加要点</button>
        </div>
      </div>
    </div>

    <div class="mt-16">
      <button class="nb-btn primary lg" @click="process" :disabled="processing || !title.trim()">
        <span v-if="processing"><span class="nb-spinner"></span> 生成中...</span>
        <span v-else>生成 PPT</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <ResultViewer :files="result" :imageUrls="result.map(r => r.url)" />
  </ToolLayout>
</template>

<style scoped>
.tpl-card {
  background: var(--paper-card);
  border: 3px solid var(--ink);
  padding: 12px;
  cursor: pointer;
  transition: all 0.1s ease;
}
.tpl-card:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--ink); }
.tpl-card.active {
  background: var(--neon);
  box-shadow: 4px 4px 0 var(--ink);
  transform: translate(-1px, -1px);
}
.tpl-preview {
  height: 80px;
  border: 2px solid var(--ink);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}
.tpl-bar { height: 8px; width: 60%; }
.tpl-bar.small { height: 4px; width: 80%; }
.tpl-name {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 6px;
  font-weight: 600;
}

.slide-edit-block {
  padding: 16px;
  background: var(--paper-bg);
  border: 2px dashed var(--ink);
}
.bullets-area { margin-top: 12px; }
.bullet-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.bullet-dot {
  color: var(--accent);
  font-weight: 700;
  font-size: 14px;
}
</style>

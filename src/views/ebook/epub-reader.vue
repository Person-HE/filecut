<script setup>
/**
 * EPUB阅读器 - 用 epub.js (CDN动态加载)
 * 章节导航、字号、主题
 */
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const book = ref(null)
const rendition = ref(null)
const currentChapter = ref(null)
const toc = ref([])
const tocFlat = ref([])
const fontSize = ref(100)
const theme = ref('paper')
const error = ref('')
const loading = ref(false)
const showToc = ref(false)
const currentSpineIndex = ref(0)

const themes = {
  paper: { bg: '#f4ecd8', color: '#1a1a1a' },
  light: { bg: '#ffffff', color: '#000000' },
  sepia: { bg: '#f8f1e3', color: '#5b4636' },
  dark: { bg: '#1a1a1a', color: '#e8e8e8' },
  night: { bg: '#000000', color: '#888888' }
}

const viewerEl = ref(null)

async function loadEpubJs() {
  if (window.ePub) return window.ePub
  await new Promise((resolve, reject) => {
    if (window.ePub) return resolve()
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('epub.js 加载失败'))
    document.head.appendChild(s)
  })
  return window.ePub
}

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  file.value = f
  await loadBook()
}

async function loadBook() {
  if (!file.value) return
  error.value = ''
  loading.value = true

  // 清理之前的实例
  if (rendition.value) {
    try { rendition.value.destroy() } catch (e) {}
    rendition.value = null
  }
  if (book.value) {
    try { book.value.destroy() } catch (e) {}
    book.value = null
  }

  await safeRun(async () => {
    if (file.value.size === 0) throw new Error('文件为空')
    await loadEpubJs()
    const epubjs = window.ePub

    const buf = await readFileAsArrayBuffer(file.value)
    const b = epubjs(buf)
    book.value = b

    // 加载 TOC
    const navigation = await b.loaded.navigation
    toc.value = navigation.toc || []
    // 扁平化（递归子项）
    const flat = []
    const walk = (items, depth = 0) => {
      items.forEach(item => {
        flat.push({ ...item, depth })
        if (item.subitems && item.subitems.length) walk(item.subitems, depth + 1)
      })
    }
    walk(toc.value)
    tocFlat.value = flat

    // 渲染
    await new Promise(resolve => setTimeout(resolve, 50))  // 等 DOM
    if (!viewerEl.value) throw new Error('渲染容器未就绪')

    const r = b.renderTo(viewerEl.value, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated'
    })
    rendition.value = r

    applyTheme()
    applyFontSize()

    await r.display()
    updateCurrentChapter()

    r.on('relocated', (location) => {
      updateCurrentChapter(location)
    })

    r.on('keyup', (e) => {
      if (e.key === 'ArrowLeft') prevPage()
      if (e.key === 'ArrowRight') nextPage()
    })
  }, '加载 EPUB 失败')

  loading.value = false
}

function updateCurrentChapter(location) {
  if (!book.value) return
  try {
    const loc = location || rendition.value?.location
    if (loc && loc.start && loc.start.href) {
      // 查找匹配的 toc 项
      const matched = tocFlat.value.find(t => t.href && t.href.includes(loc.start.href.split('#')[0]))
      currentChapter.value = matched ? matched.label.trim() : `位置 ${Math.round((loc.start.percentage || 0) * 100)}%`
    } else {
      currentChapter.value = '开始'
    }
  } catch (e) {
    currentChapter.value = ''
  }
}

function nextPage() {
  if (rendition.value) rendition.value.next().then(updateCurrentChapter)
}
function prevPage() {
  if (rendition.value) rendition.value.prev().then(updateCurrentChapter)
}
function jumpTo(href) {
  if (rendition.value) {
    rendition.value.display(href).then(updateCurrentChapter)
    showToc.value = false
  }
}

function applyFontSize() {
  if (!rendition.value) return
  rendition.value.themes.fontSize(fontSize.value + '%')
}
function increaseFont() {
  fontSize.value = Math.min(200, fontSize.value + 10)
  applyFontSize()
}
function decreaseFont() {
  fontSize.value = Math.max(60, fontSize.value - 10)
  applyFontSize()
}
function applyTheme() {
  if (!rendition.value) return
  const t = themes[theme.value]
  rendition.value.themes.register('theme', {
    body: {
      background: t.bg,
      color: t.color
    }
  })
  rendition.value.themes.select('theme')
  if (viewerEl.value) {
    viewerEl.value.style.background = t.bg
  }
}
function changeTheme(t) {
  theme.value = t
  applyTheme()
}

function resetAll() {
  if (rendition.value) {
    try { rendition.value.destroy() } catch (e) {}
    rendition.value = null
  }
  if (book.value) {
    try { book.value.destroy() } catch (e) {}
    book.value = null
  }
  file.value = null
  toc.value = []
  tocFlat.value = []
  currentChapter.value = null
  error.value = ''
}

onBeforeUnmount(() => {
  resetAll()
})
</script>

<template>
  <ToolLayout title="EPUB阅读器" desc="在线阅读EPUB电子书，支持章节导航、字号、主题" icon="📖">
    <FileDrop accept=".epub,application/epub+zip"
              :multiple="false" @select="onFileSelect" @error="showError"
              hint="上传 .epub 文件开始阅读" icon="📖" />

    <div v-if="file && !book && !error" class="nb-card mt-16">
      <span class="nb-spinner"></span> 正在加载电子书...
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="book" class="reader-container mt-16">
      <!-- 顶部工具栏 -->
      <div class="nb-card reader-toolbar">
        <div class="toolbar-left">
          <button class="nb-btn sm" @click="showToc = !showToc">☰ 目录</button>
          <span class="chapter-name">{{ currentChapter || '阅读中' }}</span>
        </div>
        <div class="toolbar-right">
          <button class="nb-btn sm" @click="decreaseFont" title="减小字号">A-</button>
          <span class="font-size-label">{{ fontSize }}%</span>
          <button class="nb-btn sm" @click="increaseFont" title="增大字号">A+</button>
          <select v-model="theme" @change="applyTheme" class="nb-select sm-select">
            <option v-for="(t, k) in themes" :key="k" :value="k">{{ k }}</option>
          </select>
          <button class="nb-btn sm" @click="resetAll">关闭</button>
        </div>
      </div>

      <!-- 阅读器主体 -->
      <div class="reader-body" :class="'theme-' + theme">
        <!-- 侧边目录 -->
        <aside v-if="showToc" class="toc-panel">
          <div class="toc-header">
            <strong>目录</strong>
            <button class="nb-btn sm" @click="showToc = false">×</button>
          </div>
          <div class="toc-list">
            <a v-for="(item, i) in tocFlat" :key="i"
               href="javascript:void(0)"
               class="toc-item"
               :style="{ paddingLeft: (12 + item.depth * 16) + 'px' }"
               @click="jumpTo(item.href)">
              {{ item.label.trim() }}
            </a>
            <div v-if="!tocFlat.length" class="empty-toc">无目录</div>
          </div>
        </aside>

        <!-- 渲染区 -->
        <div class="viewer-wrap">
          <div ref="viewerEl" class="epub-viewer"></div>
        </div>

        <!-- 翻页按钮 -->
        <div class="page-nav">
          <button class="nb-btn" @click="prevPage">◀ 上一页</button>
          <button class="nb-btn primary" @click="nextPage">下一页 ▶</button>
        </div>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.reader-container { display: flex; flex-direction: column; gap: 12px; }
.reader-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.chapter-name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-select { padding: 4px 8px; font-size: 12px; }
.font-size-label {
  font-family: var(--font-mono);
  font-size: 12px;
  min-width: 40px;
  text-align: center;
}
.reader-body {
  display: grid;
  grid-template-columns: 1fr;
  background: var(--paper-card);
  border: 3px solid var(--ink);
  box-shadow: var(--shadow-md);
  position: relative;
}
.toc-panel {
  position: absolute;
  top: 0; left: 0;
  width: 280px;
  height: 100%;
  background: var(--paper-card);
  border-right: 3px solid var(--ink);
  z-index: 10;
  display: flex;
  flex-direction: column;
}
.toc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--ink);
  color: var(--neon);
}
.toc-list { flex: 1; overflow-y: auto; padding: 8px 0; }
.toc-item {
  display: block;
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  border-bottom: 1px dashed var(--ink-soft);
}
.toc-item:hover { background: var(--neon); }
.empty-toc { padding: 16px; color: var(--ink-muted); font-size: 12px; text-align: center; }
.viewer-wrap {
  position: relative;
  height: 600px;
  background: var(--paper-bg);
}
.epub-viewer {
  width: 100%;
  height: 100%;
}
.page-nav {
  display: flex;
  justify-content: space-between;
  padding: 12px;
  border-top: 3px solid var(--ink);
  background: var(--paper-card);
}
.theme-paper .viewer-wrap { background: #f4ecd8; }
.theme-light .viewer-wrap { background: #ffffff; }
.theme-sepia .viewer-wrap { background: #f8f1e3; }
.theme-dark .viewer-wrap { background: #1a1a1a; }
.theme-night .viewer-wrap { background: #000000; }

@media (max-width: 768px) {
  .viewer-wrap { height: 480px; }
  .toc-panel { width: 80%; }
  .chapter-name { max-width: 120px; font-size: 11px; }
}
</style>

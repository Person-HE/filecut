<script setup>
/**
 * 字体预览对比 - 上传字体文件，输入示例文字渲染
 * 显示字体元数据(family/subfamily/version)
 */
import { ref, watch, onUnmounted } from 'vue'
import * as opentype from 'opentype.js'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { getBaseName } from '../../utils/download.js'
import { formatBytes } from '../../utils/format.js'
import { showError, safeRun } from '../../utils/common.js'

const files = ref([])      // [{ file, name, font, fontFaceUrl, meta, error }]
const sampleText = ref('永和九年岁在癸丑暮春之初\nThe quick brown fox jumps over the lazy dog\n0123456789!@#$%^&*()_+\n字体预览 Font Preview 字体预览')
const fontSize = ref(48)
const error = ref('')

const presetSamples = [
  { label: '默认', text: '永和九年岁在癸丑暮春之初\nThe quick brown fox jumps over the lazy dog\n0123456789' },
  { label: '中文', text: '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏\n王羲之兰亭序永和九年岁在癸丑暮春之初会于会稽山阴之兰亭' },
  { label: '英文', text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789' },
  { label: '数字', text: '0123456789\n一二三四五六七八九十百千万亿\n$¥€£¢₿' },
  { label: '诗句', text: '床前明月光疑是地上霜\n举头望明月低头思故乡' }
]

async function onFileSelect(selected) {
  const arr = Array.isArray(selected) ? selected : [selected]
  for (const f of arr) {
    if (f.size === 0) { showError(`文件 "${f.name}" 为空`); continue }
    await addFont(f)
  }
}

async function addFont(file) {
  const item = { file, name: file.name, fontFaceUrl: '', meta: null, error: '' }
  files.value.push(item)
  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file)
    // 检测格式 - WOFF2 需先解压
    const u8 = new Uint8Array(buf)
    const sig = String.fromCharCode(...u8.slice(0, 4))
    let parseBuf = buf
    if (sig === 'wOF2') {
      try {
        const wawoff2 = (await import(/* @vite-ignore */ 'https://esm.sh/wawoff2@1.0.2')).default
        const ttf = wawoff2.decompress(u8)
        parseBuf = ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength)
      } catch (e) {
        throw new Error('WOFF2 解压失败: ' + (e?.message || e))
      }
    }

    // 解析元数据
    let font = null
    try {
      font = opentype.parse(parseBuf)
    } catch (e) {
      throw new Error('字体解析失败，可能格式不支持或已损坏')
    }

    const meta = {
      family: font.names.fontFamily ? font.names.fontFamily.en : '(未知)',
      subfamily: font.names.fontSubfamily ? font.names.fontSubfamily.en : '(未知)',
      fullName: font.names.fullName ? font.names.fullName.en : '',
      version: font.names.version ? font.names.version.en : '',
      postscriptName: font.names.postScriptName ? font.names.postScriptName.en : '',
      copyright: font.names.copyright ? font.names.copyright.en : '',
      designer: font.names.designer ? font.names.designer.en : '',
      manufacturer: font.names.manufacturer ? font.names.manufacturer.en : '',
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
      numGlyphs: font.glyphs.length,
      format: sig === 'wOF2' ? 'WOFF2' : sig === 'wOFF' ? 'WOFF' : sig === 'OTTO' ? 'OTF (CFF)' : 'TTF'
    }
    item.meta = meta

    // 注册 FontFace 用于实际渲染
    const fontFace = new FontFace(`fc-preview-${Date.now()}-${files.value.length}`, new Uint8Array(buf))
    await fontFace.load()
    document.fonts.add(fontFace)
    item.fontFace = fontFace
    item.fontFaceUrl = fontFace.family
  }, '字体加载失败')
  if (item.error && !item.meta) item.error = item.error || '加载失败'
}

function removeFont(idx) {
  const item = files.value[idx]
  if (item?.fontFace) {
    document.fonts.delete(item.fontFace)
  }
  files.value.splice(idx, 1)
}

onUnmounted(() => {
  for (const f of files.value) {
    if (f.fontFace) document.fonts.delete(f.fontFace)
  }
})

function usePreset(text) {
  sampleText.value = text
}

const previewLines = computed(() => sampleText.value.split('\n'))
</script>

<template>
  <ToolLayout title="字体预览对比" desc="上传字体文件实时预览，对比多种字体效果，显示元数据" icon="👁">
    <FileDrop accept=".ttf,.otf,.woff,.woff2" :multiple="true"
              hint="支持 .ttf / .otf / .woff / .woff2 字体文件，可同时上传多个对比"
              @select="onFileSelect" @error="showError" />

    <div class="mt-16 nb-card">
      <label class="nb-label">示例文字</label>
      <textarea v-model="sampleText" class="nb-textarea" rows="4"></textarea>
      <div class="preset-tabs mt-16">
        <button v-for="p in presetSamples" :key="p.label"
                class="nb-btn sm" @click="usePreset(p.text)">{{ p.label }}</button>
      </div>
      <div class="mt-16">
        <label class="nb-label">字号 ({{ fontSize }}px)</label>
        <input type="range" v-model.number="fontSize" min="12" max="120" step="2" class="range-input">
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="files.length" class="mt-16">
      <div v-for="(f, idx) in files" :key="idx" class="nb-card mt-16 font-card">
        <div class="font-head">
          <div class="font-name">
            <strong>{{ f.name }}</strong>
            <button class="nb-btn sm danger" @click="removeFont(idx)">移除</button>
          </div>
          <div class="font-meta-tags">
            <span v-if="f.meta" class="nb-tag neon">{{ f.meta.format }}</span>
            <span v-if="f.meta" class="nb-tag">{{ f.meta.numGlyphs }} 字形</span>
            <span class="nb-tag cyan">{{ formatBytes(f.file.size) }}</span>
          </div>
        </div>

        <div v-if="f.error" class="nb-alert danger mt-16">{{ f.error }}</div>

        <div v-if="f.meta" class="mt-16">
          <div class="preview-area" :style="{ fontFamily: f.fontFaceUrl ? `'${f.fontFaceUrl}', monospace` : 'monospace', fontSize: fontSize + 'px' }">
            <div v-for="(line, li) in previewLines" :key="li" class="preview-line">{{ line || ' ' }}</div>
          </div>

          <details class="mt-16">
            <summary class="nb-h3">字体元数据</summary>
            <table class="meta-table">
              <tbody>
                <tr><th>Family</th><td>{{ f.meta.family }}</td></tr>
                <tr><th>Subfamily</th><td>{{ f.meta.subfamily }}</td></tr>
                <tr v-if="f.meta.fullName"><th>全名</th><td>{{ f.meta.fullName }}</td></tr>
                <tr v-if="f.meta.postscriptName"><th>PostScript</th><td>{{ f.meta.postscriptName }}</td></tr>
                <tr v-if="f.meta.version"><th>版本</th><td>{{ f.meta.version }}</td></tr>
                <tr><th>格式</th><td>{{ f.meta.format }}</td></tr>
                <tr><th>字形数</th><td>{{ f.meta.numGlyphs }}</td></tr>
                <tr><th>Units/Em</th><td>{{ f.meta.unitsPerEm }}</td></tr>
                <tr><th>Ascender</th><td>{{ f.meta.ascender }}</td></tr>
                <tr><th>Descender</th><td>{{ f.meta.descender }}</td></tr>
                <tr v-if="f.meta.designer"><th>设计师</th><td>{{ f.meta.designer }}</td></tr>
                <tr v-if="f.meta.manufacturer"><th>制造商</th><td>{{ f.meta.manufacturer }}</td></tr>
                <tr v-if="f.meta.copyright"><th>版权</th><td>{{ f.meta.copyright }}</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>

    <div v-if="!files.length" class="nb-alert info mt-16">
      <strong>使用说明：</strong> 上传字体后，可同时加载多个字体进行效果对比。所有字体在浏览器本地加载，不会上传到服务器。
    </div>

    <ResultViewer :files="[]" />
  </ToolLayout>
</template>

<style scoped>
.preset-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.range-input { width: 100%; }
.font-card { padding: 16px; }
.font-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.font-name { display: flex; align-items: center; gap: 12px; }
.font-name strong { font-family: var(--font-mono); font-size: 14px; }
.font-meta-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.preview-area {
  background: var(--paper-bg);
  border: 3px dashed var(--ink);
  padding: 24px;
  line-height: 1.5;
  overflow: auto;
  word-break: break-all;
}
.preview-line { margin-bottom: 8px; }
.meta-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--paper-bg);
  margin-top: 8px;
}
.meta-table th, .meta-table td {
  border: 2px solid var(--ink);
  padding: 6px 10px;
  text-align: left;
}
.meta-table th { background: var(--paper-darker); width: 130px; }
details summary { cursor: pointer; padding: 4px 0; }
</style>

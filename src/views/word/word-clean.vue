<script setup>
/**
 * Word隐私清理 - 删除 author/lastModifiedBy/createdAt 等元数据
 * 删除批注、修订记录、隐藏文字
 * 用 JSZip 解压 .docx，修改 XML，重新打包
 */
import { ref } from 'vue'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import FileList from '../../components/FileList.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { readFileAsArrayBuffer } from '../../utils/fileReader.js'
import { downloadBlob, replaceExt } from '../../utils/download.js'
import { safeRun, showError } from '../../utils/common.js'

const file = ref(null)
const result = ref([])
const processing = ref(false)
const error = ref('')
const report = ref(null)

// 清理选项
const options = ref({
  author: true,
  lastModifiedBy: true,
  createdAt: true,
  modifiedAt: true,
  comments: true,
  trackedChanges: true,
  hiddenText: true,
  personalInfo: true,
  appInfo: true
})

function onFileSelect(selected) {
  file.value = selected
  result.value = []
  report.value = null
  error.value = ''
}

function removeFile() {
  file.value = null
  result.value = []
  report.value = null
}

function cleanXmlCDATA(s) {
  // 移除指定标签内容
  return s
}

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const zip = await JSZip.loadAsync(buf)
    const cleaned = []
    let metadataFound = {}

    // 1. 清理 docProps/core.xml 元数据
    const coreFile = zip.file('docProps/core.xml')
    if (coreFile) {
      let xml = await coreFile.async('string')
      const original = xml

      if (options.value.author) {
        xml = xml.replace(/<dc:creator>[^<]*<\/dc:creator>/g, '<dc:creator></dc:creator>')
      }
      if (options.value.lastModifiedBy) {
        xml = xml.replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/g, '<cp:lastModifiedBy></cp:lastModifiedBy>')
      }
      if (options.value.createdAt) {
        xml = xml.replace(/<dcterms:created[^>]*>[^<]*<\/dcterms:created>/g, (m) => m.replace(/>[^<]*</, '><'))
      }
      if (options.value.modifiedAt) {
        xml = xml.replace(/<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/g, (m) => m.replace(/>[^<]*</, '><'))
      }
      if (options.value.personalInfo) {
        xml = xml.replace(/<cp:revision>[^<]*<\/cp:revision>/g, '')
      }

      if (xml !== original) {
        zip.file('docProps/core.xml', xml)
        cleaned.push('文档核心属性 (作者/修改人/时间)')
        metadataFound.author = true
      }
    }

    // 2. 清理 docProps/app.xml 应用信息
    const appFile = zip.file('docProps/app.xml')
    if (appFile && options.value.appInfo) {
      let xml = await appFile.async('string')
      const original = xml
      xml = xml.replace(/<Application>[^<]*<\/Application>/g, '<Application></Application>')
      xml = xml.replace(/<AppVersion>[^<]*<\/AppVersion>/g, '<AppVersion></AppVersion>')
      xml = xml.replace(/<Company>[^<]*<\/Company>/g, '<Company></Company>')
      xml = xml.replace(/<Manager>[^<]*<\/Manager>/g, '<Manager></Manager>')
      if (xml !== original) {
        zip.file('docProps/app.xml', xml)
        cleaned.push('应用信息 (Office版本/公司/经理)')
        metadataFound.appInfo = true
      }
    }

    // 3. 清理 word/document.xml 中的批注、修订、隐藏文字
    const docFile = zip.file('word/document.xml')
    if (docFile) {
      let xml = await docFile.async('string')
      const original = xml

      if (options.value.trackedChanges) {
        // 移除插入修订 w:ins - 保留内容
        const beforeIns = xml
        xml = xml.replace(/<w:ins[^>]*>([\s\S]*?)<\/w:ins>/g, '$1')
        // 移除删除修订 w:del - 删除内容
        xml = xml.replace(/<w:del[^>]*>[\s\S]*?<\/w:del>/g, '')
        // 移除移动修订
        xml = xml.replace(/<w:moveTo[^>]*>([\s\S]*?)<\/w:moveTo>/g, '$1')
        xml = xml.replace(/<w:moveFrom[^>]*>[\s\S]*?<\/w:moveFrom>/g, '')
        if (xml !== beforeIns) {
          cleaned.push('修订记录 (插入/删除/移动)')
          metadataFound.trackedChanges = true
        }
      }

      if (options.value.comments) {
        // 移除文档中的批注引用
        xml = xml.replace(/<w:commentReference[^/]*\/>/g, '')
        xml = xml.replace(/<w:commentRangeStart[^/]*\/>/g, '')
        xml = xml.replace(/<w:commentRangeEnd[^/]*\/>/g, '')
        xml = xml.replace(/<w:commentRangeStart[^>]*>[^<]*<\/w:commentRangeStart>/g, '')
        xml = xml.replace(/<w:commentRangeEnd[^>]*>[^<]*<\/w:commentRangeEnd>/g, '')
      }

      if (options.value.hiddenText) {
        // 移除隐藏文字 (含 w:vanish 属性的 run)
        xml = xml.replace(/<w:r[^>]*>(?:(?!<\/w:r>).)*?<w:vanish[^>]*\/>[\s\S]*?<\/w:r>/g, '')
      }

      if (xml !== original) {
        zip.file('word/document.xml', xml)
        if (!cleaned.find(c => c.includes('修订'))) {
          // 已添加
        }
      }
    }

    // 4. 删除批注文件 word/comments.xml
    if (options.value.comments) {
      const commentFiles = Object.keys(zip.files).filter(n => /word\/comments?\.xml$/.test(n) || /word\/commentsExtended\.xml$/.test(n))
      for (const cf of commentFiles) {
        zip.remove(cf)
        cleaned.push('批注文件 (' + cf + ')')
        metadataFound.comments = true
      }
    }

    // 5. 更新 Content_Types.xml (移除批注类型)
    if (options.value.comments) {
      const ctFile = zip.file('[Content_Types].xml')
      if (ctFile) {
        let xml = await ctFile.async('string')
        const original = xml
        xml = xml.replace(/<Override[^>]*PartName="\/word\/comments?\.xml"[^>]*>/g, '')
        xml = xml.replace(/<Override[^>]*PartName="\/word\/commentsExtended\.xml"[^>]*>/g, '')
        if (xml !== original) {
          zip.file('[Content_Types].xml', xml)
        }
      }
    }

    // 6. 移除 docProps/custom.xml (自定义属性)
    if (options.value.personalInfo) {
      const customFile = zip.file('docProps/custom.xml')
      if (customFile) {
        zip.remove('docProps/custom.xml')
        cleaned.push('自定义属性')
        metadataFound.custom = true
        // 更新 rels
        const relsFile = zip.file('docProps/_rels/core.xml.rels')
        if (relsFile) {
          let xml = await relsFile.async('string')
          xml = xml.replace(/<Relationship[^>]*Target="custom\.xml"[^>]*\/>/g, '')
          zip.file('docProps/_rels/core.xml.rels', xml)
        }
      }
    }

    if (cleaned.length === 0) {
      report.value = { cleaned: [], message: '未发现需要清理的内容（文档已较干净）', metadataFound: {} }
      // 仍输出原文件
      const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const name = replaceExt(file.value.name, '-clean.docx')
      result.value = [{ name, blob: out, url: URL.createObjectURL(out), size: out.size }]
      processing.value = false
      return
    }

    const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    if (out.size === 0) throw new Error('生成的文档为空')

    report.value = { cleaned, message: `已清理 ${cleaned.length} 项隐私/元数据内容`, metadataFound }
    const name = replaceExt(file.value.name, '-clean.docx')
    result.value = [{ name, blob: out, url: URL.createObjectURL(out), size: out.size }]
  }, '清理失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Word隐私清理" desc="删除作者、修订记录、批注、隐藏文字等隐私信息" icon="✕">
    <FileDrop accept=".docx" :multiple="false" hint="支持 .docx 格式 · 清理后可放心分享文档" icon="📘"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">清理选项</h3>
      <div class="options-grid">
        <label class="check-item">
          <input type="checkbox" v-model="options.author" />
          <span>作者 (dc:creator)</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.lastModifiedBy" />
          <span>最后修改人</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.createdAt" />
          <span>创建时间</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.modifiedAt" />
          <span>修改时间</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.comments" />
          <span>批注</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.trackedChanges" />
          <span>修订记录</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.hiddenText" />
          <span>隐藏文字</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.personalInfo" />
          <span>个人信息</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.appInfo" />
          <span>应用信息 (Office版本)</span>
        </label>
      </div>
    </div>

    <div class="mt-16" v-if="file">
      <button class="nb-btn primary lg" @click="process" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 清理中...</span>
        <span v-else>开始清理</span>
      </button>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="report" class="nb-card mt-16">
      <h3 class="nb-h3 mb-16">清理报告</h3>
      <p class="report-summary">{{ report.message }}</p>
      <ul v-if="report.cleaned.length" class="cleaned-list">
        <li v-for="(item, i) in report.cleaned" :key="i">✓ {{ item }}</li>
      </ul>
    </div>

    <ResultViewer :files="result" />
  </ToolLayout>
</template>

<style scoped>
.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}
.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--paper-bg);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-size: 13px;
  cursor: pointer;
}
.check-item:hover { background: var(--accent-soft); }
.check-item input { width: 16px; height: 16px; cursor: pointer; }
.report-summary {
  font-family: var(--font-mono);
  font-size: 14px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--neon);
  border: 2px solid var(--ink);
}
.cleaned-list {
  list-style: none;
  padding: 0;
}
.cleaned-list li {
  padding: 6px 12px;
  margin-bottom: 4px;
  background: var(--paper-card);
  border-left: 3px solid var(--neon-deep);
  font-family: var(--font-mono);
  font-size: 13px;
}
</style>

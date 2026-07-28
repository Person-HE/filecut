<script setup>
/**
 * Excel隐私清理 - 删除 author、隐藏sheet、批注
 * 用 JSZip 修改 XLSX 的 XML
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

const options = ref({
  author: true,
  lastModifiedBy: true,
  createdAt: true,
  modifiedAt: true,
  appInfo: true,
  company: true,
  manager: true,
  hiddenSheets: true,
  comments: true,
  personalInfo: true,
  definedNames: true,
  calcChain: true
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

async function process() {
  if (!file.value) { showError('请先选择文件'); return }
  if (file.value.size === 0) { showError('文件为空'); return }
  error.value = ''
  result.value = []
  report.value = null
  processing.value = true

  await safeRun(async () => {
    const buf = await readFileAsArrayBuffer(file.value)
    const zip = await JSZip.loadAsync(buf)
    const cleaned = []

    // 1. 清理 docProps/core.xml
    const coreFile = zip.file('docProps/core.xml')
    if (coreFile) {
      let xml = await coreFile.async('string')
      const orig = xml
      if (options.value.author) {
        xml = xml.replace(/<dc:creator>[^<]*<\/dc:creator>/g, '<dc:creator></dc:creator>')
      }
      if (options.value.lastModifiedBy) {
        xml = xml.replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/g, '<cp:lastModifiedBy></cp:lastModifiedBy>')
      }
      if (options.value.createdAt) {
        xml = xml.replace(/<dcterms:created[^>]*>[^<]*<\/dcterms:created>/g, m => m.replace(/>[^<]*</, '><'))
      }
      if (options.value.modifiedAt) {
        xml = xml.replace(/<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/g, m => m.replace(/>[^<]*</, '><'))
      }
      if (options.value.personalInfo) {
        xml = xml.replace(/<cp:revision>[^<]*<\/cp:revision>/g, '')
      }
      if (xml !== orig) {
        zip.file('docProps/core.xml', xml)
        cleaned.push('文档核心属性 (作者/修改人/时间/版本)')
      }
    }

    // 2. 清理 docProps/app.xml
    const appFile = zip.file('docProps/app.xml')
    if (appFile) {
      let xml = await appFile.async('string')
      const orig = xml
      if (options.value.appInfo) {
        xml = xml.replace(/<Application>[^<]*<\/Application>/g, '<Application></Application>')
        xml = xml.replace(/<AppVersion>[^<]*<\/AppVersion>/g, '<AppVersion></AppVersion>')
      }
      if (options.value.company) {
        xml = xml.replace(/<Company>[^<]*<\/Company>/g, '<Company></Company>')
      }
      if (options.value.manager) {
        xml = xml.replace(/<Manager>[^<]*<\/Manager>/g, '<Manager></Manager>')
      }
      if (xml !== orig) {
        zip.file('docProps/app.xml', xml)
        cleaned.push('应用信息 (Office版本/公司/经理)')
      }
    }

    // 3. 删除 docProps/custom.xml
    if (options.value.personalInfo) {
      if (zip.file('docProps/custom.xml')) {
        zip.remove('docProps/custom.xml')
        cleaned.push('自定义属性文件')
        const relsFile = zip.file('docProps/_rels/core.xml.rels')
        if (relsFile) {
          let xml = await relsFile.async('string')
          xml = xml.replace(/<Relationship[^>]*Target="custom\.xml"[^>]*\/>/g, '')
          zip.file('docProps/_rels/core.xml.rels', xml)
        }
        // 更新 Content_Types
        const ctFile = zip.file('[Content_Types].xml')
        if (ctFile) {
          let xml = await ctFile.async('string')
          xml = xml.replace(/<Override[^>]*PartName="\/docProps\/custom\.xml"[^>]*>/g, '')
          zip.file('[Content_Types].xml', xml)
        }
      }
    }

    // 4. 删除批注
    if (options.value.comments) {
      const commentFiles = Object.keys(zip.files).filter(n =>
        /comments\d*\.xml$/.test(n) ||
        /commentsExtended\.xml$/.test(n) ||
        /threadedComments\d*\.xml$/.test(n)
      )
      commentFiles.forEach(cf => {
        zip.remove(cf)
        cleaned.push('批注文件 (' + cf + ')')
      })
      // 更新 workbook.xml.rels 删除批注关系
      const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels')
      if (wbRelsFile && commentFiles.length) {
        let xml = await wbRelsFile.async('string')
        const orig = xml
        xml = xml.replace(/<Relationship[^>]*Target="comments\d*\.xml"[^>]*\/>/g, '')
        xml = xml.replace(/<Relationship[^>]*Target="commentsExtended\.xml"[^>]*\/>/g, '')
        xml = xml.replace(/<Relationship[^>]*Target="threadedComments\d*\.xml"[^>]*\/>/g, '')
        if (xml !== orig) {
          zip.file('xl/_rels/workbook.xml.rels', xml)
        }
      }
    }

    // 5. 删除隐藏工作表
    if (options.value.hiddenSheets) {
      const wbFile = zip.file('xl/workbook.xml')
      if (wbFile) {
        let xml = await wbFile.async('string')
        const orig = xml
        // 统计隐藏sheet
        const hiddenSheets = xml.match(/<sheet[^>]*state="hidden"[^>]*>/g) || []
        const veryHiddenSheets = xml.match(/<sheet[^>]*state="veryHidden"[^>]*>/g) || []
        if (hiddenSheets.length + veryHiddenSheets.length > 0) {
          // 删除隐藏sheet标签
          xml = xml.replace(/<sheet[^>]*state="hidden"[^>]*\/>/g, '')
          xml = xml.replace(/<sheet[^>]*state="veryHidden"[^>]*\/>/g, '')
          // 也匹配带空格的情况
          xml = xml.replace(/<sheet\b[^>]*\bstate="hidden"[^>]*>[\s\S]*?<\/sheet>/g, '')
          xml = xml.replace(/<sheet\b[^>]*\bstate="veryHidden"[^>]*>[\s\S]*?<\/sheet>/g, '')
          if (xml !== orig) {
            zip.file('xl/workbook.xml', xml)
            cleaned.push(`隐藏工作表 (${hiddenSheets.length} 隐藏 + ${veryHiddenSheets.length} 深度隐藏)`)
          }
        }
      }
    }

    // 6. 删除定义名称
    if (options.value.definedNames) {
      const wbFile = zip.file('xl/workbook.xml')
      if (wbFile) {
        let xml = await wbFile.async('string')
        const orig = xml
        const definedNamesCount = (xml.match(/<definedName[^>]*>/g) || []).length
        if (definedNamesCount > 0) {
          xml = xml.replace(/<definedNames>[\s\S]*?<\/definedNames>/g, '')
          if (xml !== orig) {
            zip.file('xl/workbook.xml', xml)
            cleaned.push(`定义名称 (${definedNamesCount} 个)`)
          }
        }
      }
    }

    // 7. 删除计算链
    if (options.value.calcChain) {
      if (zip.file('xl/calcChain.xml')) {
        zip.remove('xl/calcChain.xml')
        cleaned.push('计算链 (含公式位置信息)')
        // 更新 Content_Types 和 rels
        const ctFile = zip.file('[Content_Types].xml')
        if (ctFile) {
          let xml = await ctFile.async('string')
          xml = xml.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*>/g, '')
          zip.file('[Content_Types].xml', xml)
        }
        const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels')
        if (wbRelsFile) {
          let xml = await wbRelsFile.async('string')
          xml = xml.replace(/<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/g, '')
          zip.file('xl/_rels/workbook.xml.rels', xml)
        }
      }
    }

    if (!cleaned.length) {
      report.value = { cleaned: [], message: '未发现需要清理的内容（文档已较干净）' }
      // 仍输出文件
      const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const name = replaceExt(file.value.name, '-clean.xlsx')
      result.value = [{ name, blob: out, url: URL.createObjectURL(out), size: out.size }]
      processing.value = false
      return
    }

    const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    if (out.size === 0) throw new Error('生成的Excel为空')

    report.value = {
      cleaned,
      message: `已清理 ${cleaned.length} 项隐私/元数据内容`
    }
    const name = replaceExt(file.value.name, '-clean.xlsx')
    result.value = [{ name, blob: out, url: URL.createObjectURL(out), size: out.size }]
  }, '清理失败')
  processing.value = false
}

function downloadResult() {
  if (result.value[0]) downloadBlob(result.value[0].blob, result.value[0].name)
}
</script>

<template>
  <ToolLayout title="Excel隐私清理" desc="删除作者、隐藏Sheet、批注等隐私信息" icon="✕">
    <FileDrop accept=".xlsx,.xls" :multiple="false" hint="支持 .xlsx / .xls 格式 · 清理后可放心分享" icon="📗"
              @select="onFileSelect" @error="showError" />
    <FileList v-if="file" :files="[file]" class="mt-16" @remove="removeFile" />

    <div v-if="file" class="mt-16 nb-card">
      <h3 class="nb-h3 mb-16">清理选项</h3>
      <div class="options-grid">
        <label class="check-item">
          <input type="checkbox" v-model="options.author" />
          <span>作者</span>
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
          <input type="checkbox" v-model="options.appInfo" />
          <span>应用信息</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.company" />
          <span>公司</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.manager" />
          <span>经理</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.hiddenSheets" />
          <span>隐藏工作表</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.comments" />
          <span>批注</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.definedNames" />
          <span>定义名称</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.calcChain" />
          <span>计算链</span>
        </label>
        <label class="check-item">
          <input type="checkbox" v-model="options.personalInfo" />
          <span>自定义属性</span>
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
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
.cleaned-list { list-style: none; padding: 0; }
.cleaned-list li {
  padding: 6px 12px;
  margin-bottom: 4px;
  background: var(--paper-card);
  border-left: 3px solid var(--neon-deep);
  font-family: var(--font-mono);
  font-size: 13px;
}
</style>

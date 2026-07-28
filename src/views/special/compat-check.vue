<script setup>
/**
 * WPS/Office 兼容性检测
 * 上传 .docx/.xlsx/.pptx, 检测可能不兼容的元素
 * - SmartArt / VBA宏 / 嵌入对象 / 特殊动画 / 主题色
 * 输出兼容性报告, 给出修复建议
 *
 * 实现: Office 文件本质是 ZIP+XML, 解压后扫描 XML 内容
 */
import { ref, computed } from 'vue'
import JSZip from 'jszip'
import ToolLayout from '../../components/ToolLayout.vue'
import FileDrop from '../../components/FileDrop.vue'
import ResultViewer from '../../components/ResultViewer.vue'
import { getExt } from '../../utils/download.js'
import { showError, safeRun } from '../../utils/common.js'
import { formatBytes } from '../../utils/format.js'

const file = ref(null)
const processing = ref(false)
const report = ref(null)
const error = ref('')

async function onFileSelect(selected) {
  const f = Array.isArray(selected) ? selected[0] : selected
  if (!f) return
  if (f.size === 0) { showError('文件为空'); return }
  const ext = getExt(f.name)
  if (!['docx', 'xlsx', 'pptx'].includes(ext)) {
    showError('仅支持 .docx / .xlsx / .pptx 格式（旧版 .doc/.xls/.ppt 不支持）')
    return
  }
  file.value = f
  report.value = null
  await analyze()
}

async function analyze() {
  if (!file.value) return
  processing.value = true
  error.value = ''
  report.value = null

  await safeRun(async () => {
    const buf = await file.value.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const ext = getExt(file.value.name)
    const issues = []
    const fileTypes = new Set()

    // 遍历 ZIP 内容
    const entries = Object.keys(zip.files)
    for (const name of entries) {
      const entry = zip.files[name]
      if (entry.dir) continue
      fileTypes.add(name)
    }

    // 1. VBA 宏检测
    const hasVba = entries.some(n => n.includes('vbaProject.bin') || n.includes('vbaData.xml'))
    if (hasVba) {
      issues.push({
        severity: 'high',
        category: 'VBA 宏',
        item: 'vbaProject.bin',
        detail: '文档包含 VBA 宏代码',
        fix: 'WPS 兼容模式支持基础宏，但复杂 API 调用可能失败。建议: 1) 保留 .docm/.xlsm 扩展名 2) 测试关键宏功能 3) 如无需宏，删除宏代码'
      })
    }

    // 2. SmartArt 检测
    const smartArtCount = entries.filter(n => n.includes('diagrams/') || n.includes('diagram')).length
    if (smartArtCount > 0) {
      issues.push({
        severity: 'medium',
        category: 'SmartArt',
        item: `diagrams/ (${smartArtCount} 个)`,
        detail: `文档包含 ${smartArtCount} 个 SmartArt 图形`,
        fix: 'WPS 对 SmartArt 支持有限，部分布局可能错位。建议: 转换为图片或普通形状后重新嵌入'
      })
    }

    // 3. 嵌入对象
    const oleCount = entries.filter(n => n.includes('embeddings/') || n.endsWith('.bin')).length
    if (oleCount > 0) {
      issues.push({
        severity: 'medium',
        category: '嵌入对象',
        item: `embeddings/ (${oleCount} 个)`,
        detail: `文档嵌入 ${oleCount} 个 OLE 对象（如嵌入的 Excel/图表）`,
        fix: '嵌入对象在 WPS 中可能显示为图标或无法编辑。建议: 改为图片粘贴，或在源应用中编辑后更新'
      })
    }

    // 4. PPT 特殊动画
    if (ext === 'pptx') {
      const hasCustomAnim = entries.some(n => n.startsWith('ppt/slides/') && n.endsWith('.xml'))
      if (hasCustomAnim) {
        // 检查 slide xml 是否包含复杂动画
        for (const name of entries.filter(n => n.startsWith('ppt/slides/slide') && n.endsWith('.xml'))) {
          const content = await zip.files[name].async('string')
          if (content.includes('<p:timing>') || content.includes('p:par')) {
            issues.push({
              severity: 'medium',
              category: '动画效果',
              item: name,
              detail: `幻灯片 ${name} 包含自定义动画时间线`,
              fix: 'WPS 支持基础动画，但复杂的时间线和触发器可能失效。建议: 简化为进入/退出/强调三类基础动画'
            })
            break // 仅报告一次
          }
        }
      }
    }

    // 5. 主题色与字体
    const themeFile = entries.find(n => n.includes('theme') && n.endsWith('.xml'))
    if (themeFile) {
      const themeContent = await zip.files[themeFile].async('string')
      // 检查是否使用自定义字体
      const fontMatches = themeContent.match(/<a:latin[^>]*typeface="([^"]+)"/g) || []
      const fonts = fontMatches.map(m => m.match(/typeface="([^"]+)"/)[1])
      const customFonts = fonts.filter(f => f && !['Arial', 'Calibri', 'Times New Roman', '宋体', '微软雅黑', '等线'].includes(f))
      if (customFonts.length > 0) {
        issues.push({
          severity: 'low',
          category: '主题字体',
          item: customFonts.join(', '),
          detail: `主题使用自定义字体: ${customFonts.join(', ')}`,
          fix: '若 WPS 端未安装该字体, 会替换为默认字体导致排版错乱。建议: 嵌入字体 (文件>选项>保存>嵌入字体), 或改用通用字体'
        })
      }
    }

    // 6. 旧版功能
    if (entries.some(n => n.includes('legacyDiagramText'))) {
      issues.push({
        severity: 'low',
        category: '旧版图示',
        item: 'legacyDiagramText',
        detail: '文档包含 Office 2003 旧版图示',
        fix: '建议右键图示选择"转换为形状"以获得更好兼容性'
      })
    }

    // 7. 受保护视图/修订
    const settingsFile = entries.find(n => n.includes('settings.xml'))
    if (settingsFile) {
      const settingsContent = await zip.files[settingsFile].async('string')
      if (settingsContent.includes('<w:documentProtection') || settingsContent.includes('w:formsDesign')) {
        issues.push({
          severity: 'high',
          category: '文档保护',
          item: 'documentProtection',
          detail: '文档启用了保护 (只读/批注/窗体)',
          fix: 'WPS 处理保护文档时可能行为不一致。建议: 在 Office 中解除保护后再分发'
        })
      }
    }

    // 8. 文件大小警告
    const sizeMB = file.value.size / 1024 / 1024
    if (sizeMB > 50) {
      issues.push({
        severity: 'low',
        category: '文件体积',
        item: `${sizeMB.toFixed(1)} MB`,
        detail: '文件较大, 在低配设备上打开可能缓慢',
        fix: '建议: 压缩图片、删除未使用样式、清除历史版本'
      })
    }

    // 总结
    const summary = {
      ext,
      fileSize: file.value.size,
      totalEntries: entries.length,
      issues,
      bySeverity: {
        high: issues.filter(i => i.severity === 'high').length,
        medium: issues.filter(i => i.severity === 'medium').length,
        low: issues.filter(i => i.severity === 'low').length
      },
      score: Math.max(0, 100 - issues.reduce((s, i) => s + (i.severity === 'high' ? 25 : i.severity === 'medium' ? 10 : 3), 0))
    }
    report.value = summary
  }, '分析失败')
  processing.value = false
}

function removeFile() {
  file.value = null
  report.value = null
}

const severityLabel = { high: '高', medium: '中', low: '低' }

const scoreClass = computed(() => {
  if (!report.value) return ''
  if (report.value.score >= 85) return 'good'
  if (report.value.score >= 60) return 'medium'
  return 'bad'
})

const scoreLabel = computed(() => {
  if (!report.value) return ''
  if (report.value.score >= 85) return '兼容性良好'
  if (report.value.score >= 60) return '存在兼容性问题'
  return '兼容性差'
})
</script>

<template>
  <ToolLayout title="WPS/Office 兼容性检测" desc="检测文档在 WPS / 不同 Office 版本间的兼容性问题" icon="✓">
    <FileDrop accept=".docx,.xlsx,.pptx" :multiple="false"
              hint="支持 .docx / .xlsx / .pptx (不支持旧版 .doc/.xls/.ppt)"
              @select="onFileSelect" @error="showError" />

    <div v-if="file" class="mt-16 nb-card">
      <div class="file-info">
        <strong>{{ file.name }}</strong>
        <span class="nb-tag cyan">{{ formatBytes(file.size) }}</span>
        <span class="nb-tag">{{ file.name.split('.').pop().toUpperCase() }}</span>
        <button class="nb-btn sm danger" @click="removeFile">移除</button>
      </div>

      <button v-if="!report" class="nb-btn primary lg block mt-16" @click="analyze" :disabled="processing">
        <span v-if="processing"><span class="nb-spinner"></span> 分析中...</span>
        <span v-else>🔍 开始检测</span>
      </button>
    </div>

    <div v-if="report" class="mt-16">
      <div class="nb-card score-card" :class="scoreClass">
        <div class="score-num">{{ report.score }}/100</div>
        <div class="score-label">{{ scoreLabel }}</div>
        <div class="score-stats">
          <span class="nb-tag accent">高 {{ report.bySeverity.high }}</span>
          <span class="nb-tag warning">中 {{ report.bySeverity.medium }}</span>
          <span class="nb-tag">低 {{ report.bySeverity.low }}</span>
        </div>
      </div>

      <div v-if="report.issues.length === 0" class="nb-alert success mt-16">
        ✓ 未发现兼容性问题，文档结构标准，应在 WPS 与各 Office 版本中正常显示。
      </div>

      <div v-for="(issue, idx) in report.issues" :key="idx" class="nb-card mt-16 issue-card" :class="issue.severity">
        <div class="issue-head">
          <span class="nb-tag" :class="issue.severity === 'high' ? 'accent' : issue.severity === 'medium' ? '' : 'neon'">
            {{ severityLabel[issue.severity] }}风险
          </span>
          <strong>{{ issue.category }}</strong>
          <code class="issue-item">{{ issue.item }}</code>
        </div>
        <div class="issue-detail mt-16">{{ issue.detail }}</div>
        <div class="issue-fix mt-16">
          <strong>修复建议:</strong> {{ issue.fix }}
        </div>
      </div>
    </div>

    <div v-if="error" class="nb-alert danger mt-16">{{ error }}</div>

    <div v-if="!file" class="nb-alert info mt-16">
      <strong>检测维度:</strong>
      <ul>
        <li>VBA 宏代码 (兼容性高风险)</li>
        <li>SmartArt 图形 (布局可能错位)</li>
        <li>嵌入 OLE 对象 (无法编辑)</li>
        <li>自定义动画时间线 (PPT)</li>
        <li>主题字体 (字体缺失)</li>
        <li>文档保护机制</li>
      </ul>
    </div>

    <ResultViewer :files="[]" />
  </ToolLayout>
</template>

<style scoped>
.file-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.score-card {
  padding: 24px;
  text-align: center;
  border-left: 8px solid var(--ink);
}
.score-card.good { border-left-color: var(--neon-deep); background: linear-gradient(to right, var(--neon) 0%, var(--paper-card) 30%); }
.score-card.medium { border-left-color: var(--warning); background: linear-gradient(to right, var(--warning) 0%, var(--paper-card) 30%); }
.score-card.bad { border-left-color: var(--danger); background: linear-gradient(to right, var(--accent-soft) 0%, var(--paper-card) 30%); }
.score-num {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
}
.score-label {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-soft);
  margin-top: 4px;
}
.score-stats { display: flex; gap: 8px; justify-content: center; margin-top: 12px; }
.issue-card { padding: 14px; border-left: 6px solid var(--ink); }
.issue-card.high { border-left-color: var(--danger); }
.issue-card.medium { border-left-color: var(--warning); }
.issue-card.low { border-left-color: var(--neon-deep); }
.issue-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.issue-item {
  background: var(--ink); color: var(--neon);
  padding: 2px 8px; font-family: var(--font-mono); font-size: 11px;
}
.issue-detail {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
}
.issue-fix {
  font-size: 13px;
  padding: 8px 12px;
  background: var(--paper-bg);
  border: 2px dashed var(--ink);
}
ul { margin: 6px 0 0 20px; }
</style>

<script setup>
/**
 * FileCut 首页 - 功能总览
 */
import { categories, allTools } from '../router/categories.js'
import { useSchemaOrg } from '../composables/useSchemaOrg.js'

const stats = [
  { num: allTools.length, label: '工具数量' },
  { num: '0', label: '后端依赖' },
  { num: '∞', label: '使用次数' },
  { num: '100%', label: '本地处理' }
]

const faqs = [
  {
    question: 'FileCut 是免费的吗？',
    answer: `是的，FileCut 目前完全免费。网站提供 ${allTools.length} 个在线文件工具，无需注册、无每日次数限制、无文件大小限制，所有处理在浏览器本地完成。`
  },
  {
    question: 'FileCut 的文件处理安全吗？会不会泄露隐私？',
    answer: 'FileCut 采用纯前端架构，所有文件解析、转换、压缩都在用户自己的浏览器内完成，文件不会上传到任何服务器。因此不存在服务器被攻击、运营方滥用或第三方审查导致的隐私泄露风险，适合处理合同、论文、证件等敏感文件。'
  },
  {
    question: 'FileCut 支持哪些文件格式？',
    answer: 'FileCut 支持 PDF、Word（docx）、Excel（xlsx）、PPT（pptx）、图片（JPG/PNG/WEBP/HEIC/AVIF 等）、音视频（MP4/MP3 等）、ZIP、EPUB、CSV、JSON、YAML、XML、Markdown、字体（TTF/OTF/WOFF）等数十种格式。'
  },
  {
    question: '为什么 FileCut 不需要安装软件？',
    answer: 'FileCut 使用 WebAssembly、Web Worker 和现代浏览器 API，将原本需要桌面软件的解析能力搬到浏览器中。用户打开网页即可使用，无需下载安装，也无需担心软件版本和系统兼容性问题。'
  },
  {
    question: 'FileCut 和 Smallpdf、迅捷 PDF 有什么区别？',
    answer: 'Smallpdf、迅捷 PDF 等工具通常需要将文件上传到服务器处理，免费版可能有次数、大小或水印限制；FileCut 的所有处理在本地完成，无需上传、无限制、无水印。如果你处理的是敏感文件或不想被平台约束，FileCut 是更稳妥的选择。'
  }
]

const homeFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer }
  }))
}

useSchemaOrg(homeFaqSchema, 'home-faq-schema')
</script>

<template>
  <div class="home">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-grid">
        <div class="hero-left">
          <div class="hero-tag nb-tag neon">SECURE · LOCAL · UNLIMITED</div>
          <h1 class="hero-title">
            <span class="hero-line">文件</span>
            <span class="hero-line hero-line-accent">剪·切·变</span>
            <span class="hero-line">一个不传服务器的</span>
            <span class="hero-line">文档工具站</span>
          </h1>
          <p class="hero-desc">
            {{ allTools.length }} 个工具，覆盖 PDF / Word / Excel / PPT / 图片 / 音视频 / 字体 / 电子书 / 二维码...
            所有处理都在<strong>浏览器内</strong>完成，文件永不上传，无次数限制，无大小限制。
          </p>
          <div class="hero-cta">
            <a href="/category/pdf" class="nb-btn primary lg">开始使用 →</a>
            <a href="/special/convert-wizard" class="nb-btn lg">不知道用哪个？</a>
          </div>
          <div class="hero-stats">
            <div v-for="s in stats" :key="s.label" class="stat-item">
              <div class="stat-num">{{ s.num }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
        </div>
        <div class="hero-right">
          <div class="hero-card nb-card">
            <div class="hero-card-title">为什么不用在线工具？</div>
            <ul class="hero-list">
              <li><strong>合同/财报/证件</strong>上传到陌生服务器 = 隐私泄露</li>
              <li><strong>免费版限制</strong>每天 2 次、10MB 上限、加水印</li>
              <li><strong>批量处理</strong>被次数卡死，重排 3 小时</li>
              <li><strong>中文乱码</strong>表格错位、公式变图片</li>
              <li><strong>WPS/Office</strong>互转动画丢失、SmartArt 碎裂</li>
            </ul>
            <div class="hero-card-foot">→ FileCut 全部解决</div>
          </div>
        </div>
      </div>
    </section>

    <!-- TL;DR / 核心价值 -->
    <section class="section">
      <div class="nb-card value-card">
        <div class="nb-tag accent mb-16">一句话说明</div>
        <p class="tldr">
          FileCut 是一个纯前端在线文件工具站，{{ allTools.length }} 个工具全部在浏览器本地运行，无需上传文件、无需注册、无使用限制。适合学生、教师和办公人群处理 PDF/Word/Excel/PPT/图片/音视频等文件，从根源上避免隐私泄露。
        </p>
      </div>
    </section>

    <!-- 功能分类 -->
    <section class="categories">
      <h2 class="nb-h2 section-title">所有工具 / {{ allTools.length }} 个</h2>
      <div class="categories-grid">
        <a v-for="cat in categories" :key="cat.id" :href="`/category/${cat.id}`" class="cat-card nb-card">
          <div class="cat-icon">{{ cat.icon }}</div>
          <div class="cat-name">{{ cat.name }}</div>
          <div class="cat-desc">{{ cat.desc }}</div>
          <div class="cat-count">{{ cat.tools.length }} 个工具 →</div>
        </a>
      </div>
    </section>

    <!-- 内容集群入口 -->
    <section class="section">
      <h2 class="nb-h2 section-title">使用指南与对比</h2>
      <div class="nb-grid cols-2">
        <a href="/guide/pdf-to-word" class="nb-card read-more">
          <div class="nb-h3 mb-8">PDF 转 Word 完全指南</div>
          <p>5 种方法对比，含实测数据与操作步骤。</p>
        </a>
        <a href="/guide/best-free-pdf-tools" class="nb-card read-more">
          <div class="nb-h3 mb-8">10 款免费 PDF 工具实测对比</div>
          <p>Adobe、Smallpdf、迅捷、万兴、FileCut 等选型参考。</p>
        </a>
        <a href="/guide/image-compress-privacy" class="nb-card read-more">
          <div class="nb-h3 mb-8">图片压缩隐私指南</div>
          <p>证件照、合同截图为什么不建议上传在线工具。</p>
        </a>
        <a href="/guide/student-file-workflow" class="nb-card read-more">
          <div class="nb-h3 mb-8">学生党文件处理工作流</div>
          <p>论文、课件、作业、资料整理的本地方案。</p>
        </a>
      </div>
    </section>

    <!-- 全部工具列表 -->
    <section class="all-tools">
      <h2 class="nb-h2 section-title">完整功能清单</h2>
      <div v-for="cat in categories" :key="cat.id" class="tool-group">
        <div class="tool-group-header">
          <span class="tool-group-icon">{{ cat.icon }}</span>
          <span class="tool-group-name">{{ cat.name }}</span>
          <span class="tool-group-count">{{ cat.tools.length }}</span>
        </div>
        <div class="tools-grid">
          <a v-for="t in cat.tools" :key="t.id" :href="`${t.path}`" class="tool-link">
            <span class="tool-icon">{{ t.icon }}</span>
            <span class="tool-title">{{ t.title }}</span>
            <span class="tool-desc">{{ t.desc }}</span>
          </a>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="section">
      <h2 class="nb-h2 section-title">常见问题</h2>
      <div class="faq-list">
        <details v-for="(f, idx) in faqs" :key="idx" class="faq-item nb-card" open>
          <summary class="faq-q">{{ f.question }}</summary>
          <p class="faq-a">{{ f.answer }}</p>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  padding: 32px 0 48px;
  border-bottom: 4px solid var(--ink);
  margin-bottom: 48px;
}
.hero-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 32px;
  align-items: start;
}
.hero-tag { margin-bottom: 16px; }
.hero-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.5rem, 6vw, 5rem);
  line-height: 0.95;
  letter-spacing: -0.04em;
  margin-bottom: 16px;
}
.hero-line { display: block; }
.hero-line-accent {
  color: var(--accent);
  background: var(--neon);
  padding: 0 12px;
  display: inline-block;
  transform: rotate(-1deg);
  box-shadow: 5px 5px 0 var(--ink);
  border: 3px solid var(--ink);
  margin: 8px 0;
}
.hero-desc {
  font-size: 16px;
  color: var(--ink-soft);
  margin: 24px 0 24px;
  max-width: 540px;
  line-height: 1.6;
}
.hero-desc strong { color: var(--ink); }
.hero-cta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 32px; }
.hero-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 24px;
}
.stat-item {
  border: 3px solid var(--ink);
  padding: 12px;
  background: var(--paper-card);
}
.stat-num {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
}
.stat-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  margin-top: 4px;
}

.hero-card-title {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 12px;
}
.hero-list { list-style: none; padding: 0; }
.hero-list li {
  padding: 8px 0;
  font-size: 13px;
  font-family: var(--font-mono);
  border-bottom: 1px dashed var(--ink);
  color: var(--ink-soft);
}
.hero-list li:last-child { border-bottom: none; }
.hero-list li strong { color: var(--ink); }
.hero-card-foot {
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--accent);
}

.section { margin-bottom: 48px; }
.section-title {
  margin-bottom: 24px;
  padding-bottom: 8px;
  border-bottom: 3px solid var(--ink);
}
.value-card { margin-bottom: 16px; }
.tldr {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-soft);
  max-width: 760px;
}
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 48px;
}
.cat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cat-icon { font-size: 2rem; }
.cat-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
  margin-top: 4px;
}
.cat-desc {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  margin: 4px 0 12px;
}
.cat-count {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  margin-top: auto;
}

.all-tools { margin-top: 48px; }
.tool-group { margin-bottom: 32px; }
.tool-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 2px dashed var(--ink);
  margin-bottom: 12px;
}
.tool-group-icon { font-size: 1.4rem; }
.tool-group-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.3rem;
}
.tool-group-count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  padding: 2px 8px;
  border: 2px solid var(--ink);
  background: var(--paper-card);
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.tool-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  background: var(--paper-card);
  border: 2px solid var(--ink);
  font-size: 13px;
  transition: all 0.1s ease;
}
.tool-link:hover {
  background: var(--neon);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--ink);
}
.tool-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 12px;
  color: var(--accent);
}
.tool-title {
  font-weight: 600;
  font-size: 13px;
}
.tool-desc {
  font-size: 11px;
  color: var(--ink-soft);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nb-grid.cols-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.read-more:hover { background: var(--neon); }
.read-more p { font-size: 13px; color: var(--ink-soft); margin-top: 4px; }
.faq-list { display: flex; flex-direction: column; gap: 12px; }
.faq-item { padding: 16px; }
.faq-q { font-family: var(--font-mono); font-weight: 700; font-size: 14px; cursor: pointer; list-style: none; }
.faq-q::-webkit-details-marker { display: none; }
.faq-a { margin-top: 12px; font-size: 14px; line-height: 1.7; color: var(--ink-soft); }
.mb-8 { margin-bottom: 8px; }

@media (max-width: 968px) {
  .hero-grid { grid-template-columns: 1fr; }
  .hero-stats { grid-template-columns: repeat(2, 1fr); }
  .nb-grid.cols-2 { grid-template-columns: 1fr; }
}
</style>

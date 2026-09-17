<script setup>
import { useSchemaOrg } from '../../composables/useSchemaOrg.js'

const pageUrl = 'https://filecut.pages.dev/guide/student-file-workflow'
const publishedDate = '2026-07-30'

const faqs = [
  {
    question: '学生党最常用的文件处理场景有哪些？',
    answer: '最常见的场景包括：PDF 论文转 Word 修改、PPT 课件转图片分享到班级群、Excel 成绩表转 CSV 导入系统、图片压缩后提交作业、批量重命名整理资料、PDF 合并提交作品集、Word 隐私清理去除作者信息。'
  },
  {
    question: '论文 PDF 转 Word 后格式乱了怎么办？',
    answer: '论文通常包含公式、图表、脚注和特殊字体，转换后轻微错位是正常的。建议：1）优先使用原生电子 PDF 转换；2）转换后用 Word 的「样式」功能统一调整标题和正文；3）公式和复杂图表建议手动校对或重新插入；4）使用 FileCut 本地转换保护论文内容不外泄。'
  },
  {
    question: '如何把 PPT 课件转成图片发给学生？',
    answer: '使用 FileCut 的 <a href="/ppt/ppt-to-image" class="inline-link">PPT 转图片</a> 工具，可以将每一页 PPT 导出为高清 PNG/JPG。也可以导出为图片合集 PDF，方便在微信、钉钉、邮件中分享。所有处理在本地完成，课件内容不会上传到第三方平台。'
  },
  {
    question: '提交作业前图片太大怎么办？',
    answer: '使用 <a href="/image/image-compress" class="inline-link">图片压缩</a> 或 <a href="/image/image-batch-compress" class="inline-link">批量图片压缩</a> 工具。可以设置目标文件大小或压缩质量，支持 JPEG、PNG、WebP 输出。作业截图、实验照片、证件照都可以快速压缩到平台要求的大小。'
  },
  {
    question: '老师发下来的 Word 文档怎么去除作者信息？',
    answer: '使用 <a href="/word/word-clean" class="inline-link">Word 隐私清理</a> 工具，可以删除文档中的作者名、修订记录、批注、隐藏文本和元数据。这在提交作业或共享文档时尤为重要，避免暴露个人隐私或编辑历史。'
  }
]

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: '学生党文件处理工作流：论文/课件/资料一键转换与整理',
  description: '针对学生与教师的文件处理工作流：PDF 转 Word 改论文、PPT 转图片做课件、图片压缩交作业、批量重命名整理资料，全部本地完成。',
  author: { '@type': 'Organization', name: 'FileCut', url: 'https://filecut.pages.dev/' },
  publisher: { '@type': 'Organization', name: 'FileCut', logo: { '@type': 'ImageObject', url: 'https://filecut.pages.dev/favicon.svg' } },
  datePublished: publishedDate,
  dateModified: publishedDate,
  url: pageUrl,
  mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl }
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer }
  }))
}

useSchemaOrg({ '@context': 'https://schema.org', '@graph': [articleSchema, faqSchema] }, 'student-workflow-schema')
</script>

<template>
  <article class="guide-page">
    <header class="nb-card hero-card">
      <div class="nb-tag accent mb-16">工作流指南</div>
      <h1 class="nb-title">学生党文件处理工作流：论文/课件/资料一键转换与整理</h1>
      <p class="nb-subtitle">更新于 2026 年 7 月 · 面向学生与教师</p>
      <p class="tldr">
        学生与教师的文件处理需求高度重复：改论文、做课件、交作业、整资料。这些场景的核心痛点是格式转换、文件大小和隐私安全。用本地工具组合处理，可以省去安装多个软件的麻烦，同时避免敏感学术资料外泄。
      </p>
    </header>

    <section class="section">
      <h2 class="nb-h2 section-title">场景一：论文 PDF 转 Word 修改</h2>
      <div class="nb-card workflow-card">
        <div class="workflow-steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">上传 PDF</div>
              <p>打开 <a href="/pdf/pdf-to-word" class="inline-link">PDF 转 Word</a>，将导师或知网下载的论文 PDF 拖入。文件不离开电脑。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">本地转换</div>
              <p>等待 5-15 秒，工具在浏览器内解析 PDF 结构并生成 .docx。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">修改与校对</div>
              <p>用 Word 或 WPS 打开，重点检查公式、图表和参考文献格式，文字部分通常可直接使用。</p>
            </div>
          </div>
        </div>
        <div class="nb-alert success mt-16">
          <strong>隐私提示：</strong>论文可能包含未发表的研究数据，建议优先使用本地转换工具，避免上传到在线平台。
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">场景二：PPT 课件转图片分享</h2>
      <div class="nb-card workflow-card">
        <div class="workflow-steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">选择输出格式</div>
              <p>打开 <a href="/ppt/ppt-to-image" class="inline-link">PPT 转图片</a>，选择每张幻灯片导出为 PNG 或 JPG。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">设置清晰度</div>
              <p>根据分享场景选择分辨率。微信分享建议 1080p，打印建议 2K 以上。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">批量下载</div>
              <p>下载压缩包后解压，按页码顺序发送到班级群或上传学习平台。</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">场景三：作业图片压缩与批量整理</h2>
      <div class="nb-card workflow-card">
        <div class="workflow-steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">批量压缩</div>
              <p>使用 <a href="/image/image-batch-compress" class="inline-link">批量图片压缩</a>，将实验报告、手写笔记照片一次性压缩到平台要求大小。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">重命名</div>
              <p>使用 <a href="/image/image-batch-rename" class="inline-link">批量图片重命名</a> 或 <a href="/file/file-rename" class="inline-link">文件批量重命名</a>，按「学号_姓名_序号」规则统一命名。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">打包提交</div>
              <p>使用 <a href="/archive/zip-create" class="inline-link">ZIP 压缩</a> 打包成一个文件，方便上传教务系统或邮件发送。</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">场景四：Excel 数据整理与图表</h2>
      <div class="nb-card workflow-card">
        <div class="workflow-steps">
          <div class="step">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">数据转换</div>
              <p>使用 <a href="/excel/excel-to-csv" class="inline-link">Excel 转 CSV</a> 或 <a href="/excel/excel-to-json" class="inline-link">Excel 转 JSON</a>，将表格数据导入分析工具或程序。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">生成图表</div>
              <p>使用 <a href="/excel/excel-chart" class="inline-link">Excel 图表生成</a>，从表格数据快速生成柱状图、折线图或饼图。</p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <div class="step-body">
              <div class="nb-h3 mb-8">导出分享</div>
              <p>将生成的图表保存为图片，插入论文或 PPT 中使用。</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">工具组合推荐</h2>
      <div class="nb-grid cols-2">
        <div class="nb-card">
          <div class="nb-h3 mb-8">学生必备组合</div>
          <ul class="tool-list">
            <li><a href="/pdf/pdf-to-word" class="inline-link">PDF 转 Word</a>：改论文、改资料</li>
            <li><a href="/ppt/ppt-to-image" class="inline-link">PPT 转图片</a>：分享课件</li>
            <li><a href="/image/image-batch-compress" class="inline-link">批量图片压缩</a>：交作业</li>
            <li><a href="/word/word-clean" class="inline-link">Word 隐私清理</a>：去作者信息</li>
          </ul>
        </div>
        <div class="nb-card">
          <div class="nb-h3 mb-8">教师必备组合</div>
          <ul class="tool-list">
            <li><a href="/pdf/pdf-merge" class="inline-link">PDF 合并</a>：合并学生作业</li>
            <li><a href="/image/image-compress" class="inline-link">图片压缩</a>：压缩学生提交材料</li>
            <li><a href="/excel/excel-filter" class="inline-link">Excel 筛选排序</a>：整理成绩</li>
            <li><a href="/file/file-rename" class="inline-link">文件批量重命名</a>：统一命名</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">常见问题</h2>
      <div class="faq-list">
        <details v-for="(f, idx) in faqs" :key="idx" class="faq-item nb-card" open>
          <summary class="faq-q">{{ f.question }}</summary>
          <p class="faq-a" v-html="f.answer"></p>
        </details>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">延伸阅读</h2>
      <div class="nb-grid cols-2">
        <a href="/guide/pdf-to-word" class="nb-card read-more">
          <div class="nb-h3 mb-8">PDF 转 Word 完全指南</div>
          <p>5 种方法对比，含实测数据与操作步骤。</p>
        </a>
        <a href="/guide/image-compress-privacy" class="nb-card read-more">
          <div class="nb-h3 mb-8">图片压缩隐私指南</div>
          <p>为什么证件照和作业截图不该上传到在线工具。</p>
        </a>
      </div>
    </section>
  </article>
</template>

<style scoped>
.guide-page { padding: 24px 0; }
.hero-card { margin-bottom: 32px; }
.tldr { font-size: 16px; line-height: 1.7; color: var(--ink-soft); margin-top: 16px; max-width: 760px; }
.section { margin-bottom: 32px; }
.section-title { margin-bottom: 16px; padding-bottom: 8px; border-bottom: 3px solid var(--ink); }
.workflow-steps { display: flex; flex-direction: column; gap: 16px; }
.step { display: flex; gap: 16px; align-items: flex-start; }
.step-num {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--neon);
  border: 2px solid var(--ink);
  font-family: var(--font-mono);
  font-weight: 700;
}
.step-body { flex: 1; }
.step-body p { font-size: 14px; line-height: 1.6; color: var(--ink-soft); }
.tool-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.tool-list li { font-size: 14px; }
.inline-link { color: var(--accent); text-decoration: underline; }
.inline-link:hover { color: var(--accent-deep); }
.faq-list { display: flex; flex-direction: column; gap: 12px; }
.faq-item { padding: 16px; }
.faq-q { font-family: var(--font-mono); font-weight: 700; font-size: 14px; cursor: pointer; list-style: none; }
.faq-q::-webkit-details-marker { display: none; }
.faq-a { margin-top: 12px; font-size: 14px; line-height: 1.7; color: var(--ink-soft); }
.read-more:hover { background: var(--neon); }
.mb-8 { margin-bottom: 8px; }
.mb-16 { margin-bottom: 16px; }
.mt-16 { margin-top: 16px; }
.mt-24 { margin-top: 24px; }
@media (max-width: 768px) {
  .nb-grid.cols-2 { grid-template-columns: 1fr; }
  .step { flex-direction: column; gap: 8px; }
}
</style>

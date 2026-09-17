<script setup>
import { useSchemaOrg } from '../../composables/useSchemaOrg.js'

const pageUrl = 'https://filecut.pages.dev/guide/image-compress-privacy'
const publishedDate = '2026-07-30'

const faqs = [
  {
    question: '在线图片压缩工具会保存我的照片吗？',
    answer: '大多数在线图片压缩工具会在服务器端处理文件，处理完成后通常会删除，但删除时间、是否保留日志、是否用于模型训练取决于服务商隐私政策。部分免费工具会在用户协议中保留「改进服务」的权利，这意味着你的图片可能被用于算法优化。'
  },
  {
    question: '证件照、合同截图上传到在线工具有什么风险？',
    answer: '证件照包含人脸、身份证号等生物识别信息；合同截图包含商业条款、签章、甲乙双方信息。这些信息一旦上传到第三方服务器，可能面临：1）服务器被攻击导致数据泄露；2）服务商内部人员访问；3）数据被用于训练 AI 模型或被转卖给第三方。'
  },
  {
    question: '如何在不上传的情况下压缩图片？',
    answer: '可以使用浏览器本地工具（如 FileCut 图片压缩）、桌面软件（如 Photoshop、GIMP、ImageMagick）或命令行工具（如 cjpeg、pngquant）。浏览器本地工具通过 WebAssembly 在本地运行压缩算法，文件不会离开设备。'
  },
  {
    question: '本地压缩图片的效果和在线工具一样吗？',
    answer: '对于常见的 JPEG 质量压缩、PNG 量化，本地工具可以达到与在线工具相同甚至更好的效果。FileCut 使用的 browser-image-compression 库支持自定义质量、尺寸和文件类型，对证件照、截图、商品图的压缩效果稳定。'
  },
  {
    question: '压缩后的图片还能恢复原始信息吗？',
    answer: '有损压缩（如 JPEG）会永久丢失部分像素信息，无法完全恢复原始文件。但 EXIF 元数据（拍摄时间、地点、设备型号）可以在压缩前被剥离，进一步保护隐私。FileCut 提供 EXIF 清理工具，可在压缩前删除这些元数据。'
  }
]

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: '图片压缩隐私指南：为什么你的证件照/合同不该上传在线工具',
  description: '在线图片压缩工具如何处理你的文件？上传风险有哪些？教你用浏览器本地工具压缩图片，保护身份证、合同、发票隐私。',
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

useSchemaOrg({ '@context': 'https://schema.org', '@graph': [articleSchema, faqSchema] }, 'image-privacy-schema')
</script>

<template>
  <article class="guide-page">
    <header class="nb-card hero-card">
      <div class="nb-tag accent mb-16">隐私指南</div>
      <h1 class="nb-title">图片压缩隐私指南：为什么你的证件照/合同不该上传在线工具</h1>
      <p class="nb-subtitle">更新于 2026 年 7 月 · 面向学生、办公族与电商从业者</p>
      <p class="tldr">
        一张身份证截图上传到免费压缩网站后，可能被保留 7-30 天，甚至被用于 AI 训练。保护隐私的最简单方法是：用浏览器本地工具完成压缩，文件不离开电脑。
      </p>
    </header>

    <section class="section">
      <h2 class="nb-h2 section-title">在线图片压缩的数据流向</h2>
      <div class="nb-card">
        <p class="mb-16">当你把图片拖到某个在线压缩网站时，实际发生的链路通常是：</p>
        <ol class="causal-list">
          <li><strong>浏览器上传：</strong>图片从你的设备传输到服务商 CDN 或应用服务器。</li>
          <li><strong>服务器处理：</strong>图片在云端被解码、压缩、重新编码。</li>
          <li><strong>结果返回：</strong>压缩后的图片下载回你的设备。</li>
          <li><strong>后台留存：</strong>部分服务会保留原始文件一段时间用于调试、审计或模型训练。</li>
        </ol>
        <p class="mt-16">这个链路的危险点在于：即使服务商承诺「处理完立即删除」，传输过程中仍存在中间人攻击、CDN 日志、服务器缓存等不可控环节。</p>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">哪些图片尤其不能上传</h2>
      <div class="nb-grid cols-2">
        <div class="nb-card risk-card">
          <div class="nb-h3 mb-8">身份证 / 护照 / 驾照</div>
          <p>包含姓名、身份证号、人脸照片、住址。一旦泄露，可被用于实名认证、贷款申请、诈骗等。</p>
        </div>
        <div class="nb-card risk-card">
          <div class="nb-h3 mb-8">合同 / 发票 / 银行单据</div>
          <p>包含商业条款、金额、账户信息、签章。泄露可能导致商业机密外泄或金融欺诈。</p>
        </div>
        <div class="nb-card risk-card">
          <div class="nb-h3 mb-8">学生证 / 成绩单 / 论文</div>
          <p>包含学校、学号、成绩、研究内容。上传到不可控平台可能被用于学术不端检测或数据贩卖。</p>
        </div>
        <div class="nb-card risk-card">
          <div class="nb-h3 mb-8">设计稿 / 产品图 / 原型</div>
          <p>包含未发布的商业创意。免费工具可能通过「改进服务」条款使用这些图片训练模型。</p>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">本地压缩的 3 种方式</h2>
      <div class="nb-card">
        <div class="method-row">
          <div class="nb-h3 mb-8">1. 浏览器本地工具（推荐）</div>
          <p>访问 <a href="/image/image-compress" class="inline-link">FileCut 图片压缩</a>，拖拽图片即可压缩。所有计算在浏览器内完成，无需注册、无水印、无大小限制。支持 JPEG 质量调节、PNG 量化、尺寸缩放和 WebP 输出。</p>
        </div>
        <div class="method-row mt-24">
          <div class="nb-h3 mb-8">2. 桌面软件</div>
          <p>Photoshop「导出为 Web 所用格式」、GIMP「导出为 JPEG/PNG」、ImageMagick 命令行。适合专业用户批量处理。</p>
        </div>
        <div class="method-row mt-24">
          <div class="nb-h3 mb-8">3. 命令行工具</div>
          <p>使用 cjpeg、pngquant、mozjpeg 等开源工具。适合开发者和需要自动化流程的场景。</p>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">压缩前别忘了清理 EXIF</h2>
      <div class="nb-card">
        <p class="mb-16">JPEG 图片通常包含 EXIF 元数据，可能记录：拍摄设备、GPS 坐标、拍摄时间、光圈快门等。这些信息与图片内容无关，但会暴露你的位置和设备信息。</p>
        <p>FileCut 提供 <a href="/image/image-exif-clean" class="inline-link">EXIF 批量清理</a> 工具，可以在压缩前一键删除所有元数据，进一步降低隐私风险。</p>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">常见问题</h2>
      <div class="faq-list">
        <details v-for="(f, idx) in faqs" :key="idx" class="faq-item nb-card" open>
          <summary class="faq-q">{{ f.question }}</summary>
          <p class="faq-a">{{ f.answer }}</p>
        </details>
      </div>
    </section>

    <section class="section">
      <h2 class="nb-h2 section-title">延伸阅读</h2>
      <div class="nb-grid cols-2">
        <a href="/guide/student-file-workflow" class="nb-card read-more">
          <div class="nb-h3 mb-8">学生党文件处理工作流</div>
          <p>论文、课件、资料一键转换与整理的本地方案。</p>
        </a>
        <a href="/about" class="nb-card read-more">
          <div class="nb-h3 mb-8">FileCut 本地处理理念</div>
          <p>为什么文件永不上传是更安全的文件处理方式。</p>
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
.causal-list { list-style: decimal; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
.causal-list li { font-size: 14px; line-height: 1.6; }
.causal-list strong { color: var(--accent); }
.risk-card p { font-size: 13px; line-height: 1.6; color: var(--ink-soft); }
.method-row { padding-bottom: 16px; border-bottom: 2px dashed var(--ink); }
.method-row:last-child { border-bottom: none; padding-bottom: 0; }
.method-row p { font-size: 14px; line-height: 1.6; color: var(--ink-soft); }
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
}
</style>

<script setup>
import { categories, allTools } from '../router/categories.js'
import { aboutFaqs as faqs } from '../data/faqs.js'
import { useSchemaOrg } from '../composables/useSchemaOrg.js'

const toolCount = allTools.length
const categoryCount = categories.length

const structuredFaqs = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.answer
    }
  }))
}

useSchemaOrg(structuredFaqs, 'about-faq-schema')
</script>

<template>
  <div class="about-page">
    <!-- TL;DR -->
    <section class="nb-card hero-card">
      <div class="nb-tag neon mb-16">关于 FileCut</div>
      <h1 class="nb-title">一个不传服务器的文档工具站</h1>
      <p class="tldr">
        FileCut 是面向学生、教师和办公人群的纯前端文件工具集合，{{ toolCount }} 个工具全部在浏览器本地运行，文件永不上传、无次数限制、无需注册。核心差异：用本地算力替代服务器处理，从根源上消除隐私泄露风险。
      </p>
    </section>

    <!-- 核心因果链：为什么本地处理更重要 -->
    <section class="section">
      <h2 class="nb-h2 section-title">为什么我们要做「零上传」</h2>
      <div class="nb-card">
        <p class="mb-16">
          传统在线文件工具的链路是：用户上传文件 → 服务器解析 → 返回结果。这个链路里有 3 个不可控点：
        </p>
        <ol class="causal-list">
          <li><strong>传输层风险：</strong>上传过程可能被中间人截获，尤其在使用公共 Wi-Fi 时。</li>
          <li><strong>存储层风险：</strong>服务器通常会保留缓存日志，运营方或攻击者可能访问这些文件。</li>
          <li><strong>合规层风险：</strong>合同、财报、证件、论文等敏感文件一旦离开本地，就进入不可控的第三方环境。</li>
        </ol>
        <p class="mt-16">
          FileCut 的解决路径是「数据不动，算法动」：所有解析库（pdf.js、pdf-lib、SheetJS、mammoth、FFmpeg 等）通过 WebAssembly 加载到浏览器，文件读取、处理、导出全部发生在本地内存，处理完成后原始数据即被浏览器垃圾回收释放。
        </p>
      </div>
    </section>

    <!-- 实体与数据 -->
    <section class="section">
      <h2 class="nb-h2 section-title">产品事实与数据</h2>
      <div class="nb-grid cols-2">
        <div class="nb-card stat-card">
          <div class="stat-num">{{ toolCount }}</div>
          <div class="stat-label">在线工具数量</div>
        </div>
        <div class="nb-card stat-card">
          <div class="stat-num">{{ categoryCount }}</div>
          <div class="stat-label">工具分类</div>
        </div>
        <div class="nb-card stat-card">
          <div class="stat-num">0</div>
          <div class="stat-label">后端服务器数量</div>
        </div>
        <div class="nb-card stat-card">
          <div class="stat-num">∞</div>
          <div class="stat-label">每日处理次数上限</div>
        </div>
      </div>
    </section>

    <!-- 适用人群 -->
    <section class="section">
      <h2 class="nb-h2 section-title">谁适合用 FileCut</h2>
      <div class="nb-grid cols-2">
        <div class="nb-card">
          <div class="nb-h3 mb-8">学生 / 教师</div>
          <p>论文 PDF 转 Word 修改、课件 PPT 转图片分享、Excel 成绩表转 CSV、图片压缩后交作业。所有操作不涉及学校或第三方服务器。</p>
        </div>
        <div class="nb-card">
          <div class="nb-h3 mb-8">办公职员 / 行政</div>
          <p>合同 PDF 合并、发票图片压缩、Word 隐私清理、文件哈希校验。敏感商业文件无需离开本地电脑。</p>
        </div>
      </div>
    </section>

    <!-- FAQ with Schema -->
    <section class="section">
      <h2 class="nb-h2 section-title">常见问题</h2>
      <div class="faq-list">
        <details v-for="(f, idx) in faqs" :key="idx" class="faq-item nb-card" open>
          <summary class="faq-q">{{ f.question }}</summary>
          <p class="faq-a">{{ f.answer }}</p>
        </details>
      </div>
    </section>

    <!-- 延伸阅读 -->
    <section class="section">
      <h2 class="nb-h2 section-title">延伸阅读</h2>
      <div class="nb-grid cols-2">
        <a href="/guide/pdf-to-word" class="nb-card read-more">
          <div class="nb-h3 mb-8">PDF 转 Word 完全指南</div>
          <p>对比 5 种 PDF 转 Word 方法，含本地处理方案与常见问题。</p>
        </a>
        <a href="/guide/image-compress-privacy" class="nb-card read-more">
          <div class="nb-h3 mb-8">图片压缩隐私指南</div>
          <p>为什么证件照、合同截图不该上传到在线压缩工具。</p>
        </a>
      </div>
    </section>

  </div>
</template>

<style scoped>
.about-page { padding: 24px 0; }
.hero-card { margin-bottom: 32px; }
.tldr {
  font-size: 16px;
  line-height: 1.7;
  color: var(--ink-soft);
  margin-top: 16px;
  max-width: 760px;
}
.section { margin-bottom: 32px; }
.section-title { margin-bottom: 16px; padding-bottom: 8px; border-bottom: 3px solid var(--ink); }
.causal-list {
  list-style: decimal;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.causal-list li { font-size: 14px; line-height: 1.6; }
.causal-list strong { color: var(--accent); }
.stat-card { text-align: center; }
.stat-num {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 700;
  color: var(--accent);
}
.stat-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 4px;
}
.faq-list { display: flex; flex-direction: column; gap: 12px; }
.faq-item { padding: 16px; }
.faq-q {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  list-style: none;
}
.faq-q::-webkit-details-marker { display: none; }
.faq-a {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.read-more:hover { background: var(--neon); }
.mb-8 { margin-bottom: 8px; }
.mb-16 { margin-bottom: 16px; }
.mt-16 { margin-top: 16px; }
@media (max-width: 768px) {
  .nb-grid.cols-2 { grid-template-columns: 1fr; }
}
</style>

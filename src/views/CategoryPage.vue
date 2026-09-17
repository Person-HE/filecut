<script setup>
/**
 * 分类页面 - 显示某个分类下的所有工具
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { categories } from '../router/categories.js'

const route = useRoute()
const category = computed(() => categories.find(c => c.id === route.params.id))
</script>

<template>
  <div class="category-page" v-if="category">
    <div class="breadcrumb nb-subtitle">
      <a href="/">首页</a> / {{ category.name }}
    </div>
    <h1 class="nb-title">
      <span class="cat-icon">{{ category.icon }}</span>
      {{ category.name }}
    </h1>
    <p class="cat-desc">{{ category.desc }} · 共 {{ category.tools.length }} 个工具</p>

    <div class="tools-grid">
      <a v-for="t in category.tools" :key="t.id" :href="`${t.path}`" class="tool-card nb-card">
        <div class="tool-card-icon">{{ t.icon }}</div>
        <div class="tool-card-title">{{ t.title }}</div>
        <div class="tool-card-desc">{{ t.desc }}</div>
        <div class="tool-card-cta">打开 →</div>
      </a>
    </div>
  </div>
  <div v-else class="not-found">
    <h1 class="nb-title">分类不存在</h1>
    <a href="/" class="nb-btn primary">返回首页</a>
  </div>
</template>

<style scoped>
.category-page { padding: 24px 0; }
.breadcrumb { margin-bottom: 8px; }
.breadcrumb a:hover { color: var(--accent); }
.cat-icon { display: inline-block; margin-right: 12px; }
.cat-desc {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-soft);
  margin: 8px 0 32px;
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.tool-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-card-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 18px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ink);
  color: var(--neon);
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--accent);
}
.tool-card-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
}
.tool-card-desc {
  font-size: 13px;
  color: var(--ink-soft);
  flex: 1;
}
.tool-card-cta {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
  margin-top: 8px;
}
.not-found {
  text-align: center;
  padding: 64px 24px;
}
</style>

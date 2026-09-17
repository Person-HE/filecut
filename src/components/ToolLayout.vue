<script setup>
/**
 * 通用工具页面布局
 * - 顶部面包屑+标题+描述
 * - 内容区
 * - 隐私提示横幅
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const props = defineProps({
  title: String,
  desc: String,
  icon: { type: String, default: '' }
})

const route = useRoute()
const categoryName = computed(() => route.meta?.categoryName || '')
</script>

<template>
  <div class="tool-page">
    <div class="privacy-banner nb-alert success">
      <span class="banner-icon">🔒</span>
      <span>100% 浏览器本地处理 · 文件永不上传 · 处理完即销毁</span>
    </div>

    <header class="tool-header">
      <div class="breadcrumb">
        <a href="/">首页</a>
        <span> / </span>
        <a :href="`/category/${route.meta?.category}`">{{ categoryName }}</a>
        <span> / </span>
        <span class="current">{{ title }}</span>
      </div>
      <h1>
        <span v-if="icon" class="title-icon">{{ icon }}</span>
        {{ title }}
      </h1>
      <p v-if="desc" class="desc">{{ desc }}</p>
    </header>

    <div class="tool-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.privacy-banner {
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.banner-icon { font-size: 16px; }
.title-icon {
  display: inline-block;
  width: 48px;
  height: 48px;
  background: var(--ink);
  color: var(--neon);
  text-align: center;
  line-height: 48px;
  font-family: var(--font-mono);
  font-weight: 700;
  margin-right: 12px;
  border: 3px solid var(--ink);
  box-shadow: 4px 4px 0 var(--accent);
  vertical-align: middle;
}
.breadcrumb .current { color: var(--ink); font-weight: 600; }
.tool-content { min-height: 400px; }
</style>

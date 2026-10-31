<script setup>
/**
 * 通用工具页面布局
 * - 顶部面包屑+标题+描述
 * - 内容区
 * - 隐私提示横幅
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { categoryNames, toolNames, toolDescs } from '../i18n/toolNames'

const props = defineProps({
  title: String,
  desc: String,
  icon: { type: String, default: '' }
})

const route = useRoute()
const { t, locale } = useI18n()
const isEn = computed(() => locale.value === 'en-US')

const categoryName = computed(() => {
  const id = route.meta?.category
  if (isEn.value && id && categoryNames[id]) return categoryNames[id]
  return route.meta?.categoryName || ''
})

// 英文环境下用映射表替换中文标题与描述，避免逐个修改 112 个工具页面
const displayTitle = computed(() => {
  if (isEn.value && route.meta?.toolId) return toolNames[route.meta.toolId] || props.title
  return props.title
})

const displayDesc = computed(() => {
  if (isEn.value && route.meta?.toolId) return toolDescs[route.meta.toolId] || props.desc
  return props.desc
})
</script>

<template>
  <div class="tool-page">
    <div class="privacy-banner nb-alert success">
      <span class="banner-icon">🔒</span>
      <span>{{ t('toolLayout.privacy') }}</span>
    </div>

    <header class="tool-header">
      <div class="breadcrumb">
        <a href="/">{{ t('toolLayout.breadcrumbHome') }}</a>
        <span> / </span>
        <a :href="`/category/${route.meta?.category}`">{{ categoryName }}</a>
        <span> / </span>
        <span class="current">{{ displayTitle }}</span>
      </div>
      <h1>
        <span v-if="icon" class="title-icon">{{ icon }}</span>
        {{ displayTitle }}
      </h1>
      <p v-if="displayDesc" class="desc">{{ displayDesc }}</p>
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

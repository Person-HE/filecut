<script setup>
/**
 * 占位工具页 - 路由catch使用
 * 用于尚未实现的功能显示开发中状态
 */
import { useRoute } from 'vue-router'
import { findToolByPath } from '../router/categories.js'

const route = useRoute()
const tool = findToolByPath(route.path)
</script>

<template>
  <div class="placeholder">
    <div class="placeholder-card nb-card">
      <div class="placeholder-icon">{{ tool?.icon || '⚙' }}</div>
      <h1 class="nb-title">{{ tool?.title || '工具开发中' }}</h1>
      <p class="nb-subtitle">{{ tool?.desc || '此工具正在开发中' }}</p>
      <div class="nb-alert warning">
        <strong>状态：</strong>开发中 · 该功能即将上线
      </div>
      <div class="actions">
        <a :href="`/category/${tool?.categoryId || 'pdf'}`" class="nb-btn">查看同类工具</a>
        <a href="/" class="nb-btn primary">返回首页</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  padding: 48px 0;
  display: flex;
  justify-content: center;
}
.placeholder-card {
  max-width: 600px;
  width: 100%;
  text-align: center;
}
.placeholder-icon {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 4rem;
  margin-bottom: 16px;
  color: var(--accent);
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}
</style>

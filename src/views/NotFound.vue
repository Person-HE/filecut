<script setup>
import { categories } from '../router/categories.js'
const cat = categories[0].id
</script>

<template>
  <div class="not-found">
    <div class="big-404">404</div>
    <h1 class="nb-title">页面不存在</h1>
    <p class="nb-subtitle">你访问的工具不存在或尚未实现</p>
    <a href="/" class="nb-btn primary lg">返回首页</a>
  </div>
</template>

<style scoped>
.not-found {
  text-align: center;
  padding: 80px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.big-404 {
  font-family: var(--font-display);
  font-size: clamp(6rem, 20vw, 12rem);
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
  text-shadow: 6px 6px 0 var(--ink);
}
</style>

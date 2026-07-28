<script setup>
import { RouterView } from 'vue-router'
import TopNav from './components/TopNav.vue'
</script>

<template>
  <div class="app-root">
    <TopNav />
    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <footer class="app-footer">
      <div class="footer-inner">
        <span class="footer-brand">FileCut</span>
        <span class="footer-meta">·  100% 浏览器本地处理 · 文件永不上传 · 零限制</span>
        <span class="footer-meta">· 处理即销毁 · 无服务器留存</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--paper-bg);
  background-image:
    radial-gradient(rgba(0,0,0,0.045) 1px, transparent 1px),
    radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px);
  background-size: 24px 24px, 48px 48px;
  background-position: 0 0, 12px 12px;
}
.app-main {
  flex: 1;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}
.app-footer {
  border-top: 3px solid var(--ink);
  background: var(--paper-bg);
  padding: 16px 24px;
  font-family: var(--font-mono);
}
.footer-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--ink);
}
.footer-brand {
  font-weight: 900;
  letter-spacing: -0.02em;
}
.footer-meta {
  color: var(--ink-soft);
}

.page-enter-active, .page-leave-active {
  transition: opacity 0.15s ease, transform 0.2s ease;
}
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-8px); }
</style>

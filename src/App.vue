<script setup>
import { RouterView } from 'vue-router'
import TopNav from './components/TopNav.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
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
        <a href="/" class="footer-brand">FileCut</a>
        <span class="footer-meta">· {{ t('footer.privacy') }}</span>
        <span class="footer-meta">· {{ t('footer.noServer') }}</span>
        <span class="footer-meta">· <a href="/about">{{ t('footer.about') }}</a> · <a href="/guide/pdf-to-word">{{ t('footer.guide') }}</a></span>
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
.footer-brand:hover { color: var(--accent); }
.footer-meta {
  color: var(--ink-soft);
}
.footer-meta a {
  color: var(--ink-soft);
  text-decoration: underline;
}
.footer-meta a:hover { color: var(--accent); }

.page-enter-active, .page-leave-active {
  transition: opacity 0.15s ease, transform 0.2s ease;
}
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-8px); }
</style>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { categories } from '../router/categories'
import { useTheme } from '../composables/useTheme'
import { useLocale } from '../composables/useLocale'
import { categoryNames, categoryIcons, toolNames } from '../i18n/toolNames'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const { currentTheme, setTheme, themes } = useTheme()
const { currentLocale, setLocale, labels, supported } = useLocale()
const mobileOpen = ref(false)
const searchQuery = ref('')

function tCategory(id) {
  return locale.value === 'en-US' ? categoryNames[id] || id : null
}

function tTool(id) {
  return locale.value === 'en-US' ? toolNames[id] || id : null
}

function getCatLabel(cat) {
  return tCategory(cat.id) || cat.name
}

function getCatIcon(cat) {
  return categoryIcons[cat.id] || cat.icon
}

function getToolLabel(tool) {
  return tTool(tool.id) || tool.title
}

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  const results = []
  for (const cat of categories) {
    for (const tool of cat.tools) {
      const titleZh = tool.title.toLowerCase()
      const titleEn = (toolNames[tool.id] || '').toLowerCase()
      const keywords = tool.keywords.toLowerCase()
      if (titleZh.includes(q) || titleEn.includes(q) || keywords.includes(q)) {
        results.push({ ...tool, category: cat.id, categoryName: getCatLabel(cat) })
      }
    }
  }
  return results.slice(0, 8)
})

function go(path) {
  mobileOpen.value = false
  searchQuery.value = ''
  router.push(path)
}
</script>

<template>
  <header class="topnav">
    <div class="topnav-inner">
      <a class="brand" @click="go('/')">
        <span class="brand-mark">FC</span>
        <span class="brand-name">FileCut</span>
        <span class="brand-tag">{{ t('nav.brandTag') }}</span>
      </a>

      <button class="mobile-toggle nb-btn sm" @click="mobileOpen = !mobileOpen">
        {{ mobileOpen ? t('nav.close') : t('nav.menu') }}
      </button>

      <nav class="nav-cats" :class="{ open: mobileOpen }">
        <a v-for="cat in categories" :key="cat.id"
           @click="go(`/category/${cat.id}`)"
           class="nav-cat"
           :class="{ active: route.path === `/category/${cat.id}` }">
          <span class="nav-cat-icon">{{ getCatIcon(cat) }}</span>
          <span class="nav-cat-name">{{ getCatLabel(cat) }}</span>
        </a>
      </nav>

      <div class="search-box">
        <input v-model="searchQuery" class="nb-input" :placeholder="t('nav.search')" />
        <div v-if="searchResults.length" class="search-results nb-card flat">
          <a v-for="r in searchResults" :key="r.path" class="search-item" @click="go(r.path)">
            <span class="search-item-title">{{ getToolLabel(r) }}</span>
            <span class="search-item-cat">{{ r.categoryName }}</span>
          </a>
        </div>
      </div>

      <div class="topnav-controls">
        <select class="nb-select sm theme-select" v-model="currentTheme" @change="setTheme($event.target.value)">
          <option v-for="theme in themes" :key="theme.id" :value="theme.id">
            {{ theme.icon }} {{ theme.label }}
          </option>
        </select>
        <select class="nb-select sm lang-select" v-model="currentLocale" @change="setLocale($event.target.value)">
          <option v-for="lang in supported" :key="lang" :value="lang">
            {{ labels[lang] }}
          </option>
        </select>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topnav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--paper-card);
  border-bottom: var(--border-w-thick) solid var(--ink);
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.05);
}
.topnav-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--ink);
  color: var(--neon);
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 16px;
  border: var(--border-w) solid var(--ink);
  box-shadow: var(--shadow-sm);
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.6rem;
  letter-spacing: -0.02em;
}
.brand-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-soft);
  padding: 2px 6px;
  border: 2px solid var(--ink);
  background: var(--neon);
}
.nav-cats {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  flex-wrap: wrap;
}
.nav-cat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.1s ease;
}
.nav-cat:hover {
  background: var(--paper-darker);
  border-color: var(--ink);
}
.nav-cat.active {
  background: var(--neon);
  border-color: var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
}
.nav-cat-icon {
  font-size: 14px;
  line-height: 1;
}
.search-box {
  position: relative;
  min-width: 160px;
}
.search-box .nb-input {
  padding: 6px 10px;
  font-size: 13px;
}
.search-results {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 280px;
  max-height: 400px;
  overflow-y: auto;
  z-index: 200;
  padding: 0;
}
.search-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  font-family: var(--font-mono);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid var(--paper-darker);
  transition: background 0.1s ease;
}
.search-item:hover {
  background: var(--neon);
}
.search-item:last-child {
  border-bottom: none;
}
.search-item-title {
  color: var(--ink);
  font-weight: 500;
}
.search-item-cat {
  color: var(--ink-muted);
  font-size: 11px;
}

.topnav-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.topnav-controls .nb-select.sm {
  padding: 6px 28px 6px 10px;
  font-size: 13px;
  font-family: var(--font-mono);
  font-weight: 600;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M6 8L1 3h10z' fill='%231a1a1a'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  cursor: pointer;
  min-width: 110px;
}

.topnav-controls .lang-select {
  min-width: 70px;
}

.mobile-toggle {
  display: none;
}

@media (max-width: 900px) {
  .topnav-inner { gap: 12px; }
  .mobile-toggle { display: inline-flex; }
  .nav-cats { display: none; }
  .nav-cats.open { display: flex; width: 100%; }
  .search-box { flex: 1; min-width: 120px; }
}
</style>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { categories } from '../router/categories'

const router = useRouter()
const route = useRoute()
const mobileOpen = ref(false)
const searchQuery = ref('')

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  const results = []
  for (const cat of categories) {
    for (const tool of cat.tools) {
      if (tool.title.toLowerCase().includes(q) || tool.keywords.toLowerCase().includes(q)) {
        results.push({ ...tool, category: cat.id, categoryName: cat.name })
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
        <span class="brand-tag">本地 · 零上传</span>
      </a>

      <button class="mobile-toggle nb-btn sm" @click="mobileOpen = !mobileOpen">
        {{ mobileOpen ? '关闭' : '菜单' }}
      </button>

      <nav class="nav-cats" :class="{ open: mobileOpen }">
        <a v-for="cat in categories" :key="cat.id"
           @click="go(`/category/${cat.id}`)"
           class="nav-cat"
           :class="{ active: route.path === `/category/${cat.id}` }">
          <span class="nav-cat-icon">{{ cat.icon }}</span>
          <span class="nav-cat-name">{{ cat.name }}</span>
        </a>
      </nav>

      <div class="search-box">
        <input v-model="searchQuery" class="nb-input" placeholder="搜索工具..." />
        <div v-if="searchResults.length" class="search-results nb-card flat">
          <a v-for="r in searchResults" :key="r.path" class="search-item" @click="go(r.path)">
            <span class="search-item-title">{{ r.title }}</span>
            <span class="search-item-cat">{{ r.categoryName }}</span>
          </a>
        </div>
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
  border-bottom: 4px solid var(--ink);
  box-shadow: 0 4px 0 rgba(0,0,0,0.05);
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
  border: 3px solid var(--ink);
  box-shadow: 3px 3px 0 var(--accent);
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
  padding: 6px 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.1s ease;
  white-space: nowrap;
}
.nav-cat:hover {
  border-color: var(--ink);
  background: var(--paper-darker);
}
.nav-cat.active {
  background: var(--ink);
  color: var(--paper-card);
}
.nav-cat-icon { font-size: 14px; }
.search-box {
  position: relative;
  min-width: 200px;
  flex-shrink: 0;
}
.search-box .nb-input { padding: 6px 10px; font-size: 13px; }
.search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 320px;
  overflow-y: auto;
  z-index: 200;
  padding: 4px;
}
.search-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 13px;
  border: 2px solid transparent;
}
.search-item:hover {
  background: var(--accent-soft);
  border-color: var(--ink);
}
.search-item-cat {
  font-size: 11px;
  color: var(--ink-soft);
}
.mobile-toggle { display: none; }

@media (max-width: 968px) {
  .topnav-inner { gap: 12px; }
  .brand-tag { display: none; }
  .mobile-toggle { display: inline-flex; }
  .nav-cats {
    display: none;
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding-top: 8px;
  }
  .nav-cats.open { display: flex; }
  .nav-cat { width: 100%; }
  .search-box { width: 100%; min-width: 0; }
}
</style>

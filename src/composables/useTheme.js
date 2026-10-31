/**
 * 主题管理 composable
 * - 4 套皮肤：paper / ink / midnight / contrast
 * - 持久化到 localStorage
 * - 默认跟随系统 prefers-color-scheme（暗色用 ink）
 */
import { ref, watch } from 'vue'

export const THEMES = [
  { id: 'paper', label: '纸质', icon: '📜', desc: '默认米黄' },
  { id: 'fresh', label: '清爽', icon: '🌤', desc: '清新蓝白' },
  { id: 'tech', label: '科技', icon: '🌃', desc: '霓虹代码' },
  { id: 'aurora', label: '极光', icon: '🌌', desc: '柔和科技' }
]

const STORAGE_KEY = 'filecut-theme'

function detectInitial() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && THEMES.some(t => t.id === saved)) return saved
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'ink'
  return 'paper'
}

const currentTheme = ref(detectInitial())

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id)
}

if (typeof document !== 'undefined') {
  applyTheme(currentTheme.value)
}

watch(currentTheme, (id) => {
  localStorage.setItem(STORAGE_KEY, id)
  applyTheme(id)
})

export function useTheme() {
  function setTheme(id) {
    const exists = THEMES.some(t => t.id === id)
    if (exists) currentTheme.value = id
  }

  return { currentTheme, setTheme, themes: THEMES }
}

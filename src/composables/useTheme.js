import { ref, watch } from 'vue'

/**
 * FileCut 原生主题（Neobrutalism 纸质风）
 * 独立于 DaisyUI，不参与其色彩体系
 */
const NATIVE_THEMES = [
  { id: 'paper', label: '纸质', icon: '📜', desc: 'FileCut 原生 · 粗黑边框' }
]

/**
 * DaisyUI 内置主题清单
 * label 为中文显示名，id 为 daisyui 的 data-theme 值
 */
const DAISYUI_THEMES = [
  { id: 'light', label: '明亮', icon: '☀️' },
  { id: 'dark', label: '暗黑', icon: '🌙' },
  { id: 'cupcake', label: '纸杯', icon: '🧁' },
  { id: 'bumblebee', label: '蜜蜂', icon: '🐝' },
  { id: 'emerald', label: '翡翠', icon: '💚' },
  { id: 'corporate', label: '商务', icon: '💼' },
  { id: 'synthwave', label: '合成波', icon: '🛸' },
  { id: 'retro', label: '复古', icon: '📻' },
  { id: 'cyberpunk', label: '赛博朋克', icon: '🤖' },
  { id: 'valentine', label: '情人节', icon: '💝' },
  { id: 'halloween', label: '万圣节', icon: '🎃' },
  { id: 'garden', label: '花园', icon: '🌻' },
  { id: 'forest', label: '森林', icon: '🌲' },
  { id: 'aqua', label: '水蓝', icon: '🌊' },
  { id: 'lofi', label: '低保真', icon: '🎧' },
  { id: 'pastel', label: '柔和', icon: '🌸' },
  { id: 'fantasy', label: '奇幻', icon: '🧙' },
  { id: 'wireframe', label: '线框', icon: '🔲' },
  { id: 'black', label: '纯黑', icon: '⬛' },
  { id: 'luxury', label: '奢华', icon: '👑' },
  { id: 'dracula', label: '德古拉', icon: '🧛' },
  { id: 'cmyk', label: '印刷', icon: '🖨' },
  { id: 'autumn', label: '秋日', icon: '🍂' },
  { id: 'business', label: '金融', icon: '📊' },
  { id: 'acid', label: '酸性', icon: '🧪' },
  { id: 'lemonade', label: '柠檬', icon: '🍋' },
  { id: 'night', label: '夜行', icon: '🦉' },
  { id: 'winter', label: '寒冬', icon: '❄️' },
  { id: 'dim', label: '微光', icon: '🌫' },
  { id: 'nord', label: '北欧', icon: '🧊' },
  { id: 'sunset', label: '日落', icon: '🌇' },
  { id: 'caramellatte', label: '焦糖', icon: '☕' },
  { id: 'abyss', label: '深渊', icon: '🕳' },
  { id: 'silk', label: '丝绸', icon: '🪡' },
  { id: 'coffee', label: '咖啡', icon: '☕' }
]

export const THEMES = [...NATIVE_THEMES, ...DAISYUI_THEMES]

const STORAGE_KEY = 'filecut-theme'
const DEFAULT_THEME = 'paper'
const DARK_FALLBACK = 'dark'

function detectInitial() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && THEMES.some(t => t.id === saved)) return saved
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return DARK_FALLBACK
  return DEFAULT_THEME
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

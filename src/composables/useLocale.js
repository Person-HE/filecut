/**
 * 语言管理 composable
 * - 中文 / English 双语
 * - 持久化到 localStorage
 * - 默认跟随浏览器 Accept-Language
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { setI18nLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../i18n'

const STORAGE_KEY = 'filecut-locale'
const LABELS = { 'zh-CN': '中文', 'en-US': 'EN' }

function detectInitial() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && SUPPORTED_LOCALES.includes(saved)) return saved
  const nav = navigator.language || ''
  return nav.startsWith('zh') ? 'zh-CN' : 'en-US'
}

export const currentLocale = ref(detectInitial())

/**
 * 切换语言并持久化
 * @param {string} lang - 'zh-CN' | 'en-US'
 */
export function setLocale(lang) {
  if (!SUPPORTED_LOCALES.includes(lang)) return
  currentLocale.value = lang
  localStorage.setItem(STORAGE_KEY, lang)
  setI18nLocale(/** @type {'zh-CN' | 'en-US'} */ (lang))
}

export function toggleLocale() {
  setLocale(currentLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN')
}

export function useLocale() {
  const { locale, t } = useI18n()
  locale.value = currentLocale.value
  setI18nLocale(/** @type {'zh-CN' | 'en-US'} */ (currentLocale.value))
  return { currentLocale, setLocale, toggleLocale, labels: LABELS, supported: SUPPORTED_LOCALES, locale, t }
}

export { DEFAULT_LOCALE }

import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.js'
import enUS from './locales/en-US.js'

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US']
export const DEFAULT_LOCALE = 'zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

/**
 * 切换全局语言并同步 <html lang>
 * @param {'zh-CN' | 'en-US'} lang - 语言代码
 */
export function setI18nLocale(lang) {
  if (!SUPPORTED_LOCALES.includes(lang)) return
  i18n.global.locale.value = lang
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lang)
  }
}

export default i18n

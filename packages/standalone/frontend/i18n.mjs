import english from './en.json' with { type: 'json' }

export const LANGUAGE_KEY = 'ofm-language'
export function readLanguage(storage) {
  try { return storage?.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'zh' } catch { return 'zh' }
}
let storage
try { storage = globalThis.localStorage } catch { /* Storage can be disabled. */ }
export const language = readLanguage(storage)
export const locale = language === 'en' ? 'en-US' : 'zh-CN'

/** Only the dedicated UI preference is written; never service settings or credentials. */
export function saveLanguage(next, target = storage) {
  if (next !== 'en' && next !== 'zh') throw new Error('Unsupported language')
  if (!target) throw new Error('Language preference storage is unavailable')
  target.setItem(LANGUAGE_KEY, next)
}

/** Replace placeholders in one pass so interpolated values are never interpreted as templates. */
export function translate(text, selected, values = []) {
  const template = selected === 'en' && Object.hasOwn(english, text) ? english[text] : text
  return template.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match)
}
export function tr(text, ...values) { return translate(text, language, values) }

if (typeof document !== 'undefined') {
  document.documentElement.lang = locale
  document.title = language === 'en' ? 'Our Free Model · Local Console' : 'Our Free Model · 本地控制台'
  // The installed desktop shell injects these controls outside React.
  const localizeTitlebar = () => {
    const bar = document.getElementById('ofm-titlebar')
    if (!bar) return false
    for (const [selector, en, zh] of [
      ['.minimize', 'Minimize', '最小化'],
      ['.maximize', 'Maximize / restore', '最大化 / 还原'],
      ['.close', 'Hide to tray', '隐藏到托盘'],
    ]) {
      const button = bar.querySelector(selector)
      button?.setAttribute('title', language === 'en' ? en : zh)
      button?.setAttribute('aria-label', language === 'en' ? en : zh)
    }
    return true
  }
  const mount = () => {
    if (localizeTitlebar() || !globalThis.__TAURI__) return
    const observer = new MutationObserver(() => { if (localizeTitlebar()) observer.disconnect() })
    observer.observe(document.body, { childList: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true })
  else mount()
}

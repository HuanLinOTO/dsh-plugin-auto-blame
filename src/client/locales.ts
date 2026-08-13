/**
 * Locale dictionaries for the `dsh-auto-blame` namespace.
 *
 * @module @huanlin/dsh-plugin-auto-blame/client/locales
 */

/** The locale keys the bubbles component + settings page read. */
export type AutoBlameKey =
  | 'title'
  | 'send'
  | 'empty'
  | 'settings.nav'
  | 'settings.enabled.label'
  | 'settings.enabled.description'
  | 'settings.disabled.note'

/** The locale namespace name; matches the `locale: NS` passed at slot register. */
export const NS = 'dsh-auto-blame'

/** English dictionary. */
export const en: Record<AutoBlameKey, string> = {
  title: 'Leadership view',
  send: 'Click to send',
  empty: 'No suggestions for this turn',
  'settings.nav': 'Auto-blame',
  'settings.enabled.label': 'Enable auto-blame',
  'settings.enabled.description': 'Show cynical follow-up suggestion bubbles above the composer after each turn',
  'settings.disabled.note': 'Disabled. The host skips the LLM call entirely — no token cost, no bubbles. Re-enable to resume.',
}

/** Chinese dictionary. */
export const zh: Record<AutoBlameKey, string> = {
  title: '领导视野',
  send: '点击直接发送',
  empty: '这一轮没有建议',
  'settings.nav': 'Auto-blame 自动问责',
  'settings.enabled.label': '启用自动问责',
  'settings.enabled.description': '每轮结束后在输入框上方显示三条「领导视野」跟进建议气泡',
  'settings.disabled.note': '已关闭。宿主侧不会再发起 LLM 调用——零 token 消耗、无气泡。重新打开即可恢复。',
}

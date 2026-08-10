/**
 * Locale dictionaries for the `dsh-auto-blame` namespace.
 *
 * @module @dsh-external/dsh-auto-blame/client/locales
 */

/** The locale keys the bubbles component reads. */
export type AutoBlameKey =
  | 'title'
  | 'send'
  | 'empty'

/** The locale namespace name; matches the `locale: NS` passed at slot register. */
export const NS = 'dsh-auto-blame'

/** English dictionary. */
export const en: Record<AutoBlameKey, string> = {
  title: 'Leadership view',
  send: 'Click to send',
  empty: 'No suggestions for this turn',
}

/** Chinese dictionary. */
export const zh: Record<AutoBlameKey, string> = {
  title: '领导视野',
  send: '点击直接发送',
  empty: '这一轮没有建议',
}

/**
 * dsh-auto-blame — browser half.
 *
 * One registration:
 *   - `conversation.composer.dock` list slot (id `dsh-auto-blame`, order 60) —
 *     renders three click-to-send cynical follow-up bubbles. The host
 *     generates them from the last three surface messages via an LLM call on
 *     `agent/turn-stopping`; the `autoBlame` projection cell carries them to
 *     the client through the standard-kit `useProjection` seat.
 *
 * A click feeds the suggestion text to the input machine — the same path the
 * InputBar uses: `inputActions.setDraft(text)` then `inputActions.submit()`.
 *
 * @module @dsh-external/dsh-auto-blame/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the shell's SlotMap merge (conversation.composer.dock)
// + SessionStandardProps (useInput, inputActions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the SessionProjectionMap merge (autoBlame key) so
// useProjection('autoBlame') type-checks in the browser half.
import type {} from '../types.ts'
import { SuggestionBubbles } from './SuggestionBubbles.tsx'
import { en, NS, zh, type AutoBlameKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The bubble title + send-hint copy. */
    'dsh-auto-blame': AutoBlameKey
  }
}

/** Required services: slots + locale. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the suggestion bubbles in the composer dock.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-auto-blame: dictionaries')

  // The dock is the band under the composer card; the bubbles render there
  // and stick with the composer across chat scrolling. The dock is session-
  // scoped, so hero mode (no session) naturally hides it.
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.composer.dock',
        id: 'dsh-auto-blame',
        order: 60,
        locale: NS,
      },
      SuggestionBubbles,
    ),
  )
}

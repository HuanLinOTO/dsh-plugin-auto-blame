/**
 * dsh-auto-blame — browser half.
 *
 * Two registrations:
 *   - `conversation.composer.dock` list slot (id `dsh-auto-blame`, order 60) —
 *     renders three click-to-send cynical follow-up bubbles. The host
 *     generates them from the last three surface messages via an LLM call on
 *     `agent/turn-stopping` (gated by the `enabled` settings flag); the
 *     `autoBlame` projection cell carries them to the client through the
 *     standard-kit `useProjection` seat. When the host `enabled` flag is
 *     false, no LLM call runs, the projection stays null, and this component
 *     renders nothing — the gate is host-side, not client-side.
 *   - `settings.section` list slot (id `dsh-auto-blame`, order 70) — the
 *     master `enabled` toggle. Reads/writes through the `/auto-blame` RPC
 *     channel, which the host persists to `$DSH_HOME/settings.yaml`.
 *
 * A click feeds the suggestion text to the input machine — the same path the
 * InputBar uses: `inputActions.setDraft(text)` then `inputActions.submit()`.
 *
 * @module @dsh-external/dsh-auto-blame/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the client connection Context merge (ctx.connection).
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the shell's SlotMap merges (conversation.composer.dock,
// settings.section) + SessionStandardProps (useInput, inputActions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the settings.section SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the SessionProjectionMap merge (autoBlame key) so
// useProjection('autoBlame') type-checks in the browser half.
import type {} from '../types.ts'
import { SuggestionBubbles } from './SuggestionBubbles.tsx'
import { AutoBlameSection, type AutoBlameSectionInjected } from './AutoBlameSection.tsx'
import { en, NS, zh, type AutoBlameKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The bubble title + send-hint copy + settings page labels. */
    'dsh-auto-blame': AutoBlameKey
  }
}

/** Required services: slots + locale + connection (for the settings RPC). */
export const inject = ['slots', 'locale', 'connection']

/**
 * Client plugin body: register the suggestion bubbles in the composer dock
 * and the master toggle in the settings dialog.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-auto-blame: dictionaries')

  // `ctx.connection` is typed as HostConnectionHandle (host-side merge) when
  // the host connection package is also in the type graph; in a real client
  // build only the client merge is present and the cast is a no-op.
  const connection = ctx.connection as unknown as ConnectionHandle

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

  // The settings page: one row with the `enabled` master switch. Reads/
  // writes through the `/auto-blame` RPC channel; the host persists to
  // settings.yaml and gates the turn-stopping LLM call on the same flag.
  const settingsInjected = (): AutoBlameSectionInjected => ({
    rpc: connection.rpc,
  })
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-auto-blame',
        order: 70,
        label: () => ctx.locale.bind(NS)('settings.nav'),
        locale: NS,
        inject: settingsInjected,
      },
      AutoBlameSection,
    ),
  )
}

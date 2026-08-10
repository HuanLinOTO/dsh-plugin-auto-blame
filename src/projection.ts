/**
 * The `autoBlame` projection unit: folds `auto-blame/generating` and
 * `auto-blame/suggestions` session events into the latest state.
 * `generating: true` while the LLM call is in-flight; `generating: false`
 * with the suggestions array once results land. `null` before the first
 * generation and cleared on `turn/start`.
 *
 * @module @dsh-external/dsh-auto-blame/projection
 */

import type { Context } from 'cordis'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AutoBlameProjection, AutoBlameGeneratingPayload, AutoBlameSuggestionsPayload } from './types.ts'

/**
 * Minimal schema: the projection registry calls `schema.parse(value)` to
 * validate the view output before serving it. Our `view` is the identity
 * (state IS the wire value), and the host-side `apply` already guarantees
 * the shape, so a pass-through validator is sufficient. Avoids pulling in
 * zod as a runtime dependency for a bundle-style plugin.
 */
const autoBlameSchema = {
  parse(value: unknown): unknown {
    return value
  },
} as never // ErasedDefinition.schema is `{ parse(value): unknown }`; ZodType satisfies it.

/**
 * Pure fold: previous state + one committed event → next state. Returns the
 * same state reference for events that are not ours (an unchanged reference
 * produces zero downstream work per the projection contract). Exported for
 * direct unit testing.
 * @param state - the current projection state.
 * @param event - the next committed session event.
 * @returns the next state (same reference when the event is not ours).
 */
export function foldAutoBlame(state: AutoBlameProjection, event: SessionEvent): AutoBlameProjection {
  if (event.type === 'auto-blame/generating') {
    const payload = event.data as AutoBlameGeneratingPayload
    return { turn: payload.turn, generating: true, suggestions: [] }
  }
  if (event.type === 'auto-blame/suggestions') {
    const payload = event.data as AutoBlameSuggestionsPayload
    return { turn: payload.turn, generating: false, suggestions: payload.suggestions }
  }
  if (event.type === 'turn/start') return null
  return state
}

/**
 * Register the `autoBlame` projection unit on the session-projection registry,
 * if the registry is composed. Headless assemblies without the seam stay
 * unaffected. `stateVersion: 3` — the state now carries a `generating` flag.
 * @param ctx - the host context that may carry `ctx.sessionProjections`.
 */
export function registerAutoBlameProjection(ctx: Context): void {
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register<'autoBlame', AutoBlameProjection>({
      key: 'autoBlame',
      schema: autoBlameSchema,
      init: () => null,
      apply: foldAutoBlame,
      view: (state) => state,
      stateVersion: 3,
    })
  })
}

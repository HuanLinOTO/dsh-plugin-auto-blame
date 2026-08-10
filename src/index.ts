/**
 * dsh-auto-blame — host plugin entry.
 *
 * Listens on `agent/turn-stopping` (serial). When a turn closes, the listener
 * fires off a background LLM call that asks the agent's own provider for
 * three cynical follow-up prompts based on the last three surface messages.
 * The call is fire-and-forget — the listener returns immediately so the
 * serial checkpoint is not delayed; the LLM may take hundreds of milliseconds
 * and that is fine, the bubbles fade in when they arrive.
 *
 * On success the host appends an `auto-blame/suggestions` session event
 * (non-surface, never enters model-visible history) carrying the three
 * suggestions. The `autoBlame` projection unit folds that event into the
 * `autoBlame` cell, which the api-proxy carrier serves on the history tail
 * page and the `session/projection` push frame. The browser half reads it
 * through `useProjection('autoBlame')` and renders click-to-send bubbles in
 * `conversation.composer.dock`.
 *
 * Any failure (no `llm` service, no provider/model, LLM error, unparseable
 * output) resolves to null and the listener skips the append — the user sees
 * no bubbles for that turn, no log pollution.
 *
 * Toggle the plugin off by removing the `dsh-auto-blame` insert row from
 * `cordis.patch.yml` (or the profile that loads it); no in-band config.
 *
 * @module @dsh-external/dsh-auto-blame
 */

import type { Context } from 'cordis'
// Type-only import of Agent also triggers the cordis Events merge that
// declares `agent/turn-stopping` (from dsh-agent's src/types.ts).
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { canGenerateBlame, generateBlameSuggestions } from './blame-llm.ts'
import { registerAutoBlameProjection } from './projection.ts'

// Re-export the type-merge outlet so consumers of the package root pick up
// the SessionEventMap and SessionProjectionMap declarations.
export type * from './types.ts'

export const name = 'dsh-auto-blame'
export const inject: string[] = []

/**
 * Host apply: register the projection unit and the turn-stopping listener.
 * @param ctx - host context.
 */
export function apply(ctx: Context): void {
  // The projection unit activates only when `ctx.sessionProjections` is
  // composed (headless assemblies without the seam stay unaffected).
  registerAutoBlameProjection(ctx)

  // Serial listener: returns void immediately. The LLM call runs in a
  // detached promise; failures are logged and contained, never reaching the
  // serial dispatch (a rejected void promise cannot block the turn close).
  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    void runBlameGeneration(ctx, agent, turn).catch((error: unknown) => {
      ctx.logger.warn(`dsh-auto-blame: generation for turn ${turn} failed: ${String(error)}`)
    })
  })
}

/**
 * One background generation: signal loading, call the LLM, parse, and append
 * the suggestions event on success. If pre-checks fail, nothing is emitted
 * (no loading state to clear). If the LLM call itself fails after the loading
 * signal, an empty suggestions event clears the loading state.
 * @param ctx - host context carrying the `llm` service.
 * @param agent - the agent whose turn just closed.
 * @param turn - the turn number that just closed.
 */
async function runBlameGeneration(ctx: Context, agent: Agent, turn: number): Promise<void> {
  if (!canGenerateBlame(ctx, agent)) return
  agent.session.append('auto-blame/generating', { turn })
  const suggestions = await generateBlameSuggestions(ctx, agent)
  if (suggestions === null) {
    agent.session.append('auto-blame/suggestions', { turn, suggestions: [] })
    return
  }
  agent.session.append('auto-blame/suggestions', { turn, suggestions })
}

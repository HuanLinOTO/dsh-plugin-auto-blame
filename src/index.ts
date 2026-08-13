/**
 * dsh-auto-blame — host plugin entry.
 *
 * Listens on `agent/turn-stopping` (serial). When a turn closes, the listener
 * gates on the `enabled` settings flag — false returns immediately, no LLM
 * call, no projection event, no bubbles. True fires off a background LLM
 * call that asks the agent's own provider for three cynical follow-up
 * prompts based on the last three surface messages. The call is fire-and-
 * forget — the listener returns immediately so the serial checkpoint is not
 * delayed; the LLM may take hundreds of milliseconds and that is fine, the
 * bubbles fade in when they arrive.
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
 * The `enabled` master switch persists through the settings seam under the
 * `auto-blame` namespace in `$DSH_HOME/settings.yaml` when a settings
 * provider is mounted; the cordis.yml `enabled` field is the composition
 * `base` (first-boot seed). The browser half's settings page reads/writes
 * the flag through a dedicated `/auto-blame` RPC channel. Headless
 * assemblies without a settings provider fall back to in-memory state
 * (cordis.yml seed only, no persistence).
 *
 * @module @huanlin/dsh-plugin-auto-blame
 */

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
// Type-only: pulls `declare module 'cordis'` merge for `ctx.connection`.
import type {} from '@deepseek-ai/dsh-client-connection'
// Type-only import of Agent also triggers the cordis Events merge that
// declares `agent/turn-stopping` (from dsh-agent's src/types.ts).
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { canGenerateBlame, generateBlameSuggestions } from './blame-llm.ts'
import { registerAutoBlameProjection } from './projection.ts'
import { registerAutoBlameRpc } from './rpc.ts'
import type { AutoBlameSettings } from './types.ts'

// Re-export the type-merge outlet so consumers of the package root pick up
// the SessionEventMap and SessionProjectionMap declarations.
export type * from './types.ts'

export const name = 'dsh-auto-blame'
/** `connection` is required for the RPC channel that backs the settings page. */
export const inject = ['connection']

/** Settings namespace under which the `enabled` flag persists (`$DSH_HOME/settings.yaml`). */
export const SETTINGS_NAMESPACE = settingsNamespace('auto-blame')

/**
 * Schemastery schema for the `auto-blame` settings namespace. Identical
 * shape to {@link Config} — cordis.yml seed becomes the composition `base`,
 * and the user layer (settings.yaml) overrides it.
 */
const SettingsSchema = z.object({
  enabled: z.boolean().default(true).description('Master switch: when off, the host skips the LLM call and no bubbles render.'),
})

export interface Config {
  enabled: boolean
}

export const Config = z.object({
  enabled: z.boolean().default(true).description('Master switch seed (cordis.yml). User edits live in settings.yaml.'),
}) as unknown as z<Config>

/**
 * Plugin body: register the projection unit, the turn-stopping listener
 * (gated on `enabled`), and the RPC channel for the settings page.
 *
 * Persistence: when a settings service is mounted, the `enabled` flag lives
 * under the `auto-blame` namespace in `$DSH_HOME/settings.yaml`; the
 * cordis.yml `enabled` field is the composition `base` (first-boot seed).
 * External edits (a hand-edited yaml) reload the in-memory value; the next
 * turn-stopping reads through. Headless assemblies without a settings
 * provider fall back to in-memory state (cordis.yml seed, no persistence).
 * @param ctx - host context carrying `connection`.
 * @param config - resolved config (seed `enabled`).
 */
export function apply(ctx: Context, config: Config): void {
  // The projection unit activates only when `ctx.sessionProjections` is
  // composed (headless assemblies without the seam stay unaffected).
  registerAutoBlameProjection(ctx)

  // Source of truth for the `enabled` flag: the settings scope when a
  // provider is mounted (persists to $DSH_HOME/settings.yaml under the
  // `auto-blame` namespace); the composition config otherwise. The thunk
  // reads through so live toggles (RPC write, external yaml edit) take
  // effect on the next turn-stopping without restart.
  let getEnabled: () => boolean = () => config.enabled
  let scope: SettingsScope<AutoBlameSettings> | undefined

  ctx.inject(['settings'], (sctx) => {
    scope = sctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema as unknown as z<AutoBlameSettings>, { base: config })
    getEnabled = () => scope!.get().enabled
    // A hand-edited settings.yaml or a concurrent tab changes the resolved
    // value: getEnabled already reads through, so nothing to re-apply.
  })

  // Serial listener: returns void immediately. The `enabled` gate runs
  // synchronously before any LLM call is queued — when false, no detached
  // promise, no token cost, no projection event. When true, the LLM call
  // runs in a detached promise; failures are logged and contained, never
  // reaching the serial dispatch.
  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    if (!getEnabled()) return
    void runBlameGeneration(ctx, agent, turn).catch((error: unknown) => {
      ctx.logger.warn(`dsh-auto-blame: generation for turn ${turn} failed: ${String(error)}`)
    })
  })

  // RPC: the settings page reads/writes the `enabled` flag through the
  // dedicated `/auto-blame` channel. Writes persist through the settings
  // scope when one is attached; otherwise the in-memory fallback is updated
  // (honored until restart, no persistence).
  registerAutoBlameRpc(
    ctx,
    () => getEnabled(),
    async (enabled: boolean): Promise<void> => {
      if (scope !== undefined) {
        await scope.update({ enabled })
        return
      }
      // No settings provider: update the in-memory fallback so the current
      // process honors the toggle. Does not persist across restarts.
      getEnabled = () => enabled
    },
  )
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

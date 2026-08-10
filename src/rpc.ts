/**
 * RPC handler: the `enabled` master switch over a dedicated Connection
 * channel (`/auto-blame`). The shared `/api` channel is reserved for a
 * single interceptor; ordinary plugins register their own channel with
 * `ctx.connection.rpc.handle(channel, ...)`.
 *
 * Endpoints (all POST, payload shape noted):
 *   - `settings.get`  payload: {}                    → { enabled: boolean }
 *   - `settings.set`  payload: { enabled: boolean }  → { enabled: boolean } | error
 *
 * Returns the existing RpcResult shape; business errors use the `internal`
 * code with a descriptive message (the RpcError code union is closed; we do
 * not extend it for plugin-specific failures).
 *
 * @module @dsh-external/dsh-auto-blame/rpc
 */

import type { Context } from 'cordis'
// Type-only: pulls `declare module 'cordis'` merge for `ctx.connection`.
import type {} from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'

/** Wire shape for `auto-blame/settings.get` and `settings.set` responses. */
export interface SettingsResponse {
  readonly enabled: boolean
}

/** Wire shape for `auto-blame/settings.set` request payloads. */
export interface SettingsSetPayload {
  readonly enabled: boolean
}

/** The dedicated RPC channel carrying every dsh-auto-blame endpoint. */
export const CHANNEL = '/auto-blame'

/** Build an RPC ok branch. */
function ok(value: SettingsResponse): RpcResult<SettingsResponse> {
  return { ok: true, value }
}

/** Build an RPC error branch using the closed `internal` code (no plugin-specific code). */
function fail(message: string): RpcResult<SettingsResponse> {
  return { ok: false, error: { code: 'internal', message, details: {} } }
}

/** Minimal host-side handle for `ctx.connection.rpc` (avoids runtime value import). */
type HostConnectionRpc = {
  readonly rpc: {
    readonly handle: (
      channel: string,
      handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>,
      options: { readonly authority: 'trusted-host' | 'loopback' },
    ) => () => Promise<void>
  }
}

/**
 * Register the dsh-auto-blame RPC channel.
 *
 * The `getEnabled` thunk reads through to the settings scope when one is
 * attached (live value), or the in-memory fallback otherwise. The
 * `setEnabled` writer persists through the scope when available, or updates
 * the in-memory fallback (no persistence across restarts in headless mode).
 *
 * Uses `ctx.inject(['connection'], ...)` so the channel installs when the
 * connection service is ready and rolls back automatically on fiber
 * disposal.
 * @param ctx - host context.
 * @param getEnabled - thunk returning the current `enabled` value.
 * @param setEnabled - writer persisting the next `enabled` value.
 */
export function registerAutoBlameRpc(
  ctx: Context,
  getEnabled: () => boolean,
  setEnabled: (enabled: boolean) => Promise<void>,
): void {
  ctx.logger.info('dsh-auto-blame: registering RPC channel /auto-blame')
  ctx.inject(['connection'], (cctx) => {
    const connection = cctx.connection as unknown as HostConnectionRpc
    connection.rpc.handle(
      CHANNEL,
      async (endpoint, payload) => {
        switch (endpoint) {
          case 'settings.get':
            return ok({ enabled: getEnabled() })
          case 'settings.set': {
            const p = payload as SettingsSetPayload | undefined
            if (p === undefined || typeof p !== 'object' || p === null || typeof p.enabled !== 'boolean') {
              return fail('payload must be { enabled: boolean }')
            }
            try {
              await setEnabled(p.enabled)
            } catch (error: unknown) {
              return fail(error instanceof Error ? error.message : String(error))
            }
            return ok({ enabled: getEnabled() })
          }
          default:
            return fail(`unknown endpoint: ${endpoint}`)
        }
      },
      { authority: 'trusted-host' },
    )
  })
}

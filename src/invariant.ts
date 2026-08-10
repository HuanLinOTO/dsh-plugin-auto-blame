/**
 * Package-owned invariant companion for `@dsh-external/dsh-auto-blame`.
 *
 * @module @dsh-external/dsh-auto-blame/invariant
 */

/* jscpd:ignore-start */
import type { Context } from 'cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-external/dsh-auto-blame'

/** Cordis companion plugin name. */
export const name = 'dsh-auto-blame-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the single `agent/turn-stopping` listener is a
 * cordis-owned effect whose disposal is proven by the HMR-safety spec, and
 * the `autoBlame` projection unit is registry-owned. Neither emits
 * cross-plugin mutable state outside the session log's own durability
 * contract.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */

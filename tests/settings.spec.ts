/**
 * Unit tests for the dsh-auto-blame RPC handler and the host-side
 * `enabled` gate logic.
 *
 * The RPC handler is exercised through a stubbed `ctx.connection.rpc.handle`
 * capture: the test owns the channel, calls the handler directly with
 * shaped payloads, and asserts the RpcResult. The gate logic (the closure
 * that `getEnabled`/`setEnabled` expose) is tested by driving the same
 * closure the host apply wires.
 *
 * @module @dsh-external/dsh-auto-blame/tests/settings.spec
 */
import { describe, expect, it, vi } from 'vitest'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { registerAutoBlameRpc, CHANNEL, type SettingsResponse } from '../src/rpc.ts'

/** A captured RPC handler the test drives directly. */
type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>

/** Stub for the host context: captures the registered channel + handler. */
interface CtxStub {
  readonly connection: {
    readonly rpc: {
      readonly handle: (channel: string, handler: RpcHandler, options: { readonly authority: 'trusted-host' | 'loopback' }) => () => Promise<void>
    }
  }
  readonly inject: (deps: readonly string[], cb: (cctx: CtxStub) => void) => void
  readonly logger: { info: (msg: string) => void }
}

/** Build a ctx stub that captures the RPC handler when `inject(['connection'], ...)` runs. */
function makeCtxStub(): { ctx: CtxStub; getHandler: () => RpcHandler | undefined } {
  let captured: RpcHandler | undefined
  const ctx: CtxStub = {
    connection: {
      rpc: {
        handle: (_channel, handler) => {
          captured = handler
          return async () => { captured = undefined }
        },
      },
    },
    inject: (deps, cb) => {
      if (deps.includes('connection')) cb(ctx)
    },
    logger: { info: () => {} },
  }
  return { ctx, getHandler: () => captured }
}

/** Build the closure pair the host apply wires: a get thunk and a set writer over a mutable cell. */
function makeEnabledCell(initial: boolean): {
  get: () => boolean
  set: (next: boolean) => Promise<void>
  setCalls: { readonly value: boolean }[]
} {
  let current = initial
  const setCalls: { value: boolean }[] = []
  return {
    get: () => current,
    set: async (next: boolean) => {
      setCalls.push({ value: next })
      current = next
    },
    setCalls,
  }
}

const abort = new AbortController().signal

describe('registerAutoBlameRpc — channel registration', () => {
  it('registers on the /auto-blame channel with trusted-host authority', () => {
    const { ctx } = makeCtxStub()
    const cell = makeEnabledCell(true)
    const handleSpy = vi.spyOn(ctx.connection.rpc, 'handle')
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    expect(handleSpy).toHaveBeenCalledOnce()
    expect(handleSpy.mock.calls[0][0]).toBe(CHANNEL)
    expect(handleSpy.mock.calls[0][2]).toEqual({ authority: 'trusted-host' })
  })
})

describe('auto-blame/settings.get', () => {
  it('returns the current enabled value', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    const result = await handler('settings.get', {}, abort) as RpcResult<SettingsResponse>
    expect(result).toEqual({ ok: true, value: { enabled: true } })
  })

  it('reflects a flip to false after the writer runs', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    await handler('settings.set', { enabled: false }, abort)
    const result = await handler('settings.get', {}, abort) as RpcResult<SettingsResponse>
    expect(result).toEqual({ ok: true, value: { enabled: false } })
  })
})

describe('auto-blame/settings.set', () => {
  it('writes the new value and returns it', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    const result = await handler('settings.set', { enabled: false }, abort) as RpcResult<SettingsResponse>
    expect(result).toEqual({ ok: true, value: { enabled: false } })
    expect(cell.setCalls).toEqual([{ value: false }])
    expect(cell.get()).toBe(false)
  })

  it('rejects a payload missing the enabled field', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    const result = await handler('settings.set', {}, abort) as RpcResult<SettingsResponse>
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('internal')
      expect(result.error.message).toContain('enabled')
    }
    expect(cell.setCalls).toEqual([])
  })

  it('rejects a payload with a non-boolean enabled', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    const result = await handler('settings.set', { enabled: 'true' }, abort) as RpcResult<SettingsResponse>
    expect(result.ok).toBe(false)
    expect(cell.setCalls).toEqual([])
  })

  it('rejects a non-object payload', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    const result = await handler('settings.set', null, abort) as RpcResult<SettingsResponse>
    expect(result.ok).toBe(false)
    expect(cell.setCalls).toEqual([])
  })

  it('returns the error message when the writer throws', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const failingSet = async (): Promise<void> => { throw new Error('scope locked') }
    registerAutoBlameRpc(ctx as never, () => true, failingSet)
    const handler = getHandler()!
    const result = await handler('settings.set', { enabled: false }, abort) as RpcResult<SettingsResponse>
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe('scope locked')
    }
  })

  it('returns the error string when the writer throws a non-Error', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const failingSet = async (): Promise<void> => { throw 'string error' }
    registerAutoBlameRpc(ctx as never, () => true, failingSet)
    const handler = getHandler()!
    const result = await handler('settings.set', { enabled: false }, abort) as RpcResult<SettingsResponse>
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe('string error')
    }
  })
})

describe('unknown endpoint', () => {
  it('returns an internal error for an unrecognized endpoint', async () => {
    const { ctx, getHandler } = makeCtxStub()
    const cell = makeEnabledCell(true)
    registerAutoBlameRpc(ctx as never, cell.get, cell.set)
    const handler = getHandler()!
    const result = await handler('foo.bar', {}, abort) as RpcResult<SettingsResponse>
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('foo.bar')
    }
  })
})

describe('enabled gate closure', () => {
  it('the get thunk reads through to the live cell value', () => {
    const cell = makeEnabledCell(true)
    expect(cell.get()).toBe(true)
    void cell.set(false)
    expect(cell.get()).toBe(false)
    void cell.set(true)
    expect(cell.get()).toBe(true)
  })
})

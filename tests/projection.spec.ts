/**
 * Unit tests for the `autoBlame` projection fold.
 *
 * @module @dsh-external/dsh-auto-blame/tests/projection.spec
 */
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { AutoBlameProjection } from '../src/types.ts'
import { foldAutoBlame } from '../src/projection.ts'

/** Build a minimal SessionEvent with the given type and data. */
function event(type: string, data: unknown): SessionEvent {
  return { type, seq: 0, time: 0, data } as SessionEvent
}

describe('foldAutoBlame', () => {
  it('returns null for the initial state when the event is not ours', () => {
    const state: AutoBlameProjection = null
    const result = foldAutoBlame(state, event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(result).toBeNull()
  })

  it('returns the same state reference for unrelated events', () => {
    const state: AutoBlameProjection = { turn: 1, generating: false, suggestions: ['a', 'b', 'c'] }
    const result = foldAutoBlame(state, event('turn/end', { turn: 2, reason: { kind: 'completed' } }))
    expect(result).toBe(state) // Object.is — same reference
  })

  it('clears suggestions when the next turn starts', () => {
    const state: AutoBlameProjection = { turn: 1, generating: false, suggestions: ['a', 'b', 'c'] }
    const result = foldAutoBlame(state, event('turn/start', { turn: 2 }))
    expect(result).toBeNull()
  })

  it('returns the payload when an auto-blame/suggestions event arrives', () => {
    const state: AutoBlameProjection = null
    const payload = { turn: 1, suggestions: ['做完了没', '能保证吗', '别人家更快'] }
    const result = foldAutoBlame(state, event('auto-blame/suggestions', payload))
    expect(result).toEqual({ turn: 1, generating: false, suggestions: ['做完了没', '能保证吗', '别人家更快'] })
  })

  it('replaces the previous state with the latest auto-blame/suggestions event (last-write-wins)', () => {
    const first: AutoBlameProjection = { turn: 1, generating: false, suggestions: ['old1', 'old2', 'old3'] }
    const second = { turn: 2, suggestions: ['new1', 'new2', 'new3'] }
    const result = foldAutoBlame(first, event('auto-blame/suggestions', second))
    expect(result).toEqual({ turn: 2, generating: false, suggestions: ['new1', 'new2', 'new3'] })
    expect(result).not.toBe(first)
  })

  it('ignores unrelated event types between two auto-blame events', () => {
    const first: AutoBlameProjection = { turn: 1, generating: false, suggestions: ['a', 'b', 'c'] }
    const afterTurn = foldAutoBlame(first, event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    expect(afterTurn).toBe(first) // unchanged reference
    const second = { turn: 2, suggestions: ['d', 'e', 'f'] }
    const afterBlame = foldAutoBlame(afterTurn, event('auto-blame/suggestions', second))
    expect(afterBlame).toEqual({ turn: 2, generating: false, suggestions: ['d', 'e', 'f'] })
  })

  it('enters generating state when an auto-blame/generating event arrives', () => {
    const state: AutoBlameProjection = null
    const result = foldAutoBlame(state, event('auto-blame/generating', { turn: 1 }))
    expect(result).toEqual({ turn: 1, generating: true, suggestions: [] })
  })

  it('transitions from generating to ready when suggestions arrive', () => {
    const generating: AutoBlameProjection = { turn: 1, generating: true, suggestions: [] }
    const result = foldAutoBlame(generating, event('auto-blame/suggestions', { turn: 1, suggestions: ['x', 'y', 'z'] }))
    expect(result).toEqual({ turn: 1, generating: false, suggestions: ['x', 'y', 'z'] })
  })

  it('clears generating state on turn/start', () => {
    const generating: AutoBlameProjection = { turn: 1, generating: true, suggestions: [] }
    const result = foldAutoBlame(generating, event('turn/start', { turn: 2 }))
    expect(result).toBeNull()
  })

  it('clears generating state when empty suggestions arrive (failure path)', () => {
    const generating: AutoBlameProjection = { turn: 1, generating: true, suggestions: [] }
    const result = foldAutoBlame(generating, event('auto-blame/suggestions', { turn: 1, suggestions: [] }))
    expect(result).toEqual({ turn: 1, generating: false, suggestions: [] })
  })

  it('replaces generating state with a new generating event for a later turn', () => {
    const generating: AutoBlameProjection = { turn: 1, generating: true, suggestions: [] }
    const result = foldAutoBlame(generating, event('auto-blame/generating', { turn: 2 }))
    expect(result).toEqual({ turn: 2, generating: true, suggestions: [] })
  })
})

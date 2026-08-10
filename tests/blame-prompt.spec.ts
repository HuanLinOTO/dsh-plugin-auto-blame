/**
 * Unit tests for the blame-prompt pure functions: parsing, prompt building.
 *
 * These tests exercise only the pure functions in src/blame-prompt.ts, which
 * have no runtime dependencies on DSH platform packages. The LLM call path
 * (src/blame-llm.ts) is covered by integration tests.
 *
 * @module @dsh-external/dsh-auto-blame/tests/blame-prompt.spec
 */
import { describe, expect, it } from 'vitest'
import type { Message } from '@deepseek-ai/dsh-llm'
import { parseBlameSuggestions, buildBlameUserPrompt } from '../src/blame-prompt.ts'

describe('parseBlameSuggestions', () => {
  it('parses a well-formed JSON object with three suggestions', () => {
    const raw = JSON.stringify({
      suggestions: ['做完了没啊你就给我结束了', '你这次修改能不能保证上线之后不会再出问题', '别人家的Agent只用了一会就写完了'],
    })
    const result = parseBlameSuggestions(raw)
    expect(result).toEqual([
      '做完了没啊你就给我结束了',
      '你这次修改能不能保证上线之后不会再出问题',
      '别人家的Agent只用了一会就写完了',
    ])
  })

  it('strips a ```json fenced block if the model added one', () => {
    const raw = '```json\n{"suggestions": ["a", "b", "c"]}\n```'
    expect(parseBlameSuggestions(raw)).toEqual(['a', 'b', 'c'])
  })

  it('strips a bare ``` fenced block', () => {
    const raw = '```\n{"suggestions": ["a", "b", "c"]}\n```'
    expect(parseBlameSuggestions(raw)).toEqual(['a', 'b', 'c'])
  })

  it('trims whitespace around each suggestion', () => {
    const raw = JSON.stringify({ suggestions: ['  a  ', '\nb\n', '\tc\t'] })
    expect(parseBlameSuggestions(raw)).toEqual(['a', 'b', 'c'])
  })

  it('returns null for empty input', () => {
    expect(parseBlameSuggestions('')).toBeNull()
    expect(parseBlameSuggestions('   ')).toBeNull()
  })

  it('returns null for non-JSON input', () => {
    expect(parseBlameSuggestions('just three sentences, no JSON')).toBeNull()
  })

  it('returns null when suggestions field is missing', () => {
    expect(parseBlameSuggestions(JSON.stringify({ items: ['a', 'b', 'c'] }))).toBeNull()
  })

  it('returns null when suggestions is not an array', () => {
    expect(parseBlameSuggestions(JSON.stringify({ suggestions: 'a, b, c' }))).toBeNull()
  })

  it('returns null when the array does not have exactly three entries', () => {
    expect(parseBlameSuggestions(JSON.stringify({ suggestions: ['a', 'b'] }))).toBeNull()
    expect(parseBlameSuggestions(JSON.stringify({ suggestions: ['a', 'b', 'c', 'd'] }))).toBeNull()
  })

  it('returns null when any entry is not a string', () => {
    expect(parseBlameSuggestions(JSON.stringify({ suggestions: ['a', 42, 'c'] }))).toBeNull()
    expect(parseBlameSuggestions(JSON.stringify({ suggestions: ['a', null, 'c'] }))).toBeNull()
  })

  it('returns null when any entry is empty after trimming', () => {
    expect(parseBlameSuggestions(JSON.stringify({ suggestions: ['a', '   ', 'c'] }))).toBeNull()
  })

  it('truncates suggestions longer than 200 characters', () => {
    const long = 'x'.repeat(300)
    const raw = JSON.stringify({ suggestions: [long, 'b', 'c'] })
    const result = parseBlameSuggestions(raw)
    expect(result).not.toBeNull()
    expect(result![0].length).toBe(200)
    expect(result![1]).toBe('b')
    expect(result![2]).toBe('c')
  })
})

describe('buildBlameUserPrompt', () => {
  it('returns null for an empty message list', () => {
    expect(buildBlameUserPrompt([])).toBeNull()
  })

  it('includes the user label for user-role messages', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: '帮我写个函数' }] } as Message,
    ]
    const prompt = buildBlameUserPrompt(messages)
    expect(prompt).not.toBeNull()
    expect(prompt!).toContain('用户：帮我写个函数')
  })

  it('includes the AI label for assistant messages', () => {
    const messages: Message[] = [
      { role: 'assistant', content: [{ type: 'text', text: '好的，这是函数' }] } as Message,
    ]
    const prompt = buildBlameUserPrompt(messages)
    expect(prompt).not.toBeNull()
    expect(prompt!).toContain('AI：好的，这是函数')
  })

  it('skips non-text blocks (tool calls, tool results)', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', id: 'call_1' as never, name: 'bash', arguments: '{}' },
          { type: 'text', text: '正在执行' },
        ],
      } as Message,
    ]
    const prompt = buildBlameUserPrompt(messages)
    expect(prompt).not.toBeNull()
    expect(prompt!).toContain('正在执行')
    expect(prompt!).not.toContain('call_1')
  })

  it('handles multiple messages in the list', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: '第一句' }] } as Message,
      { role: 'assistant', content: [{ type: 'text', text: '回复一' }] } as Message,
      { role: 'user', content: [{ type: 'text', text: '第二句' }] } as Message,
      { role: 'assistant', content: [{ type: 'text', text: '回复二' }] } as Message,
    ]
    const prompt = buildBlameUserPrompt(messages)
    expect(prompt).not.toBeNull()
    expect(prompt!).toContain('第一句')
    expect(prompt!).toContain('回复二')
  })
})

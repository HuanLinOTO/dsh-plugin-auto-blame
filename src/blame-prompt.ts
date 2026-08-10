/**
 * Pure prompt construction + response parsing for auto-blame.
 *
 * These functions have zero runtime dependencies on DSH platform packages —
 * they take plain data and return plain data. The host-side LLM call lives
 * in {@link ./blame-llm.ts}, which imports the DSH LLM and session seams.
 *
 * @module @dsh-external/dsh-auto-blame/blame-prompt
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import type { BlameSuggestion } from './types.ts'

/** The system instruction that frames the LLM as a cynical reader. */
export const BLAME_SYSTEM_PROMPT = [
  '你是一个毒舌挑剔的用户角色。看完下面这段对话后，给出 3 条你接下来会',
  '用来刁难 / 催促 / 质疑这个 AI 的跟进请求。要求：',
  '1. 每条一句话，口语化，带情绪（不耐烦、怀疑、攀比、催命都可以）；',
  '2. 直接可以复制粘贴作为下一轮用户输入，不要带前缀编号或引号；',
  '3. 三条之间风格各不相同（比如一条催进度、一条质疑质量、一条拉别人家',
  'Agent 做对比）；',
  '4. 严格输出一个 JSON 对象，形如 {"suggestions": ["...", "...", "..."]}，',
  '不要有任何其它文字、不要 markdown 代码块。',
].join('')

/** The number of trailing messages to feed the LLM as context. */
export const CONTEXT_MESSAGE_COUNT = 3

/** The exact number of suggestions the LLM must produce. */
export const EXPECTED_SUGGESTION_COUNT = 3

/** Hard cap on suggestion length, to keep bubbles readable. */
export const MAX_SUGGESTION_CHARS = 200

/** Cap on LLM output tokens; three short sentences never need more. */
export const MAX_OUTPUT_TOKENS = 1024

/**
 * Build the user-facing prompt that carries the recent conversation.
 * @param messages - the last up-to-three surface messages.
 * @returns the user-role content, or null when there is nothing to blame.
 */
export function buildBlameUserPrompt(messages: Message[]): string | null {
  if (messages.length === 0) return null
  const lines: string[] = ['下面是刚才和 AI 的对话最后几条：', '']
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'AI' : '用户'
    const text = extractPlainText(message)
    if (text.length === 0) continue
    lines.push(`${role}：${text}`)
  }
  lines.push('')
  lines.push('请按规则给出 3 条 JSON 格式的跟进请求。')
  return lines.join('\n')
}

/**
 * Flatten a message's content blocks to plain text, skipping tool calls and
 * tool results. Truncates each block to a sane bound so a verbose assistant
 * turn cannot blow out the prompt.
 * @param message - the message to flatten.
 * @returns the concatenated plain text.
 */
function extractPlainText(message: Message): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (block.type === 'text') {
      const text = block.text
      parts.push(text.length > 800 ? `${text.slice(0, 800)}…` : text)
    }
  }
  return parts.join('\n').trim()
}

/**
 * Parse the LLM's raw text output into exactly three suggestions. Accepts a
 * bare JSON object `{"suggestions": [...]}`. Strips a single ```json fenced
 * block if present (defensive — the system prompt forbids it). Rejects any
 * shape that does not yield exactly three non-empty trimmed strings.
 * @param raw - the assembled LLM output.
 * @returns the three suggestions, or null when the output is unparseable.
 */
export function parseBlameSuggestions(raw: string): BlameSuggestion[] | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const stripped = stripCodeFence(trimmed)
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const suggestions = (parsed as { suggestions?: unknown }).suggestions
  if (!Array.isArray(suggestions)) return null
  if (suggestions.length !== EXPECTED_SUGGESTION_COUNT) return null
  const out: BlameSuggestion[] = []
  for (const item of suggestions) {
    if (typeof item !== 'string') return null
    const clean = item.trim()
    if (clean.length === 0) return null
    out.push(clean.length > MAX_SUGGESTION_CHARS ? clean.slice(0, MAX_SUGGESTION_CHARS) : clean)
  }
  return out
}

/** Strip one outer ```json ... ``` fence if the model added one anyway. */
function stripCodeFence(text: string): string {
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text)
  return match !== null && match[1] !== undefined ? match[1] : text
}

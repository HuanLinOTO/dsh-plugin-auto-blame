/**
 * Host-side LLM call for auto-blame: derive recent messages, build the call
 * options, drain the stream, and parse the three suggestions.
 *
 * This module imports the DSH LLM and session seams at runtime; the pure
 * prompt/parsing functions live in {@link ./blame-prompt.ts} so they can be
 * unit-tested without resolving the DSH workspace packages.
 *
 * @module @dsh-external/dsh-auto-blame/blame-llm
 */

import type { Context } from 'cordis'
import type { LlmService, GenerateOptions, Message, ReasoningEffortId, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { BlameSuggestion } from './types.ts'
import {
  BLAME_SYSTEM_PROMPT,
  MAX_OUTPUT_TOKENS,
  buildBlameUserPrompt,
  parseBlameSuggestions,
} from './blame-prompt.ts'

/**
 * Derive the last {@link CONTEXT_MESSAGE_COUNT} model-visible messages from
 * the session surface. The surface already excludes chunks, boundaries, and
 * empty-content assistant messages, so what remains is the human-readable
 * conversation. Empty session → empty array.
 * @param session - the agent's live session.
 * @returns the last up-to-three messages, oldest-first.
 */
export function deriveRecentMessages(session: Session): Message[] {
  const events = session.events
  const messages: Message[] = []
  for (const event of events) {
    const message = projectEventMessage(event)
    if (message !== null) messages.push(message)
  }
  return messages.slice(-3)
}

/**
 * Project one message-producing session event without importing the session
 * package at runtime. This mirrors `deriveEventMessage`: user messages and
 * tool results pass through, assistant messages with empty content do not.
 * @param event - one committed session event.
 * @returns the projected message, or null for non-surface events.
 */
function projectEventMessage(event: SessionEvent): Message | null {
  switch (event.type) {
    case 'user/message':
      return event.data
    case 'assistant/message':
      return event.data.message.content.length === 0 ? null : event.data.message
    case 'tool/result':
      return event.data.message
    default:
      return null
  }
}

/**
 * Assemble the {@link GenerateOptions} for the blame call. Uses the agent's
 * own provider/model, a tight max-tokens cap, and no tools — the LLM has one
 * job: emit three short strings.
 * @param agent - the agent whose turn just closed.
 * @param userPrompt - the user-role content carrying the recent conversation.
 * @returns the assembled options, ready for `ctx.llm.stream()`.
 */
export function buildBlameCallOptions(
  agent: Agent,
  userPrompt: string,
): GenerateOptions {
  const systemMessage = localMessage('system', BLAME_SYSTEM_PROMPT)
  const userMessage = localMessage('user', userPrompt)
  return {
    provider: agent.options.provider ?? '',
    model: agent.options.model ?? '',
    reasoningEffort: 'off' as ReasoningEffortId,
    messages: [systemMessage, userMessage],
    tools: [],
    maxTokens: MAX_OUTPUT_TOKENS,
    signal: undefined,
  }
}

/**
 * Construct the complete Message shape required by `GenerateOptions` without
 * importing the LLM package at runtime. Message ids are opaque UUID strings;
 * source is provenance only and adapters consume role/content.
 * @param role - system or user role for this auxiliary call.
 * @param text - the single text block.
 * @returns a complete provider-neutral message.
 */
function localMessage(role: 'system' | 'user', text: string): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role,
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }
}

/**
 * Drain an LLM stream into a single string. Adapters emit `block-start` /
 * `text-delta` / `block-end` / `finish`; this consumes text-delta only and
 * returns the assembled text. A non-`stop` finish or an empty result yields
 * null so the caller can skip the session append.
 * @param stream - the async iterable of chunks from `ctx.llm.stream()`.
 * @returns the assembled text, or null on empty/aborted/error finish.
 */
export async function drainTextStream(stream: AsyncIterable<StreamChunk>): Promise<string | null> {
  const parts: string[] = []
  let stopReached = false
  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text-delta':
        parts.push(chunk.text)
        break
      case 'finish': {
        // FinishReason is a discriminated union on `kind`.
        if (chunk.reason.kind === 'stop') {
          stopReached = true
        }
        break
      }
      default:
        break
    }
  }
  if (!stopReached) return null
  const text = parts.join('')
  return text.length === 0 ? null : text
}

/**
 * Pre-check: whether all conditions for generation are met (llm service
 * available, provider/model set, non-empty session). Used by the caller to
 * decide whether to emit the `auto-blame/generating` loading signal — if this
 * returns false, generation would be silently skipped, so no loading UI.
 * @param ctx - host context carrying the `llm` service.
 * @param agent - the agent whose turn just closed.
 * @returns true if `generateBlameSuggestions` will proceed past pre-checks.
 */
export function canGenerateBlame(ctx: Context, agent: Agent): boolean {
  if (ctx.get('llm') === undefined) return false
  if (agent.options.provider === undefined || agent.options.model === undefined) return false
  const messages = deriveRecentMessages(agent.session)
  return buildBlameUserPrompt(messages) !== null
}

/**
 * End-to-end: derive recent messages, build the prompt, call the LLM, parse
 * the three suggestions. Resolves to null on any failure (empty session, no
 * provider/model, LLM error, unparseable output) so the caller can skip the
 * session append without a try/catch ladder.
 * @param ctx - host context carrying the `llm` service.
 * @param agent - the agent whose turn just closed.
 * @returns three suggestions, or null.
 */
export async function generateBlameSuggestions(
  ctx: Context,
  agent: Agent,
): Promise<BlameSuggestion[] | null> {
  const llm = ctx.get('llm') as LlmService | undefined
  if (llm === undefined) return null
  const provider = agent.options.provider
  const model = agent.options.model
  if (provider === undefined || model === undefined) return null

  const messages = deriveRecentMessages(agent.session)
  const userPrompt = buildBlameUserPrompt(messages)
  if (userPrompt === null) return null

  const options = buildBlameCallOptions(agent, userPrompt)
  let stream: AsyncIterable<StreamChunk>
  try {
    stream = llm.stream(options)
  } catch {
    return null
  }
  const raw = await drainTextStream(stream)
  if (raw === null) return null
  return parseBlameSuggestions(raw)
}

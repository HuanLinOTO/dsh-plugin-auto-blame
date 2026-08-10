# dsh-auto-blame — Agent Guide

## Plugin overview

Bundle-style DSH plugin that generates three cynical follow-up prompts after each turn closes. The host listens on `agent/turn-stopping`, fire-and-forget calls `ctx.llm.stream()` with the last three surface messages, and appends an `auto-blame/suggestions` session event. A projection unit folds that event into the `autoBlame` cell, which the browser half reads through `useProjection('autoBlame')` and renders as click-to-send bubbles in `conversation.composer.dock`.

## Key conventions

- **Bundle form**: `cordis.patch.yml` inserts one plugin row; `package.json` has `dsh.bundle.patch`. No source patches to DSH staging.
- **Host + client dual bundle**: host half (`src/index.ts`) listens on turn-stopping + calls LLM + appends session event; browser half (`src/client/`) renders bubbles + handles click-to-send.
- **Pre-built `lib/` strategy**: `lib/` is committed (not in `.gitignore`); no `prepare` script; `github:` install works out of the box.
- **Peer deps**: cordis + `@deepseek-ai/dsh-*` (provided by host). Zero runtime npm deps.
- **Fire-and-forget**: the turn-stopping listener returns `void` immediately; the LLM call runs in a detached promise. Failures are logged and contained.

## File responsibilities

| File | Role |
|------|------|
| `src/index.ts` | Host entry: registers projection unit + turn-stopping listener |
| `src/invariant.ts` | Package invariant companion (empty installer) |
| `src/types.ts` | `SessionEventMap` + `SessionProjectionMap` declaration merging |
| `src/blame-prompt.ts` | Pure functions: system prompt, user prompt builder, response parser |
| `src/blame-llm.ts` | Runtime: derive recent messages, build LLM call options, drain stream, generate suggestions |
| `src/projection.ts` | `autoBlame` projection unit (folds `auto-blame/suggestions` events) |
| `src/client/index.ts` | Client entry: registers `conversation.composer.dock` entry + locale namespace |
| `src/client/SuggestionBubbles.tsx` | Bubble component: reads `useProjection('autoBlame')`, renders 3 pills, click → `inputActions.setDraft + submit` |
| `src/client/locales.ts` | English + Chinese dictionaries for the `dsh-auto-blame` namespace |
| `tests/blame-prompt.spec.ts` | Unit tests for parseBlameSuggestions + buildBlameUserPrompt |
| `tests/projection.spec.ts` | Unit tests for foldAutoBlame |

## Commands

```sh
pnpm run typecheck    # tsc --noEmit (resolves DSH src through ../dsh)
pnpm test             # vitest run (22 unit tests)
pnpm run build        # tsc + tsdown → lib/index.js, lib/invariant.js, lib/client.js
```

## Data flow

1. `agent/turn-stopping` fires (serial, turn about to close)
2. Host starts a detached promise: `generateBlameSuggestions(ctx, agent)`
3. `deriveRecentMessages(session)` → last 3 surface messages via `deriveEventMessage`
4. `buildBlameUserPrompt(messages)` → user-role prompt text
5. `buildBlameCallOptions(agent, prompt)` → `GenerateOptions` with agent's provider/model
6. `ctx.llm.stream(options)` → `drainTextStream` → raw text
7. `parseBlameSuggestions(raw)` → 3 strings (or null on any failure)
8. `session.append('auto-blame/suggestions', { turn, suggestions })`
9. Projection unit folds the event → `autoBlame` cell updates
10. `session/projection` push frame reaches the client
11. `useProjection('autoBlame')` in SuggestionBubbles re-renders
12. User clicks a bubble → `inputActions.setDraft(text)` + `inputActions.submit()`
13. The resulting `turn/start` clears the projection, so the sent suggestions disappear immediately

## Gotchas

- The `auto-blame/suggestions` event is non-surface (no `surfaceOp`), so it never enters model-visible history and cannot perturb the agent loop.
- The LLM call uses the agent's own provider/model (`agent.options.provider` / `agent.options.model`). If the agent has no provider/model (headless / replay), generation is skipped silently.
- `FinishReason` is a discriminated union on `kind` (not a string); `drainTextStream` checks `chunk.reason.kind === 'stop'`.
- The `schema` parameter of the projection unit is a pass-through `{ parse: v => v }` shim, not a real zod schema — the `view` is the identity and the `apply` already guarantees the shape. This avoids pulling zod as a runtime dependency.
- Click-to-send is gated on `useInput(s => s.phase) === 'plain'` to avoid clobbering an in-flight submit.

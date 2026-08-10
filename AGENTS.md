# dsh-auto-blame — Agent Guide

## Plugin overview

Bundle-style DSH plugin that generates three cynical follow-up prompts after each turn closes. The host listens on `agent/turn-stopping`, **gated by the `enabled` settings flag** — false returns immediately, no LLM call, no token cost. True fire-and-forget calls `ctx.llm.stream()` with the last three surface messages and appends an `auto-blame/suggestions` session event. A projection unit folds that event into the `autoBlame` cell, which the browser half reads through `useProjection('autoBlame')` and renders as click-to-send bubbles in `conversation.composer.dock`. A `settings.section` entry exposes the master `enabled` toggle, persisted through the settings seam to `$DSH_HOME/settings.yaml` and read/written by the client over a dedicated `/auto-blame` RPC channel.

## Key conventions

- **Bundle form**: `cordis.patch.yml` inserts one plugin row with `config.enabled` seed; `package.json` has `dsh.bundle.patch`. No source patches to DSH staging.
- **Host + client dual bundle**: host half (`src/index.ts`) registers the settings namespace + RPC + turn-stopping listener (gated on `enabled`); browser half (`src/client/`) renders bubbles + the settings toggle.
- **Pre-built `lib/` strategy**: `lib/` is committed (not in `.gitignore`); no `prepare` script; `github:` install works out of the box.
- **Peer deps**: cordis + schemastery + `@deepseek-ai/dsh-*` (provided by host). Zero runtime npm deps.
- **Host-side gate**: the `enabled` flag lives in the `auto-blame` settings namespace (`$DSH_HOME/settings.yaml`). The turn-stopping listener reads `scope.get().enabled` synchronously before queueing any LLM call — false means no detached promise, no token cost, no projection event, no bubbles. This is a true host-side gate, not a client-side hide.
- **Fire-and-forget** (when enabled): the turn-stopping listener returns `void` immediately; the LLM call runs in a detached promise. Failures are logged and contained.
- **RPC-backed settings page**: the client settings page reads/writes `enabled` through the `/auto-blame` RPC channel (`settings.get` / `settings.set`). The host persists writes through the settings scope; live toggles take effect on the next turn-stopping without restart.

## File responsibilities

| File | Role |
|------|------|
| `src/index.ts` | Host entry: registers projection unit + settings namespace + turn-stopping listener (gated on `enabled`) + RPC |
| `src/invariant.ts` | Package invariant companion (empty installer) |
| `src/types.ts` | `SessionEventMap` + `SessionProjectionMap` + `AutoBlameSettings` declarations |
| `src/blame-prompt.ts` | Pure functions: system prompt, user prompt builder, response parser |
| `src/blame-llm.ts` | Runtime: derive recent messages, build LLM call options, drain stream, generate suggestions |
| `src/projection.ts` | `autoBlame` projection unit (folds `auto-blame/suggestions` events) |
| `src/rpc.ts` | `/auto-blame` RPC channel: `settings.get` / `settings.set` endpoints |
| `src/client/index.ts` | Client entry: registers `conversation.composer.dock` entry + `settings.section` entry (with rpc inject) + locale namespace |
| `src/client/SuggestionBubbles.tsx` | Bubble component: reads `useProjection('autoBlame')`, renders 3 pills, click → `inputActions.setDraft + submit`. No `enabled` check — host gate keeps the projection null when disabled |
| `src/client/AutoBlameSection.tsx` | Settings page: master `enabled` toggle, reads/writes through `/auto-blame` RPC |
| `src/client/locales.ts` | English + Chinese dictionaries for the `dsh-auto-blame` namespace |
| `tests/blame-prompt.spec.ts` | Unit tests for parseBlameSuggestions + buildBlameUserPrompt |
| `tests/projection.spec.ts` | Unit tests for foldAutoBlame |
| `tests/settings.spec.ts` | Unit tests for the RPC handler (settings.get / settings.set) + gate closure |

## Commands

```sh
pnpm run typecheck    # tsc --noEmit (resolves DSH src through node_modules links)
pnpm test             # vitest run (39 unit tests)
pnpm run build        # tsc + tsdown → lib/index.js, lib/invariant.js, lib/client.js
```

## Data flow

1. `agent/turn-stopping` fires (serial, turn about to close)
2. Host reads `scope.get().enabled` — if false, return immediately (no LLM call, no projection event)
3. Host starts a detached promise: `generateBlameSuggestions(ctx, agent)`
4. `deriveRecentMessages(session)` → last 3 surface messages via `deriveEventMessage`
5. `buildBlameUserPrompt(messages)` → user-role prompt text
6. `buildBlameCallOptions(agent, prompt)` → `GenerateOptions` with agent's provider/model
7. `ctx.llm.stream(options)` → `drainTextStream` → raw text
8. `parseBlameSuggestions(raw)` → 3 strings (or null on any failure)
9. `session.append('auto-blame/suggestions', { turn, suggestions })`
10. Projection unit folds the event → `autoBlame` cell updates
11. `session/projection` push frame reaches the client
12. `useProjection('autoBlame')` in SuggestionBubbles re-renders
13. User clicks a bubble → `inputActions.setDraft(text)` + `inputActions.submit()`
14. The resulting `turn/start` clears the projection, so the sent suggestions disappear immediately

## Settings toggle data flow

1. Client settings page mounts → RPC `auto-blame/settings.get` → host returns `scope.get().enabled`
2. User toggles → RPC `auto-blame/settings.set { enabled }` → host `scope.update({ enabled })` → persists to `settings.yaml`
3. Host `scope.watch` fires (internal) → `getEnabled` thunk reads through on next call
4. Next `agent/turn-stopping` → host reads `getEnabled()` → false skips LLM call entirely

## Gotchas

- The `auto-blame/suggestions` event is non-surface (no `surfaceOp`), so it never enters model-visible history and cannot perturb the agent loop.
- The LLM call uses the agent's own provider/model (`agent.options.provider` / `agent.options.model`). If the agent has no provider/model (headless / replay), generation is skipped silently.
- `FinishReason` is a discriminated union on `kind` (not a string); `drainTextStream` checks `chunk.reason.kind === 'stop'`.
- The `schema` parameter of the projection unit is a pass-through `{ parse: v => v }` shim, not a real zod schema — the `view` is the identity and the `apply` already guarantees the shape. This avoids pulling zod as a runtime dependency.
- Click-to-send is gated on `useInput(s => s.phase) === 'plain'` to avoid clobbering an in-flight submit.
- The `enabled` flag is a true host-side gate: the turn-stopping listener reads it synchronously before queueing the LLM call. When false, no detached promise, no token cost, no projection event — the bubbles never render because the projection stays null.
- Headless assemblies without a settings provider fall back to in-memory state: RPC writes update the closure but do not persist across restarts. The cordis.yml `enabled` seed is the only durable value in that mode.
- The client SuggestionBubbles component does NOT read `enabled` directly — it relies on the host gate keeping the projection null. This avoids an async RPC read on the hot composer path.

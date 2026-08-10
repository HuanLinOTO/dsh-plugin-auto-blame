import z from "schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
//#region src/blame-prompt.ts
/** The system instruction that frames the LLM as a cynical reader. */
const BLAME_SYSTEM_PROMPT = [
	"你是一个毒舌挑剔的用户角色。看完下面这段对话后，给出 3 条你接下来会",
	"用来刁难 / 催促 / 质疑这个 AI 的跟进请求。要求：",
	"1. 每条一句话，口语化，带情绪（不耐烦、怀疑、攀比、催命都可以）；",
	"2. 直接可以复制粘贴作为下一轮用户输入，不要带前缀编号或引号；",
	"3. 三条之间风格各不相同（比如一条催进度、一条质疑质量、一条拉别人家",
	"Agent 做对比）；",
	"4. 严格输出一个 JSON 对象，形如 {\"suggestions\": [\"...\", \"...\", \"...\"]}，",
	"不要有任何其它文字、不要 markdown 代码块。"
].join("");
/** Cap on LLM output tokens; three short sentences never need more. */
const MAX_OUTPUT_TOKENS = 1024;
/**
* Build the user-facing prompt that carries the recent conversation.
* @param messages - the last up-to-three surface messages.
* @returns the user-role content, or null when there is nothing to blame.
*/
function buildBlameUserPrompt(messages) {
	if (messages.length === 0) return null;
	const lines = ["下面是刚才和 AI 的对话最后几条：", ""];
	for (const message of messages) {
		const role = message.role === "assistant" ? "AI" : "用户";
		const text = extractPlainText(message);
		if (text.length === 0) continue;
		lines.push(`${role}：${text}`);
	}
	lines.push("");
	lines.push("请按规则给出 3 条 JSON 格式的跟进请求。");
	return lines.join("\n");
}
/**
* Flatten a message's content blocks to plain text, skipping tool calls and
* tool results. Truncates each block to a sane bound so a verbose assistant
* turn cannot blow out the prompt.
* @param message - the message to flatten.
* @returns the concatenated plain text.
*/
function extractPlainText(message) {
	const parts = [];
	for (const block of message.content) if (block.type === "text") {
		const text = block.text;
		parts.push(text.length > 800 ? `${text.slice(0, 800)}…` : text);
	}
	return parts.join("\n").trim();
}
/**
* Parse the LLM's raw text output into exactly three suggestions. Accepts a
* bare JSON object `{"suggestions": [...]}`. Strips a single ```json fenced
* block if present (defensive — the system prompt forbids it). Rejects any
* shape that does not yield exactly three non-empty trimmed strings.
* @param raw - the assembled LLM output.
* @returns the three suggestions, or null when the output is unparseable.
*/
function parseBlameSuggestions(raw) {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	const stripped = stripCodeFence(trimmed);
	let parsed;
	try {
		parsed = JSON.parse(stripped);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const suggestions = parsed.suggestions;
	if (!Array.isArray(suggestions)) return null;
	if (suggestions.length !== 3) return null;
	const out = [];
	for (const item of suggestions) {
		if (typeof item !== "string") return null;
		const clean = item.trim();
		if (clean.length === 0) return null;
		out.push(clean.length > 200 ? clean.slice(0, 200) : clean);
	}
	return out;
}
/** Strip one outer ```json ... ``` fence if the model added one anyway. */
function stripCodeFence(text) {
	const match = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
	return match !== null && match[1] !== void 0 ? match[1] : text;
}
//#endregion
//#region src/blame-llm.ts
/**
* Derive the last {@link CONTEXT_MESSAGE_COUNT} model-visible messages from
* the session surface. The surface already excludes chunks, boundaries, and
* empty-content assistant messages, so what remains is the human-readable
* conversation. Empty session → empty array.
* @param session - the agent's live session.
* @returns the last up-to-three messages, oldest-first.
*/
function deriveRecentMessages(session) {
	const events = session.events;
	const messages = [];
	for (const event of events) {
		const message = projectEventMessage(event);
		if (message !== null) messages.push(message);
	}
	return messages.slice(-3);
}
/**
* Project one message-producing session event without importing the session
* package at runtime. This mirrors `deriveEventMessage`: user messages and
* tool results pass through, assistant messages with empty content do not.
* @param event - one committed session event.
* @returns the projected message, or null for non-surface events.
*/
function projectEventMessage(event) {
	switch (event.type) {
		case "user/message": return event.data;
		case "assistant/message": return event.data.message.content.length === 0 ? null : event.data.message;
		case "tool/result": return event.data.message;
		default: return null;
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
function buildBlameCallOptions(agent, userPrompt) {
	const systemMessage = localMessage("system", BLAME_SYSTEM_PROMPT);
	const userMessage = localMessage("user", userPrompt);
	return {
		provider: agent.options.provider ?? "",
		model: agent.options.model ?? "",
		reasoningEffort: "off",
		messages: [systemMessage, userMessage],
		tools: [],
		maxTokens: MAX_OUTPUT_TOKENS,
		signal: void 0
	};
}
/**
* Construct the complete Message shape required by `GenerateOptions` without
* importing the LLM package at runtime. Message ids are opaque UUID strings;
* source is provenance only and adapters consume role/content.
* @param role - system or user role for this auxiliary call.
* @param text - the single text block.
* @returns a complete provider-neutral message.
*/
function localMessage(role, text) {
	return {
		id: crypto.randomUUID(),
		role,
		content: [{
			type: "text",
			text
		}],
		source: { kind: "user" }
	};
}
/**
* Drain an LLM stream into a single string. Adapters emit `block-start` /
* `text-delta` / `block-end` / `finish`; this consumes text-delta only and
* returns the assembled text. A non-`stop` finish or an empty result yields
* null so the caller can skip the session append.
* @param stream - the async iterable of chunks from `ctx.llm.stream()`.
* @returns the assembled text, or null on empty/aborted/error finish.
*/
async function drainTextStream(stream) {
	const parts = [];
	let stopReached = false;
	for await (const chunk of stream) switch (chunk.type) {
		case "text-delta":
			parts.push(chunk.text);
			break;
		case "finish": if (chunk.reason.kind === "stop") stopReached = true;
	}
	if (!stopReached) return null;
	const text = parts.join("");
	return text.length === 0 ? null : text;
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
function canGenerateBlame(ctx, agent) {
	if (ctx.get("llm") === void 0) return false;
	if (agent.options.provider === void 0 || agent.options.model === void 0) return false;
	return buildBlameUserPrompt(deriveRecentMessages(agent.session)) !== null;
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
async function generateBlameSuggestions(ctx, agent) {
	const llm = ctx.get("llm");
	if (llm === void 0) return null;
	const provider = agent.options.provider;
	const model = agent.options.model;
	if (provider === void 0 || model === void 0) return null;
	const userPrompt = buildBlameUserPrompt(deriveRecentMessages(agent.session));
	if (userPrompt === null) return null;
	const options = buildBlameCallOptions(agent, userPrompt);
	let stream;
	try {
		stream = llm.stream(options);
	} catch {
		return null;
	}
	const raw = await drainTextStream(stream);
	if (raw === null) return null;
	return parseBlameSuggestions(raw);
}
//#endregion
//#region src/projection.ts
/**
* Minimal schema: the projection registry calls `schema.parse(value)` to
* validate the view output before serving it. Our `view` is the identity
* (state IS the wire value), and the host-side `apply` already guarantees
* the shape, so a pass-through validator is sufficient. Avoids pulling in
* zod as a runtime dependency for a bundle-style plugin.
*/
const autoBlameSchema = { parse(value) {
	return value;
} };
/**
* Pure fold: previous state + one committed event → next state. Returns the
* same state reference for events that are not ours (an unchanged reference
* produces zero downstream work per the projection contract). Exported for
* direct unit testing.
* @param state - the current projection state.
* @param event - the next committed session event.
* @returns the next state (same reference when the event is not ours).
*/
function foldAutoBlame(state, event) {
	if (event.type === "auto-blame/generating") return {
		turn: event.data.turn,
		generating: true,
		suggestions: []
	};
	if (event.type === "auto-blame/suggestions") {
		const payload = event.data;
		return {
			turn: payload.turn,
			generating: false,
			suggestions: payload.suggestions
		};
	}
	if (event.type === "turn/start") return null;
	return state;
}
/**
* Register the `autoBlame` projection unit on the session-projection registry,
* if the registry is composed. Headless assemblies without the seam stay
* unaffected. `stateVersion: 3` — the state now carries a `generating` flag.
* @param ctx - the host context that may carry `ctx.sessionProjections`.
*/
function registerAutoBlameProjection(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register({
			key: "autoBlame",
			schema: autoBlameSchema,
			init: () => null,
			apply: foldAutoBlame,
			view: (state) => state,
			stateVersion: 3
		});
	});
}
//#endregion
//#region src/rpc.ts
/** The dedicated RPC channel carrying every dsh-auto-blame endpoint. */
const CHANNEL = "/auto-blame";
/** Build an RPC ok branch. */
function ok(value) {
	return {
		ok: true,
		value
	};
}
/** Build an RPC error branch using the closed `internal` code (no plugin-specific code). */
function fail(message) {
	return {
		ok: false,
		error: {
			code: "internal",
			message,
			details: {}
		}
	};
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
function registerAutoBlameRpc(ctx, getEnabled, setEnabled) {
	ctx.logger.info("dsh-auto-blame: registering RPC channel /auto-blame");
	ctx.inject(["connection"], (cctx) => {
		cctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
			switch (endpoint) {
				case "settings.get": return ok({ enabled: getEnabled() });
				case "settings.set": {
					const p = payload;
					if (p === void 0 || typeof p !== "object" || p === null || typeof p.enabled !== "boolean") return fail("payload must be { enabled: boolean }");
					try {
						await setEnabled(p.enabled);
					} catch (error) {
						return fail(error instanceof Error ? error.message : String(error));
					}
					return ok({ enabled: getEnabled() });
				}
				default: return fail(`unknown endpoint: ${endpoint}`);
			}
		}, { authority: "trusted-host" });
	});
}
//#endregion
//#region src/index.ts
const name = "dsh-auto-blame";
/** `connection` is required for the RPC channel that backs the settings page. */
const inject = ["connection"];
/** Settings namespace under which the `enabled` flag persists (`$DSH_HOME/settings.yaml`). */
const SETTINGS_NAMESPACE = settingsNamespace("auto-blame");
/**
* Schemastery schema for the `auto-blame` settings namespace. Identical
* shape to {@link Config} — cordis.yml seed becomes the composition `base`,
* and the user layer (settings.yaml) overrides it.
*/
const SettingsSchema = z.object({ enabled: z.boolean().default(true).description("Master switch: when off, the host skips the LLM call and no bubbles render.") });
const Config = z.object({ enabled: z.boolean().default(true).description("Master switch seed (cordis.yml). User edits live in settings.yaml.") });
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
function apply(ctx, config) {
	registerAutoBlameProjection(ctx);
	let getEnabled = () => config.enabled;
	let scope;
	ctx.inject(["settings"], (sctx) => {
		scope = sctx.settings.register(SETTINGS_NAMESPACE, SettingsSchema, { base: config });
		getEnabled = () => scope.get().enabled;
	});
	ctx.on("agent/turn-stopping", ({ agent, turn }) => {
		if (!getEnabled()) return;
		runBlameGeneration(ctx, agent, turn).catch((error) => {
			ctx.logger.warn(`dsh-auto-blame: generation for turn ${turn} failed: ${String(error)}`);
		});
	});
	registerAutoBlameRpc(ctx, () => getEnabled(), async (enabled) => {
		if (scope !== void 0) {
			await scope.update({ enabled });
			return;
		}
		getEnabled = () => enabled;
	});
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
async function runBlameGeneration(ctx, agent, turn) {
	if (!canGenerateBlame(ctx, agent)) return;
	agent.session.append("auto-blame/generating", { turn });
	const suggestions = await generateBlameSuggestions(ctx, agent);
	if (suggestions === null) {
		agent.session.append("auto-blame/suggestions", {
			turn,
			suggestions: []
		});
		return;
	}
	agent.session.append("auto-blame/suggestions", {
		turn,
		suggestions
	});
}
//#endregion
export { Config, SETTINGS_NAMESPACE, apply, inject, name };

window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-auto-blame",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/SuggestionBubbles.tsx
		/**
		* SuggestionBubbles — three click-to-send cynical follow-up prompts.
		*
		* Reads the `autoBlame` projection (host-generated LLM suggestions for the
		* just-closed turn) through the standard-kit `useProjection` seat. While the
		* host LLM call is in-flight (`generating: true`), renders the "领导视野"
		* label with a DeepSeek-brand shimmer gradient (matching the "Deep diving..."
		* turn-status effect). When suggestions land, the label transitions to its
		* normal color and the bubbles fade-slide in with a staggered entrance.
		*
		* A click feeds the text to the input machine — `inputActions.setDraft(text)`
		* then `inputActions.submit()` — the same path the InputBar uses.
		*
		* The click is ignored while the input machine is not in the `plain` phase
		* (e.g. while a turn is streaming) to avoid clobbering an in-flight submit.
		*
		* @module @dsh-external/dsh-auto-blame/client/SuggestionBubbles
		*/
		/** One-time style injection id; the tag stays for the page lifetime. */
		const STYLE_TAG_ID = "dsh-auto-blame-styles";
		/** The CSS text for the bubbles; uses dsh's --dsw-* tokens where available. */
		const CSS_TEXT = `
.dsh-auto-blame-root {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  flex-wrap: wrap;
  align-items: center;
}
.dsh-auto-blame-label {
  font-size: 12px;
  color: var(--dsw-text-tertiary, #999);
  white-space: nowrap;
}
.dsh-auto-blame-label-loading {
  font-size: 12px;
  white-space: nowrap;
  background: linear-gradient(
    90deg,
    var(--dsw-static-deepseek-500, #4D6BFE) 0%,
    var(--dsw-static-deepseek-500, #4D6BFE) 40%,
    var(--dsw-static-deepseek-200, #A5B8FF) 50%,
    var(--dsw-static-deepseek-500, #4D6BFE) 60%,
    var(--dsw-static-deepseek-500, #4D6BFE) 100%
  );
  background-position: 100% 0;
  background-size: 250% 100%;
  background-clip: text;
  color: transparent;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: dsh-auto-blame-shimmer 1.8s linear infinite;
}
@keyframes dsh-auto-blame-shimmer {
  to {
    background-position: 0 0;
  }
}
.dsh-auto-blame-bubble {
  position: relative;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid var(--dsw-border, #e0e0e0);
  background: var(--dsw-surface, #fafafa);
  color: var(--dsw-text, #333);
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
  max-width: 280px;
  overflow: visible;
  animation: dsh-auto-blame-bubble-enter 0.32s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
}
@keyframes dsh-auto-blame-bubble-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.dsh-auto-blame-bubble-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-auto-blame-bubble::after {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  z-index: 10;
  width: max-content;
  max-width: min(520px, calc(100vw - 48px));
  padding: 9px 12px;
  border: 1px solid var(--dsw-border-hover, #ccc);
  border-radius: 12px;
  background: var(--dsw-surface, #fafafa);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  color: var(--dsw-text, #333);
  content: attr(data-full-text);
  font-size: 13px;
  line-height: 1.5;
  opacity: 0;
  pointer-events: none;
  text-align: left;
  white-space: normal;
  transform: translate(-50%, 4px);
  transition: opacity 0.14s ease, transform 0.14s ease, visibility 0.14s;
  visibility: hidden;
}
.dsh-auto-blame-bubble:hover {
  background: var(--dsw-surface-hover, #f0f0f0);
  border-color: var(--dsw-border-hover, #ccc);
}
.dsh-auto-blame-bubble:hover::after,
.dsh-auto-blame-bubble:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
  visibility: visible;
}
.dsh-auto-blame-bubble:focus-visible {
  border-color: var(--dsw-border-hover, #ccc);
  box-shadow: 0 0 0 2px var(--dsw-focus, #5b8def);
  outline: none;
}
.dsh-auto-blame-bubble:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-auto-blame-label-loading {
    background-position: 0 0;
    background-size: 100% 100%;
    animation: none;
  }
  .dsh-auto-blame-bubble {
    animation: none;
  }
  .dsh-auto-blame-bubble::after {
    transition: none;
  }
}
`;
		/** Root div style; the anchor is a zero-size lifecycle placeholder is unnecessary (the dock already places us). */
		const ROOT_STYLE = { display: "contents" };
		/**
		* Render the suggestion bubbles or the loading shimmer.
		* @param props - dock runtime share + locale seat.
		* @returns the bubble row, the loading label, or null.
		*/
		function SuggestionBubbles({ useProjection, useInput, inputActions, t }) {
			const projection = useProjection("autoBlame");
			const phase = useInput((s) => s.phase);
			const [sending, setSending] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (typeof document === "undefined") return;
				if (document.getElementById(STYLE_TAG_ID) !== null) return;
				const tag = document.createElement("style");
				tag.id = STYLE_TAG_ID;
				tag.textContent = CSS_TEXT;
				document.head.appendChild(tag);
			}, []);
			if (projection === void 0 || projection === null) return null;
			if (projection.generating) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-auto-blame-root",
					"aria-label": t("title"),
					role: "status",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-auto-blame-label-loading",
						children: t("title")
					})
				})
			});
			if (projection.suggestions.length === 0) return null;
			const disabled = phase !== "plain" || sending !== null;
			const handleClick = (index, text) => {
				if (disabled) return;
				setSending(index);
				inputActions.setDraft(text);
				inputActions.submit();
				window.setTimeout(() => setSending(null), 300);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: ROOT_STYLE,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-auto-blame-root",
					"aria-label": t("title"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-auto-blame-label",
						children: t("title")
					}), projection.suggestions.map((text, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "dsh-auto-blame-bubble",
						"data-full-text": text,
						disabled,
						title: t("send"),
						onClick: () => handleClick(index, text),
						style: { animationDelay: `${index * 70}ms` },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-auto-blame-bubble-text",
							children: text
						})
					}, `${projection.turn}-${index}`))]
				})
			});
		}
		//#endregion
		//#region src/client/AutoBlameSection.tsx
		/**
		* AutoBlameSection — the `dsh-auto-blame` settings page: a master toggle.
		*
		* Registered as a `settings.section` slot entry. One row: the `enabled`
		* switch and its description. Styled with inline rules, mirroring
		* dsh-anti-ads's section — every colour is inherited or a neutral alpha so
		* the page follows the host's light and dark themes without knowing which
		* one is on.
		*
		* The toggle writes through the `/auto-blame` RPC channel
		* (`auto-blame/settings.set`), which the host persists through the settings
		* seam to `$DSH_HOME/settings.yaml`. The host's `agent/turn-stopping`
		* listener reads the same flag on the next turn and skips the LLM call
		* entirely when false — no token cost, no projection event, no bubbles.
		* This is a true host-side gate, not a client-side hide.
		*
		* @module @dsh-external/dsh-auto-blame/client/AutoBlameSection
		*/
		const sectionStyle = {
			display: "flex",
			flexDirection: "column"
		};
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 24,
			padding: "14px 0",
			borderTop: "1px solid rgba(128, 128, 128, 0.22)"
		};
		const labelStyle = {
			fontSize: 15,
			lineHeight: 1.4
		};
		const blurbStyle = {
			fontSize: 13,
			lineHeight: 1.5,
			opacity: .55,
			marginTop: 2
		};
		const noteStyle = {
			marginTop: 14,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(128, 128, 128, 0.12)",
			fontSize: 13,
			lineHeight: 1.6,
			opacity: .8
		};
		const loadingStyle = {
			fontSize: 13,
			opacity: .55,
			padding: "14px 0"
		};
		const errorStyle = {
			fontSize: 13,
			opacity: .7,
			padding: "10px 12px",
			borderRadius: 8,
			background: "rgba(192, 64, 64, 0.12)",
			marginBottom: 8
		};
		/** A pill switch, same shape as dsh-anti-ads's section uses. */
		function Toggle({ on, label, onToggle, disabled }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				"aria-label": label,
				onClick: onToggle,
				disabled,
				style: {
					flex: "0 0 auto",
					position: "relative",
					width: 44,
					height: 26,
					padding: 0,
					border: 0,
					borderRadius: 13,
					background: on ? "#2f6fed" : "rgba(128, 128, 128, 0.35)",
					transition: "background 160ms ease",
					cursor: disabled ? "not-allowed" : "pointer",
					opacity: disabled ? .5 : 1
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					style: {
						position: "absolute",
						top: 3,
						left: on ? 21 : 3,
						width: 20,
						height: 20,
						borderRadius: "50%",
						background: "#fff",
						boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
						transition: "left 160ms ease"
					}
				})
			});
		}
		/**
		* Render the auto-blame settings page.
		*
		* Loads the current `enabled` value through RPC on mount; the toggle writes
		* through RPC and optimistically updates the local state. A failed load
		* falls back to `true` (a freshly installed plugin runs) and surfaces the
		* error so the user knows the host round-trip failed.
		* @param props - settings.section runtime share + locale + inject.
		* @returns the section content column.
		*/
		function AutoBlameSection({ rpc, t }) {
			const [enabled, setEnabled] = (0, react.useState)(void 0);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(void 0);
			const [writing, setWriting] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				(async () => {
					setLoading(true);
					setError(void 0);
					try {
						const result = await rpc.call("/auto-blame", "settings.get", {});
						setEnabled(result.ok ? result.value.enabled : true);
						if (!result.ok) setError(result.error.message);
					} catch (err) {
						setEnabled(true);
						setError(err instanceof Error ? err.message : String(err));
					} finally {
						setLoading(false);
					}
				})();
			}, [rpc]);
			const toggle = async () => {
				if (enabled === void 0 || writing) return;
				const next = !enabled;
				setWriting(true);
				setError(void 0);
				try {
					const result = await rpc.call("/auto-blame", "settings.set", { enabled: next });
					if (result.ok) setEnabled(result.value.enabled);
					else setError(result.error.message);
				} catch (err) {
					setError(err instanceof Error ? err.message : String(err));
				} finally {
					setWriting(false);
				}
			};
			if (loading) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				style: sectionStyle,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: loadingStyle,
					children: "…"
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: sectionStyle,
				children: [
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: errorStyle,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: labelStyle,
							children: t("settings.enabled.label")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: blurbStyle,
							children: t("settings.enabled.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							on: enabled === true,
							label: t("settings.enabled.label"),
							onToggle: () => void toggle(),
							disabled: writing
						})]
					}),
					enabled === false && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: noteStyle,
						children: t("settings.disabled.note")
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** The locale namespace name; matches the `locale: NS` passed at slot register. */
		const NS = "dsh-auto-blame";
		/** English dictionary. */
		const en = {
			title: "Leadership view",
			send: "Click to send",
			empty: "No suggestions for this turn",
			"settings.nav": "Auto-blame",
			"settings.enabled.label": "Enable auto-blame",
			"settings.enabled.description": "Show cynical follow-up suggestion bubbles above the composer after each turn",
			"settings.disabled.note": "Disabled. The host skips the LLM call entirely — no token cost, no bubbles. Re-enable to resume."
		};
		/** Chinese dictionary. */
		const zh = {
			title: "领导视野",
			send: "点击直接发送",
			empty: "这一轮没有建议",
			"settings.nav": "Auto-blame 自动问责",
			"settings.enabled.label": "启用自动问责",
			"settings.enabled.description": "每轮结束后在输入框上方显示三条「领导视野」跟进建议气泡",
			"settings.disabled.note": "已关闭。宿主侧不会再发起 LLM 调用——零 token 消耗、无气泡。重新打开即可恢复。"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required services: slots + locale + connection (for the settings RPC). */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Client plugin body: register the suggestion bubbles in the composer dock
		* and the master toggle in the settings dialog.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-auto-blame: dictionaries");
			const connection = ctx.connection;
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "dsh-auto-blame",
				order: 60,
				locale: NS
			}, SuggestionBubbles));
			const settingsInjected = () => ({ rpc: connection.rpc });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-auto-blame",
				order: 70,
				label: () => ctx.locale.bind(NS)("settings.nav"),
				locale: NS,
				inject: settingsInjected
			}, AutoBlameSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
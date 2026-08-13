/**
 * Pure types of the auto-blame domain: the ONE home of the
 * `auto-blame/generating` and `auto-blame/suggestions` session-event payloads
 * and the `autoBlame` projection-key declaration, free of this package's
 * host-side value imports.
 *
 * @module @huanlin/dsh-plugin-auto-blame/types
 */

/** One cynical follow-up prompt the LLM produced for the just-closed turn. */
export type BlameSuggestion = string

/**
 * The plugin's user-facing settings, persisted through the settings seam
 * under the `auto-blame` namespace in `$DSH_HOME/settings.yaml`. The host
 * reads `enabled` on every `agent/turn-stopping` and skips the LLM call
 * entirely when false — no token cost, no projection event, no bubbles.
 */
export interface AutoBlameSettings {
  /**
   * Master switch. When false, the turn-stopping listener returns immediately
   * without calling the LLM; the projection stays null and the bubbles never
   * render. Defaults to true (a freshly installed plugin runs).
   */
  enabled: boolean
}

/** The payload of an `auto-blame/generating` session event (signals loading). */
export interface AutoBlameGeneratingPayload {
  /** The turn the suggestions are being generated for. */
  turn: number
}

/** The payload of an `auto-blame/suggestions` session event (whole value). */
export interface AutoBlameSuggestionsPayload {
  /** The turn the suggestions were generated for. */
  turn: number
  /** Exactly three cynical follow-up prompts, in the order the LLM produced them. */
  suggestions: BlameSuggestion[]
}

/**
 * The projection value: the latest generation state, or null before the first
 * generation. `generating: true` while the LLM call is in-flight; `generating:
 * false` once the suggestions (or an empty failure-clearing list) land.
 */
export interface AutoBlameState {
  /** The turn the generation is for. */
  turn: number
  /** True while the LLM call is running; false once results land. */
  generating: boolean
  /** The three suggestions (empty while generating or on failure). */
  suggestions: BlameSuggestion[]
}

/** The projection value: the latest state, or null before the first generation. */
export type AutoBlameProjection = AutoBlameState | null

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /**
     * Signals that the host has started the LLM call to generate suggestions
     * for the just-closed turn. Non-surface event. The projection folds it
     * into a `generating: true` state so the client can show a loading
     * indicator.
     *
     * @mode append
     */
    'auto-blame/generating': AutoBlameGeneratingPayload

    /**
     * Three LLM-generated cynical follow-up prompts for the just-closed turn.
     * Non-surface event: it never enters the model-visible history, so it
     * cannot perturb the agent loop. The projection unit folds it into the
     * `autoBlame` cell; clients render it as click-to-send bubbles. An empty
     * suggestions array clears the loading state (generation failed).
     *
     * @mode append
     */
    'auto-blame/suggestions': AutoBlameSuggestionsPayload
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * The latest auto-blame state for the session, or `null` before the
     * first generation. The state carries a `generating` flag so the client
     * can show a shimmer placeholder while the LLM call is in-flight.
     */
    autoBlame: AutoBlameProjection
  }
}

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
 * @module @huanlin/dsh-plugin-auto-blame/client/AutoBlameSection
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsResponse } from '../rpc.ts'

/** Inject face: RPC handle for the `/auto-blame` channel. */
export interface AutoBlameSectionInjected {
  readonly rpc: ClientConnectionRpc
}

/** Full props: settings.section runtime share + locale seat + inject. */
type AutoBlameSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'dsh-auto-blame'> & AutoBlameSectionInjected

type SettingsGetResult = RpcResult<SettingsResponse>
type SettingsSetResult = RpcResult<SettingsResponse>

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 24,
  padding: '14px 0',
  borderTop: '1px solid rgba(128, 128, 128, 0.22)',
}

const labelStyle: CSSProperties = { fontSize: 15, lineHeight: 1.4 }

const blurbStyle: CSSProperties = { fontSize: 13, lineHeight: 1.5, opacity: 0.55, marginTop: 2 }

const noteStyle: CSSProperties = {
  marginTop: 14,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(128, 128, 128, 0.12)',
  fontSize: 13,
  lineHeight: 1.6,
  opacity: 0.8,
}

const loadingStyle: CSSProperties = { fontSize: 13, opacity: 0.55, padding: '14px 0' }

const errorStyle: CSSProperties = {
  fontSize: 13,
  opacity: 0.7,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(192, 64, 64, 0.12)',
  marginBottom: 8,
}

/** A pill switch, same shape as dsh-anti-ads's section uses. */
function Toggle({ on, label, onToggle, disabled }: {
  readonly on: boolean
  readonly label: string
  readonly onToggle: () => void
  readonly disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      style={{
        flex: '0 0 auto',
        position: 'relative',
        width: 44,
        height: 26,
        padding: 0,
        border: 0,
        borderRadius: 13,
        background: on ? '#2f6fed' : 'rgba(128, 128, 128, 0.35)',
        transition: 'background 160ms ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  )
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
export function AutoBlameSection({ rpc, t }: AutoBlameSectionProps) {
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(undefined)
      try {
        const result = await rpc.call('/auto-blame', 'settings.get', {}) as SettingsGetResult
        setEnabled(result.ok ? result.value.enabled : true)
        if (!result.ok) setError(result.error.message)
      } catch (err) {
        // Network/transport failure: fall back to enabled=true so the page
        // still renders and the user can retry toggling.
        setEnabled(true)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [rpc])

  const toggle = async (): Promise<void> => {
    if (enabled === undefined || writing) return
    const next = !enabled
    setWriting(true)
    setError(undefined)
    try {
      const result = await rpc.call('/auto-blame', 'settings.set', { enabled: next }) as SettingsSetResult
      if (result.ok) {
        setEnabled(result.value.enabled)
      } else {
        setError(result.error.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWriting(false)
    }
  }

  if (loading) {
    return (
      <section style={sectionStyle}>
        <div style={loadingStyle}>…</div>
      </section>
    )
  }

  return (
    <section style={sectionStyle}>
      {error !== undefined && <div style={errorStyle}>{error}</div>}
      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>{t('settings.enabled.label')}</div>
          <div style={blurbStyle}>{t('settings.enabled.description')}</div>
        </div>
        <Toggle
          on={enabled === true}
          label={t('settings.enabled.label')}
          onToggle={() => void toggle()}
          disabled={writing}
        />
      </div>
      {enabled === false && (
        <div style={noteStyle}>{t('settings.disabled.note')}</div>
      )}
    </section>
  )
}

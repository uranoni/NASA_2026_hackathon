import { useEffect, useState, type ReactNode } from 'react'
import type { Level } from '../../lib/assessment'
import { MAX_SNAPSHOTS, SNAPSHOT_EVERY_MS, type Records } from '../../lib/records'

type Props = {
  records: Records
  saveOk: boolean
  onSaveNow: () => void
  onClear: () => void
  onClose: () => void
}

const LV_COLOR: Record<Level | 'info', string> = {
  ok: 'text-cyan-100',
  info: 'text-cyan-100',
  warn: 'text-[#ffd23f]',
  bad: 'text-[#ff2a55]',
}
const LV_TEXT: Record<Level, string> = { ok: 'OK', warn: 'CAUTION', bad: 'WARNING' }
const ENV_SHORT = { iss: 'ISS', transit: 'TRANSIT', moon: 'MOON', mars: 'MARS', ground: 'GROUND' } as const
/** 顯示最近幾筆（全部都有存，只是畫面不列太多） */
const SHOW = 30

/** 紀錄面板：看最近的快照、立即存一筆、清除（要再按一次確認，[V2 10080] 無法復原的動作要確認） */
export function RecordsPanel({ records, saveOk, onSaveNow, onClear, onClose }: Props) {
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const snaps = records.snapshots
  const recent = snaps.slice(-SHOW).reverse()
  const tm = (iso: string) => new Date(iso).toLocaleString('en-GB', { hour12: false })
  const sizeKb = (() => {
    try {
      return (JSON.stringify(records).length / 1024).toFixed(1)
    } catch {
      return '—'
    }
  })()
  const vitColor = (lv: Level | 'info' | undefined) => LV_COLOR[lv ?? 'ok']

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="records-title"
        className="hud-glass hud-corner relative flex max-h-[85vh] w-[min(760px,94vw)] flex-col p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="records-title" className="text-[11px] tracking-[0.3em] text-cyan-300" style={{ fontFamily: 'var(--font-display)' }}>
              RECORDS
            </p>
            <p className="mt-1 text-[11px] text-cyan-100/60">
              {snaps.length} snapshots
              {snaps.length > 0 && ` · ${tm(snaps[0].t)} → ${tm(snaps[snaps.length - 1].t)}`} · {sizeKb} KB
            </p>
            <p className="text-[10px] text-cyan-200/45">
              Saved in this browser only (localStorage). Saves one on first open (when there are no records yet), then every {SNAPSHOT_EVERY_MS / 60000} min; keeps the latest{' '}
              {MAX_SNAPSHOTS}. Mission settings are saved too.
            </p>
            {!saveOk && (
              <p className="mt-1 text-[11px] text-[#ff2a55]">■ Could not save to this browser (storage full or blocked). See console for details.</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm border border-cyan-400/35 px-3 py-1.5 text-[10px] tracking-[0.2em] text-cyan-100/85 hover:bg-cyan-400/10"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            CLOSE
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto border border-cyan-400/15">
          {recent.length === 0 ? (
            <p className="p-3 text-xs text-cyan-100/70">No snapshots yet. Press SAVE NOW, or wait 1 minute.</p>
          ) : (
            <table className="w-full text-left text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
              <thead className="sticky top-0 bg-[#020617] text-[10px] tracking-wider text-cyan-300/70">
                <tr>
                  {['TIME', 'DAY · LOC', 'HR', 'BP', 'SpO₂', 'TEMP', 'SLEEP', 'STATUS', 'CABIN CO₂'].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.t} className="border-t border-cyan-400/10 text-cyan-100/85">
                    <td className="whitespace-nowrap px-2 py-1">{tm(s.t)}</td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {s.ctx.day} · {ENV_SHORT[s.ctx.env]}
                    </td>
                    <td className={`px-2 py-1 ${vitColor(s.status.vit.hr)}`}>{s.vitals.hr}</td>
                    <td className={`whitespace-nowrap px-2 py-1 ${vitColor(s.status.vit.bp)}`}>
                      {s.vitals.sbp}/{s.vitals.dbp}
                    </td>
                    <td className={`px-2 py-1 ${vitColor(s.status.vit.spo2)}`}>{s.vitals.spo2}</td>
                    <td className={`px-2 py-1 ${vitColor(s.status.vit.temp)}`}>{s.vitals.temp.toFixed(1)}</td>
                    <td className={`px-2 py-1 ${vitColor(s.status.vit.sleep)}`}>{s.vitals.sleep}</td>
                    <td className={`whitespace-nowrap px-2 py-1 ${LV_COLOR[s.status.overall]}`}>
                      {LV_TEXT[s.status.overall]}
                      {s.emergency && ' (SIM)'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {s.cabin?.values.co2 != null ? `${s.cabin.values.co2}${s.cabin.stale ? ' (stale)' : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {snaps.length > SHOW && <p className="mt-1 text-[10px] text-cyan-200/45">Showing the latest {SHOW} of {snaps.length}.</p>}

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <PanelButton onClick={onSaveNow}>SAVE NOW</PanelButton>
          {confirmClear ? (
            <>
              <span className="text-[11px] text-[#ff2a55]">Delete all {snaps.length} snapshots? This cannot be undone.</span>
              <PanelButton
                danger
                onClick={() => {
                  onClear()
                  setConfirmClear(false)
                }}
              >
                YES, DELETE
              </PanelButton>
              <PanelButton onClick={() => setConfirmClear(false)}>CANCEL</PanelButton>
            </>
          ) : (
            <PanelButton danger onClick={() => setConfirmClear(true)} disabled={snaps.length === 0}>
              CLEAR SNAPSHOTS
            </PanelButton>
          )}
        </div>
      </div>
    </div>
  )
}

function PanelButton({
  onClick,
  danger,
  disabled,
  children,
}: {
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-sm border px-3 py-1.5 text-[10px] tracking-[0.2em] transition disabled:opacity-40 ${
        danger ? 'border-[#ff2a55]/50 text-[#ff6b8a] hover:bg-[#ff2a55]/15' : 'border-cyan-400/35 text-cyan-100/85 hover:bg-cyan-400/10'
      }`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </button>
  )
}

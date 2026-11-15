import { useEffect, useState } from 'react'
import { EXERCISE_WHY, PLANS, WEEKLY_TARGET, type PlanId, type WeekStatus } from '../../lib/exercise'

type Props = {
  week: WeekStatus
  /** 開啟時顯示哪份課表；prefill＝從「建議」按鈕進來，先把整份課表勾好，按一下就能完成（gemini 檔的一鍵帶入） */
  initialPlan: PlanId
  prefill: boolean
  /** 今天已回報時，回報過的項目（打開時照實勾好、唯讀；要重做請用左上的 RESET TODAY） */
  reportedItems: string[] | null
  lastAt: string | null
  onReport: (plan: PlanId, itemIds: string[]) => void
  onClose: () => void
}

/**
 * 本日訓練（SOP 檢查表樣式）：A／B 日輪替（示範課表），清單只是提示，不必全部做完；勾選做了的項目後回報。
 * 回報後寫入今日打卡 exercise_done = true，並放進傳回地面的 FHIR 佇列（由呼叫端處理）。
 */
export function ExerciseDialog({ week, initialPlan, prefill, reportedItems, lastAt, onReport, onClose }: Props) {
  const readOnly = week.todayDone && reportedItems != null
  // 預設顯示建議的課表；可以手動切換
  const [plan, setPlan] = useState<PlanId>(initialPlan)
  const [checked, setChecked] = useState<string[]>(() =>
    readOnly ? reportedItems! : prefill ? PLANS[initialPlan].items.map((it) => it.id) : [],
  )
  const items = PLANS[plan].items

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: string) => {
    if (readOnly) return
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }
  const switchPlan = (p: PlanId) => {
    if (readOnly) return
    setPlan(p)
    setChecked([])
  }
  const doneIds = checked.filter((id) => items.some((it) => it.id === id))

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-title"
        className="hud-glass hud-corner relative flex max-h-[88vh] w-[min(480px,94vw)] flex-col p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="exercise-title" className="text-[11px] tracking-[0.3em] text-cyan-300" style={{ fontFamily: 'var(--font-display)' }}>
              SOP // DAILY EXERCISE COUNTERMEASURE
            </p>
            <p className={`mt-1 text-[11px] ${week.warn ? 'text-[#ffd23f]' : 'text-cyan-100/70'}`}>
              {week.warn ? '▲' : '●'} This week {week.sessions}/{WEEKLY_TARGET} sessions
              {week.todayDone && lastAt
                ? ` · today reported ${new Date(lastAt).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}`
                : week.warn
                  ? ' · rest day already used'
                  : ' · today can be your rest day'}
            </p>
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

        {/* A／B 日切換：預設是輪到的那一份 */}
        <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Training plan">
          {(['A', 'B'] as PlanId[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={plan === p}
              onClick={() => switchPlan(p)}
              disabled={readOnly && plan !== p}
              className={`rounded-sm border px-2 py-1.5 text-[10px] tracking-wider transition ${
                plan === p ? 'border-cyan-300 bg-cyan-400/15 text-cyan-50' : 'border-cyan-400/25 text-cyan-100/70 hover:bg-cyan-400/10'
              }`}
            >
              {PLANS[p].title.toUpperCase()}
              {week.nextPlan === p && !week.todayDone && <span className="ml-1 text-cyan-300/80">· SUGGESTED</span>}
            </button>
          ))}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          <ol className="space-y-1.5">
            {items.map((it, i) => {
              const on = checked.includes(it.id)
              return (
                <li key={it.id}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-sm border px-3 py-2 transition ${
                      on ? 'border-cyan-300/70 bg-cyan-400/10' : 'border-cyan-400/20 hover:bg-cyan-400/5'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(it.id)}
                      disabled={readOnly}
                      className="mt-1 accent-cyan-400"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-cyan-50">
                        <span className="mr-1 text-[10px] text-cyan-300/60" style={{ fontFamily: 'var(--font-mono)' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {it.icon} {it.name}
                        <span className="ml-2 text-[10px] tracking-wider text-cyan-200/55">{it.device}</span>
                      </span>
                      <span className="block text-xs text-cyan-100/75">{it.dose}</span>
                      <span className="block text-[10px] text-cyan-200/50">{it.why}</span>
                    </span>
                    <span className="text-xs text-cyan-100/80" aria-hidden>
                      {on ? '✓' : ''}
                    </span>
                  </label>
                </li>
              )
            })}
          </ol>

          <details className="mt-3 border border-cyan-400/15 p-2">
            <summary className="cursor-pointer text-[10px] tracking-[0.2em] text-cyan-300/80">WHY</summary>
            <ul className="mt-1.5 space-y-1">
              {EXERCISE_WHY.map((w) => (
                <li key={w} className="text-[11px] leading-snug text-cyan-100/70">
                  {w}
                </li>
              ))}
            </ul>
          </details>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[10px] text-cyan-200/50">
            {doneIds.length}/{items.length} checked
            {readOnly ? ' · reported today (use RESET TODAY to redo)' : doneIds.length === 0 && ' · check what you did'}
          </p>
          <button
            type="button"
            disabled={readOnly || doneIds.length === 0}
            onClick={() => onReport(plan, doneIds)}
            className="rounded-sm border border-cyan-300 bg-cyan-400/15 px-3 py-1.5 text-[11px] tracking-[0.15em] text-cyan-50 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:border-cyan-400/25 disabled:bg-transparent disabled:text-cyan-100/40"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {readOnly ? '✓ REPORTED TODAY' : '✅ COMPLETE TODAY’S TRAINING'}
          </button>
        </div>
      </div>
    </div>
  )
}

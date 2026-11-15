import { useEffect, useState } from 'react'
import { EXERCISE_WHY, loadDraft, PLANS, saveDraft, WEEKLY_TARGET, type PlanId, type WeekStatus } from '../../lib/exercise'

type Props = {
  week: WeekStatus
  /** 開啟時顯示哪份課表（今天有勾選暫存時，改用暫存裡最後看的那份） */
  initialPlan: PlanId
  /** 今天已回報時，回報過的項目（打開時照實勾好、唯讀；要重做請用左上的 RESET TODAY） */
  reportedItems: string[] | null
  lastAt: string | null
  onReport: (plan: PlanId, itemIds: string[]) => void
  onClose: () => void
}

/**
 * 本日訓練（SOP 檢查表樣式）：A／B 日輪替（示範課表）。整份課表全部勾完才能完成（使用者要求）。
 * 勾選會暫存（見 exercise.ts loadDraft／saveDraft），關掉清單或重新整理都還在。
 * 回報後寫入今日打卡 exercise_done = true，並放進傳回地面的 FHIR 佇列（由呼叫端處理）。
 */
export function ExerciseDialog({ week, initialPlan, reportedItems, lastAt, onReport, onClose }: Props) {
  const readOnly = week.todayDone && reportedItems != null
  const [draft] = useState(() => (readOnly ? null : loadDraft()))
  const [plan, setPlan] = useState<PlanId>(() => draft?.plan ?? initialPlan)
  // A、B 各自記勾選；已回報時照實顯示回報的項目（唯讀）
  const [checkedBy, setCheckedBy] = useState<Record<PlanId, string[]>>(() => {
    if (readOnly) return { A: [], B: [], [plan]: reportedItems! }
    return draft?.checked ?? { A: [], B: [] }
  })
  const checked = checkedBy[plan]
  const items = PLANS[plan].items
  const update = (p: PlanId, next: Record<PlanId, string[]>) => {
    setPlan(p)
    setCheckedBy(next)
    saveDraft(p, next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: string) => {
    if (readOnly) return
    update(plan, { ...checkedBy, [plan]: checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id] })
  }
  const switchPlan = (p: PlanId) => {
    if (readOnly) return
    update(p, checkedBy)
  }
  const doneIds = checked.filter((id) => items.some((it) => it.id === id))
  const allDone = doneIds.length === items.length

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
            {readOnly
              ? ' · reported today (use RESET TODAY to redo)'
              : allDone
                ? ' · all done'
                : ` · check all ${items.length} to complete (saved)`}
          </p>
          <button
            type="button"
            disabled={readOnly || !allDone}
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

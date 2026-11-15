import { useState } from 'react'
import { PLANS, WEEKLY_TARGET, type WeekStatus } from '../../lib/exercise'

/**
 * 每日任務（左上，EVA 標題區塊下方）：列出今天要完成的任務與狀態。
 * 目前只有運動回報；之後的每日任務（例如睡眠自評）加在 tasks 陣列即可。
 * 狀態除了顏色也有符號與文字（[V2 10045]）。
 */
type Props = {
  week: WeekStatus
  onOpenExercise: () => void
  /** Demo：撤銷今天的回報（要再按一次確認，[V2 10080]） */
  onResetToday: () => void
}

export function DailyTasksPanel({ week, onOpenExercise, onResetToday }: Props) {
  const [confirmReset, setConfirmReset] = useState(false)
  // 三種狀態：今天已回報（完成）、今天可休息（未完成但不警告）、休息日已用掉（黃色警告）
  const tasks = [
    {
      id: 'exercise',
      icon: '🏋️',
      title: week.todayDone ? `Training · ${PLANS[week.nextPlan].title}` : `💡 Suggested: ${PLANS[week.nextPlan].title}`,
      done: week.todayDone,
      warn: week.warn,
      status: `This week ${week.sessions}/${WEEKLY_TARGET}${
        week.todayDone ? ' · reported today' : week.warn ? ' · rest day already used' : ' · today can be a rest day'
      }`,
      onOpen: onOpenExercise,
    },
  ]
  const doneCount = tasks.filter((t) => t.done).length

  return (
    <section className="hud-glass hud-corner relative w-[min(280px,92vw)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] tracking-[0.28em] text-cyan-300/80" style={{ fontFamily: 'var(--font-display)' }}>
          DAILY TASKS
        </p>
        <span className="text-[10px] tracking-wider text-cyan-200/55">
          {doneCount}/{tasks.length} done
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={t.onOpen}
              className={`w-full rounded-sm border px-3 py-2 text-left text-xs tracking-wide transition ${
                t.warn
                  ? 'border-[#ffd23f]/70 bg-[#ffd23f]/10 text-[#ffd23f] hover:bg-[#ffd23f]/20'
                  : 'border-cyan-400/35 text-cyan-100/85 hover:bg-cyan-400/10'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span>
                  {t.icon} {t.title}
                </span>
                <span className="text-[10px] opacity-80">{t.done ? '✓ DONE' : 'OPEN ›'}</span>
              </span>
              <span className="block text-[10px] opacity-80">
                {t.warn ? '▲' : '●'} {t.status}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Demo 用：撤銷今天的回報，重看「未完成」的狀態 */}
      {week.todayDone && (
        <div className="mt-2 flex items-center justify-end gap-2 text-[10px]">
          {confirmReset ? (
            <>
              <span className="text-cyan-100/70">Undo today’s report?</span>
              <button
                type="button"
                onClick={() => {
                  onResetToday()
                  setConfirmReset(false)
                }}
                className="rounded-sm border border-[#ff2a55]/50 px-2 py-0.5 tracking-wider text-[#ff6b8a] hover:bg-[#ff2a55]/15"
              >
                YES, RESET
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-sm border border-cyan-400/30 px-2 py-0.5 tracking-wider text-cyan-100/75 hover:bg-cyan-400/10"
              >
                CANCEL
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="rounded-sm border border-cyan-400/25 px-2 py-0.5 tracking-wider text-cyan-200/60 hover:bg-cyan-400/10"
            >
              ↺ RESET TODAY (DEMO)
            </button>
          )}
        </div>
      )}
    </section>
  )
}

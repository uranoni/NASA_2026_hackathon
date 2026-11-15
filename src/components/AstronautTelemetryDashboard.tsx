import { useEffect, useMemo, useRef, useState } from 'react'
import { useCabinTelemetry } from '../hooks/useCabinTelemetry'
import { useRecords } from '../hooks/useRecords'
import { useTelemetry } from '../hooks/useTelemetry'
import { evalEnv, evaluate, REGION_NAME, type Context, type Region } from '../lib/assessment'
import { exerciseObservation, weekStatus, type PlanId } from '../lib/exercise'
import { sleepObservation } from '../lib/sleep'
import { dayKey, lastExerciseAt, makeSnapshot, SNAPSHOT_EVERY_MS } from '../lib/records'
import { DailyTasksPanel } from './hud/DailyTasksPanel'
import { ExerciseDialog } from './hud/ExerciseDialog'
import type { OrganId, TelemetrySource } from '../types/telemetry'
import { CabinPanel } from './hud/CabinPanel'
import { RecordsPanel } from './hud/RecordsPanel'
import { RightPanel } from './hud/RightPanel'
import { TelemetryScene } from './scene/TelemetryScene'

type Props = {
  /** 預留：傳入真實 WebSocket / MQTT 遙測來源 */
  telemetrySource?: TelemetrySource
}

/**
 * 太空人即時生理數據 3D 監控儀表板
 * 視覺參考：J.A.R.V.I.S. 全息投影 HUD
 *
 * 3D 人體：public/models/astronaut-body.glb（CC0 Human Muscles）+ 全息掃描材質
 */
export default function AstronautTelemetryDashboard({ telemetrySource }: Props) {
  const { data, setEmergency } = useTelemetry(telemetrySource)
  const [selected, setSelected] = useState<OrganId | null>('heart')
  const [scanEnabled, setScanEnabled] = useState(true)
  const [resetToken, setResetToken] = useState(0)

  const cabin = useCabinTelemetry()
  /** 紀錄（localStorage）：任務設定、生命徵象與艙內快照；見 src/lib/records.ts */
  const rec = useRecords()
  const [recordsOpen, setRecordsOpen] = useState(false)
  /** 訓練清單：null＝關閉；plan＝開哪份（勾選由清單自己暫存，不再預先勾好） */
  const [exerciseOpen, setExerciseOpen] = useState<null | { plan: PlanId }>(null)
  // 運動回報：每週 6 天規則（每分鐘重算一次，跨過午夜會自動換日）
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const lastExercise = lastExerciseAt(rec.records)
  const week = useMemo(() => weekStatus(rec.records.checkins, new Date(nowTick)), [rec.records.checkins, nowTick])
  const exerciseDone = !week.warn
  /** 今天的睡眠自評 */
  const sleepMood = rec.records.checkins[dayKey(new Date(nowTick))]?.sleep ?? null
  /** 任務第幾天、所在環境（新版設定頁）：會改變體溫、血壓的判斷範圍 */
  const settings = rec.records.settings
  /** 左下角艙內資料選單：none＝艙內數值收起；iss＝ISS 艙內遙測 */
  const env = settings.cabin

  /**
   * 判斷邏輯移植自新版 iss_demo(1).html（src/lib/assessment.ts）。repo 沒有手動輸入，只把遙測裡有的數值填進去：
   * 心率、血壓、血氧、體溫、睡眠。
   * 新版沒有輻射判斷；肌肉疲勞、情緒沒有公開門檻（新版只記錄、不亮燈），而且 repo 的單位（0–100）和新版量表不同，所以不填。
   * 作業模式暫用新版預設「一般作業」（之後的步驟再加選單）。
   */
  const ctx: Context = useMemo(() => ({ day: settings.day, env: settings.env, act: 'work' }), [settings.day, settings.env])
  const assessment = useMemo(
    () =>
      evaluate(ctx, {
        hr: data.heartRate,
        sbp: data.bloodPressureSys,
        dbp: data.bloodPressureDia,
        spo2: data.spo2,
        temp: data.coreTemp,
        sleep: data.sleepHours,
        exercise_done: exerciseDone,
        exercise_week: week.sessions,
        sleep_quality: sleepMood ?? undefined,
        exercise_suggest: week.nextPlan,
        exercise_doneA: week.doneA,
        exercise_doneB: week.doneB,
      }),
    [ctx, data, exerciseDone, week.sessions, week.nextPlan, week.doneA, week.doneB, sleepMood],
  )
  // 艙內環境：只給左下角面板顯示，不影響人體燈號（新版原則）
  const cabinEval = useMemo(
    () => (env === 'iss' ? evalEnv(cabin.readings(), ctx.act) : { cards: [], advice: [] }),
    [cabin.readings, env, ctx.act],
  )

  // 快照：生命徵象＋判斷結果＋艙內環境（CABIN DATA 選 ISS 時才附上）。用 ref 取最新值，計時器不必重設
  const takeSnapshot = () =>
    makeSnapshot(
      ctx,
      {
        hr: data.heartRate,
        sbp: data.bloodPressureSys,
        dbp: data.bloodPressureDia,
        spo2: data.spo2,
        temp: data.coreTemp,
        sleep: data.sleepHours,
      },
      assessment,
      env === 'iss' ? cabinEval.cards : null,
      cabin.status.signal === false,
      data.emergency,
    )
  const snapRef = useRef(takeSnapshot)
  snapRef.current = takeSnapshot
  const { add: addSnapshot } = rec
  // 瀏覽器裡還沒有任何快照時，打開頁面就先存一筆（使用者要求）；之後每 SNAPSHOT_EVERY_MS 一筆。
  // 載入當下有沒有快照只看一次（firstOpen）；開發模式 StrictMode 會把 effect 跑兩次，ref 在兩次之間保留，所以不會存兩筆
  const firstOpen = useRef(rec.records.snapshots.length === 0)
  useEffect(() => {
    if (firstOpen.current) {
      firstOpen.current = false
      addSnapshot(snapRef.current())
      console.log('[records]', '瀏覽器裡還沒有紀錄，已存第一筆快照（ISS 艙內資料通常還沒收到，這筆多半沒有艙內數值）')
    }
    const id = window.setInterval(() => addSnapshot(snapRef.current()), SNAPSHOT_EVERY_MS)
    return () => window.clearInterval(id)
  }, [addSnapshot])

  const badRegions = (Object.keys(assessment.level) as Region[]).filter((k) => assessment.level[k] === 'bad')
  const alertActive = data.emergency || assessment.overall === 'bad'

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020617]">
      {/* 背景氛圍 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse at 50% 20%, rgba(0, 80, 120, 0.28), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(0, 40, 90, 0.2), transparent 40%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,240,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.35) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />

      {/* 3D 場景 */}
      <div className="absolute inset-0">
        <TelemetryScene
          heartRate={data.heartRate}
          spo2={data.spo2}
          respRate={data.respRate}
          muscleFatigue={data.muscleFatigue}
          selected={selected}
          onSelect={setSelected}
          scanEnabled={scanEnabled}
          emergency={data.emergency}
          resetToken={resetToken}
          levels={assessment.level}
          limbParts={assessment.limbParts}
          alert={alertActive}
        />
      </div>

      {/* 左上：任務代號 + 連線狀態，下方是每日任務 */}
      <header className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-3 md:left-6 md:top-6">
        <div className="hud-glass hud-corner relative px-4 py-3">
          <p
            className="text-[11px] tracking-[0.32em] text-cyan-300"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {data.missionCode} // {data.crewId}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] tracking-[0.18em] text-cyan-100/80">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                data.connected ? 'status-live bg-emerald-400' : 'bg-rose-500'
              }`}
            />
            <span>{data.connected ? 'LINK ACTIVE // SUIT BUS' : 'LINK LOST'}</span>
          </div>
          <p className="mt-1 text-[10px] tracking-widest text-cyan-200/45">
            NASA HRP · SELF-ASSESSMENT HUD
          </p>
        </div>
        <div className="pointer-events-auto">
          <DailyTasksPanel
            week={week}
            onOpenExercise={() => setExerciseOpen({ plan: week.nextPlan })}
            sleepMood={sleepMood}
            onSleep={(mood) => {
              const now = new Date()
              rec.sleep(mood, sleepObservation(now, ctx, mood))
              setNowTick(now.getTime())
            }}
            onResetToday={rec.resetToday}
          />
        </div>
      </header>

      {/* 右側詳細面板 */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20 max-h-[calc(100%-7.5rem)] overflow-y-auto md:right-6 md:top-6">
        <RightPanel
          data={data}
          selected={selected}
          assessment={assessment}
          ctx={ctx}
        />
      </div>

      {/* 左下：艙內環境（ISS 即時遙測）；手機寬度時往上移，避開底部控制列 */}
      <div className="pointer-events-auto absolute bottom-24 left-4 z-20 md:bottom-6 md:left-6">
        <CabinPanel
          day={settings.day}
          onDay={(day) => rec.updateSettings({ day })}
          missionEnv={settings.env}
          onMissionEnv={(e) => rec.updateSettings({ env: e })}
          env={env}
          onEnv={(e) => {
            console.log('[ISS cabin]', '環境選單切換為：' + e)
            rec.updateSettings({ cabin: e })
          }}
          cards={cabinEval.cards}
          status={cabin.status}
        />
      </div>

      {/* 底部控制列 */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 md:p-5">
        <div className="pointer-events-auto hud-glass hud-corner relative flex flex-wrap items-center justify-center gap-2 px-3 py-2.5 md:gap-3 md:px-4">
          <ControlButton label={`RECORDS (${rec.records.snapshots.length})`} onClick={() => setRecordsOpen(true)} />
          <ControlButton
            label="RESET VIEW"
            onClick={() => {
              setSelected(null)
              setResetToken((n) => n + 1)
            }}
          />
          <ControlButton
            label={scanEnabled ? 'SCAN LINE: ON' : 'SCAN LINE: OFF'}
            active={scanEnabled}
            onClick={() => setScanEnabled((v) => !v)}
          />
          <ControlButton
            label={data.emergency ? 'CLEAR EMERGENCY' : 'SIMULATE EMERGENCY'}
            danger
            active={data.emergency}
            onClick={() => setEmergency(!data.emergency)}
          />
        </div>
      </footer>

      {exerciseOpen && (
        <ExerciseDialog
          key={exerciseOpen.plan}
          week={week}
          initialPlan={exerciseOpen.plan}
          reportedItems={rec.records.checkins[dayKey(new Date(nowTick))]?.exercise_items ?? null}
          lastAt={lastExercise}
          onReport={(plan, items) => {
            const now = new Date()
            rec.report(plan, items, exerciseObservation(now, ctx, plan, items))
            setNowTick(now.getTime())
            setExerciseOpen(null)
          }}
          onClose={() => setExerciseOpen(null)}
        />
      )}

      {recordsOpen && (
        <RecordsPanel
          records={rec.records}
          saveOk={rec.saveOk}
          onSaveNow={() => rec.add(snapRef.current())}
          onClear={rec.clear}
          onClose={() => setRecordsOpen(false)}
        />
      )}

      {/* 緊急狀態全畫面提示 */}
      {alertActive && (
        <div className="pointer-events-none absolute left-1/2 top-[4.8rem] z-20 -translate-x-1/2">
          <div className="border border-[#ff2a55]/70 bg-[#2a0610]/75 px-4 py-1.5 text-[11px] tracking-[0.28em] text-[#ff2a55] backdrop-blur-md">
            {badRegions.length
              ? `WARNING // ${badRegions.map((k) => REGION_NAME[k]).join(' · ')}`
              : data.emergency
                ? `SIMULATED EMERGENCY // HR ${data.heartRate.toFixed(0)} BPM`
                : 'WARNING // ACTION NEEDED'}
          </div>
        </div>
      )}
    </div>
  )
}

function ControlButton({
  label,
  onClick,
  active,
  danger,
}: {
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
}) {
  const tone = danger
    ? active
      ? 'border-[#ff2a55] bg-[#ff2a55]/20 text-[#ff8aa5]'
      : 'border-[#ff2a55]/45 text-[#ff6b8a] hover:bg-[#ff2a55]/15'
    : active
      ? 'border-cyan-300 bg-cyan-400/15 text-cyan-50'
      : 'border-cyan-400/35 text-cyan-100/85 hover:bg-cyan-400/10'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-3 py-2 text-[10px] tracking-[0.2em] transition md:text-[11px] ${tone}`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {label}
    </button>
  )
}

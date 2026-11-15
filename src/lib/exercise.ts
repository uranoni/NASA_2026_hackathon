/**
 * NASA 實證運動防禦與回報模組（使用者提供的需求 prompt，2026-11-15；之後依補充說明改成「每週 6 天＋A／B 日輪替」）
 *
 * 依據（等級標示見各段）：
 * - NASA/SP-20250000273 第 12 頁、表 5（原文摘錄見 message-sport.txt）：
 *   「recommended 2.5 hours a day/6 days a week of exercise with 30-60 minutes of resistive training and
 *    average 27 minutes of metabolic/aerobic training, with the remaining time allocated for crew setup and cleanup」
 *   有氧：「Based on a pre-flight VO2peak of 70-100%」，用 CEVIS、T2；阻力用 ARED
 * - OCHMO-TB-031 Exercise Overview（2026-11-15 讀取頁面原文確認）：太空飛行造成有氧能力、肌力、骨強度下降；
 *   運動也用於「orthostatic intolerance and immune and sensorimotor functioning」；有「Fitness for Duty/Performance Requirements」一節
 *   ⚠ 「骨質每月流失 1–1.5%」只出現在抓取工具的摘要，頁面原文段落裡沒有讀到，**尚未查證**，畫面不放
 *
 * 判斷（Demo 自訂，使用者指定的「每週 6 天」做法）：
 * - 看最近 7 天（含今天）：每週可以休息 1 天
 * - 今天還沒回報，而且前 6 天已經有一天沒運動（休息日已用掉）→ 四肢、心臟、全身亮黃燈
 * - 沒有紀錄的日子算沒運動（沒有回報就無法證明有做）；所以第一次打開時，前 6 天都算沒運動，今天沒回報就會亮黃燈
 * - NASA 沒有「幾天沒運動」的臨床門檻，這是依排程推出的 Demo 規則
 *
 * 課表：A／B 日輪替是 **Demo 示範課表**（使用者補充說明提供）。SP-20250000273 只寫「上半身線性漸進、下半身波動式訓練量」，
 * 沒有寫上下肢分不同天；組數次數也不是 NASA 處方。
 */

export const WEEKLY_TARGET = 6
const DAYS_IN_WINDOW = 7

export type PlanId = 'A' | 'B'
export type ExerciseItem = { id: string; icon: string; name: string; dose: string; why: string; device: string }

const AEROBIC: ExerciseItem = {
  id: 'aerobic',
  icon: '🚴',
  name: 'Cycle / treadmill aerobic',
  // 心率目標改用原文說法（使用者要求）：原本的「70–85% max HR」的 85% 沒有出處
  dose: 'About 27 min (ISS average); intensity set at 70–100% of pre-flight VO₂peak',
  why: 'Cardiovascular fitness',
  device: 'CEVIS / T2',
}

/** 示範課表（Demo，不是 NASA 處方） */
export const PLANS: Record<PlanId, { title: string; items: ExerciseItem[] }> = {
  A: {
    title: 'Plan A · lower body & core',
    items: [
      { id: 'squat', icon: '🦿', name: 'Squats', dose: '3 sets × 8–12 reps (high load)', why: 'Lower-body strength and bone loading', device: 'ARED' },
      { id: 'deadlift', icon: '🏋️', name: 'Deadlifts', dose: '3 sets × 8–10 reps', why: 'Lower body, core and bone', device: 'ARED' },
      { id: 'heel', icon: '🦵', name: 'Heel raises', dose: '3 sets × 15 reps', why: 'Calf muscles', device: 'ARED' },
      AEROBIC,
    ],
  },
  B: {
    title: 'Plan B · upper body & cardio',
    items: [{ id: 'bench', icon: '🦾', name: 'Bench press', dose: '3 sets × 8–12 reps', why: 'Upper-body strength', device: 'ARED' }, AEROBIC],
  },
}

/** 每日打卡裡和運動有關的欄位（存在 records.checkins[yyyy-mm-dd]） */
type ExerciseCheckin = { exercise_done?: boolean; exercise_at?: string; exercise_plan?: PlanId }

/** 本地日期 yyyy-mm-dd（和 records.dayKey 相同規則） */
function key(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export type WeekStatus = {
  /** 最近 7 天（含今天）有運動的天數 */
  sessions: number
  todayDone: boolean
  /** 前 6 天裡沒運動的天數 */
  missedPast: number
  /** 今天沒回報，而且休息日已用掉 → 亮黃燈 */
  warn: boolean
  /** 今天該做哪一份課表：和最近一次回報的相反，沒有紀錄就從 A 開始 */
  nextPlan: PlanId
}

export function weekStatus(checkins: Record<string, ExerciseCheckin>, now = new Date()): WeekStatus {
  let sessions = 0,
    missedPast = 0
  const todayDone = checkins[key(now)]?.exercise_done === true
  for (let i = 0; i < DAYS_IN_WINDOW; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const done = checkins[key(d)]?.exercise_done === true
    if (done) sessions++
    else if (i > 0) missedPast++
  }
  // 最近一次回報用的課表
  let lastAt = '',
    lastPlan: PlanId | undefined
  for (const e of Object.values(checkins)) {
    if (e.exercise_done && e.exercise_at && e.exercise_at > lastAt) {
      lastAt = e.exercise_at
      lastPlan = e.exercise_plan
    }
  }
  // 今天已經做了，就顯示今天做的那份；否則輪到下一份
  const todayPlan = checkins[key(now)]?.exercise_plan
  const nextPlan: PlanId = todayDone && todayPlan ? todayPlan : lastPlan === 'A' ? 'B' : 'A'
  return { sessions, todayDone, missedPast, warn: !todayDone && missedPast >= DAYS_IN_WINDOW - WEEKLY_TARGET, nextPlan }
}

/** 「為什麼要做」說明（訓練清單的 WHY） */
export const EXERCISE_WHY = [
  'ISS plan: about 2.5 h a day, 6 days a week (including setup and cleanup), with 30–60 min resistive training (ARED) and an average 27 min aerobic training (CEVIS, T2) at 70–100% of pre-flight VO₂peak [NASA/SP-20250000273, Table 5]. One rest day a week is normal.',
  'Spaceflight lowers aerobic capacity, muscle strength and bone strength; exercise is also a countermeasure for orthostatic intolerance and immune and sensorimotor function [OCHMO-TB-031].',
  'NASA-STD-3001 Vol 1 targets: aerobic capacity ≥80% of pre-mission [V1 4003], muscle strength ≥80% of baseline [V1 4024], hip and spine bone density ≥95% [V1 4027] [OCHMO-TB-031].',
  'Plan A / Plan B rotation, sets and reps are a demo routine, not a NASA prescription; real sessions follow each crewmember’s plan. You do not need to finish every item: check what you did and report the session.',
]

const LOCAL = 'urn:spaceapps:astro-health'

/**
 * 把運動回報打包成 FHIR Observation（放進傳回地面的佇列）。
 * 代碼用本地代碼（沒有查證適合的 LOINC，避免亂用標準代碼）；格式參考新版 iss_demo(1).html 的 makeObs。
 */
export function exerciseObservation(when: Date, ctx: { day: number; env: string }, plan: PlanId, itemIds: string[]) {
  return {
    resourceType: 'Observation',
    id: `exercise-${when.getTime()}`,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'activity' }] }],
    code: { coding: [{ system: LOCAL, code: 'exercise-session-completed', display: 'Daily exercise countermeasure session' }] },
    subject: { reference: 'Patient/crew-self' },
    effectiveDateTime: when.toISOString(),
    valueBoolean: true,
    component: [
      { code: { coding: [{ system: LOCAL, code: 'exercise-plan', display: PLANS[plan].title }] }, valueString: plan },
      ...PLANS[plan].items.map((it) => ({
        code: { coding: [{ system: LOCAL, code: `exercise-${it.id}`, display: `${it.name} (${it.dose})` }] },
        valueBoolean: itemIds.includes(it.id),
      })),
    ],
    meta: { source: 'self-report' },
    extension: [
      { url: `${LOCAL}:mission-day`, valueInteger: ctx.day },
      { url: `${LOCAL}:environment`, valueCode: ctx.env },
    ],
  }
}
export type FhirObservation = ReturnType<typeof exerciseObservation>

/**
 * 資料進來之後（after data）
 *
 * 本系統不負責量測：資料由 NASA 既有管道（站上醫療設備、手腕活動記錄器、飲食紀錄、組員自評）
 * 以 HL7 FHIR R4 Observation 送進來。這個檔案定義：
 * - 接收的資料（Obs）與 FHIR Bundle 匯入（LOINC 代碼；沒有標準代碼的自評項目用本地代碼）
 * - 每類資料預期的送達頻率（依 ISS 實際做法，出處見 FEED_GROUPS 的 src）
 * - 資料中斷的判斷（該送卻沒送到）
 * - Demo 用的示範資料（依研究規律產生，畫面上一律標示為示範資料）
 */
import { ranges, TH, type MissionEnv } from './assessment'
import type { PlanId } from './exercise'

export type FeedKey =
  | 'sleep'
  | 'water'
  | 'mood'
  | 'fatigue'
  | 'symptoms'
  | 'exercise'
  | 'hr'
  | 'sbp'
  | 'dbp'
  | 'temp'
  | 'spo2'
  | 'glu'
  | 'k'

/** 一筆收到的資料。t＝量測時間（ms）、day＝任務第幾天 */
export type Obs = {
  key: FeedKey
  v: number
  t: number
  day: number
  /** symptoms：回報的症狀；exercise：課表 */
  tags?: Symptom[]
  plan?: PlanId
  source: 'demo' | 'import'
}

export const SYMPTOMS = ['irreg', 'palp', 'dizzy', 'head', 'naus', 'cantdx'] as const
export type Symptom = (typeof SYMPTOMS)[number]
export const SYMPTOM_NAME: Record<Symptom, string> = {
  irreg: 'Irregular heartbeat',
  palp: 'Palpitations',
  dizzy: 'Dizziness',
  head: 'Headache',
  naus: 'Nausea',
  cantdx: 'Cannot be diagnosed onboard',
}

export const FEED_NAME: Record<FeedKey, string> = {
  sleep: 'Sleep',
  water: 'Water intake',
  mood: 'Mood',
  fatigue: 'Fatigue',
  symptoms: 'Symptoms',
  exercise: 'Exercise',
  hr: 'Heart rate',
  sbp: 'Blood pressure',
  dbp: 'Blood pressure',
  temp: 'Body temperature',
  spo2: 'SpO₂',
  glu: 'Glucose',
  k: 'Potassium',
}

/**
 * 送達頻率分組（ISS 實際做法）：
 * - daily：睡眠由手腕活動記錄器全程記錄 [Standard Measures]；飲水由飲食紀錄程式記錄 [ESA EveryWear]
 * - self：組員自評，回報時才有
 * - pfe：心率、血壓在每月體能評估量，抵站約 14 天後第一次，之後每月 [ESA PFE]
 * - sick：體溫、血氧、血糖、血鉀在不舒服時用醫療包量（血糖、血鉀由組員醫療官用血液分析儀量）[CHeCS 2008]
 */
export type Cadence = 'daily' | 'self' | 'pfe' | 'sick'
export const FEED_GROUPS: { id: Cadence; name: string; keys: FeedKey[]; expect: string; src: string }[] = [
  { id: 'daily', name: 'Daily records', keys: ['sleep', 'water'], expect: 'Every day', src: 'Standard Measures; ESA EveryWear' },
  { id: 'self', name: 'Crew self-reports', keys: ['mood', 'fatigue', 'symptoms', 'exercise'], expect: 'When reported', src: 'Crew' },
  { id: 'pfe', name: 'Monthly fitness evaluation', keys: ['hr', 'sbp', 'dbp'], expect: 'Day 14, then every 30 days', src: 'ESA PFE' },
  { id: 'sick', name: 'When unwell (medical kit)', keys: ['temp', 'spo2', 'glu', 'k'], expect: 'Only when needed', src: 'CHeCS 2008' },
]

/** 每月體能評估（PFE）：ESA「抵站約 14 天後第一次，之後每月」→ 第 14 天起每 30 天 */
export const PFE = { first: 14, every: 30 }
export const lastPfeDay = (day: number) => (day < PFE.first ? null : PFE.first + Math.floor((day - PFE.first) / PFE.every) * PFE.every)
export const nextPfeDay = (day: number) => (day <= PFE.first ? PFE.first : PFE.first + Math.ceil((day - PFE.first) / PFE.every) * PFE.every)

export const DAY_MS = 86_400_000

export function latest(obs: Obs[], key: FeedKey): Obs | null {
  let best: Obs | null = null
  for (const o of obs) if (o.key === key && (!best || o.t > best.t)) best = o
  return best
}

/** 最近 days 天的資料（每天取最後一筆），由舊到新 */
export function series(obs: Obs[], key: FeedKey, days = 30, now = Date.now()): Obs[] {
  const byDay = new Map<number, Obs>()
  for (const o of obs) if (o.key === key && o.t >= now - days * DAY_MS) {
    const cur = byDay.get(o.day)
    if (!cur || o.t > cur.t) byDay.set(o.day, o)
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t)
}

/** 資料中斷：該送卻沒送到（不是健康問題，是資料管道問題） */
export type Gap = { key: FeedKey | 'pfe'; text: string; since: number | null }
export function dataGaps(obs: Obs[], day: number): Gap[] {
  const gaps: Gap[] = []
  for (const key of ['sleep', 'water'] as FeedKey[]) {
    if (!obs.some((o) => o.key === key && o.day === day)) {
      gaps.push({ key, text: `No ${FEED_NAME[key].toLowerCase()} data received today (expected daily)`, since: latest(obs, key)?.t ?? null })
    }
  }
  const pfe = lastPfeDay(day)
  if (pfe != null && !obs.some((o) => (o.key === 'hr' || o.key === 'sbp') && o.day >= pfe)) {
    gaps.push({ key: 'pfe', text: `Monthly fitness evaluation (day ${pfe}): heart rate and blood pressure not received`, since: latest(obs, 'hr')?.t ?? null })
  }
  return gaps
}

// ===================== 示範資料（依研究規律產生，皆為模擬） =====================
/**
 * 30 天示範資料：
 * - 睡眠：ISS 平均約 6.09 小時 [Barger 2014]；最近 4 天睡不好；今天的睡眠資料「還沒送到」（示範資料中斷）
 * - 飲水：每天約 2.4–3.3 L；今天到 13:00 只有 2,100 ml
 * - 生命徵象：只在每月體能評估日（第 14、44… 天）；長期任務血壓偏低 [Norsk 2015]
 * - 不舒服那天（今天往前 15 天）：回報噁心，用醫療包量了體溫、血氧、血糖、血鉀；體溫依任務天數上修 [Stahn 2017]
 * - 運動：每週休息 1 天（最近一次休息在 9 天前）
 */
export function demoFeed(day: number, env: MissionEnv, now = new Date()): Obs[] {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5
  const out: Obs[] = []
  const at = (i: number, h: number, m = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    d.setHours(h, m, 0, 0)
    return d.getTime()
  }
  const push = (key: FeedKey, v: number, i: number, h: number, m = 0, extra: Partial<Obs> = {}) => {
    const t = at(i, h, m)
    if (t <= now.getTime()) out.push({ key, v, t, day: day - i, source: 'demo', ...extra })
  }
  const sickI = 15
  for (let i = 29; i >= 0; i--) {
    const d = day - i
    if (d < 1) continue
    const R = ranges({ day: d, env })
    const dip = i <= 4
    if (i > 0) push('sleep', +(dip ? 4.6 + rnd() * 0.6 : Math.min(8.5, Math.max(4.5, TH.issSleep + rnd() * 2.4))).toFixed(1), i, 7, 10)
    if (i === 0) push('water', 2100, i, 13)
    else push('water', Math.round((2400 + rnd() * 900) / 100) * 100, i, 21)
    push('mood', dip ? 3 : rnd() > -0.3 ? 4 : 3, i, 7, 15)
    push('fatigue', dip ? 6 : rnd() > -0.3 ? 3 : 4, i, 7, 15)
    // 每週休息 1 天（第 9、16、23 天前）；今天的運動排在晚上，所以 18:00 前還沒有紀錄
    if (i % 7 !== 2 || i < 7) push('exercise', 1, i, 18, 0, { plan: d % 2 ? 'A' : 'B' })
    if (d >= PFE.first && (d - PFE.first) % PFE.every === 0) {
      push('hr', Math.round(64 + rnd() * 6), i, 10)
      push('sbp', Math.round(116 - R.bpOff + rnd() * 8), i, 10)
      push('dbp', Math.round(74 - R.dbpOff + rnd() * 6), i, 10)
    }
    if (i === sickI) {
      push('symptoms', 1, i, 9, 0, { tags: ['naus'] })
      push('temp', +(36.7 + R.tOff).toFixed(1), i, 9, 20)
      push('spo2', 97, i, 9, 20)
      push('glu', 92, i, 9, 40)
      push('k', 4.1, i, 9, 40)
    }
    if (i === 0) push('symptoms', 1, i, 9, 30, { tags: ['head'] })
  }
  return out.sort((a, b) => a.t - b.t)
}

// ===================== FHIR Bundle 匯入（資料進來的接口） =====================
const LOINC_MAP: Record<string, FeedKey> = {
  '8867-4': 'hr',
  '8310-5': 'temp',
  '59408-5': 'spo2',
  '2708-6': 'spo2',
  '2339-0': 'glu',
  '2345-7': 'glu',
  '41653-7': 'glu',
  '6298-4': 'k',
  '2823-3': 'k',
  '93832-4': 'sleep',
  '9000-1': 'water',
  '9007-6': 'water',
}
const LOCAL_MAP: Record<string, FeedKey> = {
  'mood-self-1-5': 'mood',
  'fatigue-samn-perelli-1-7': 'fatigue',
  'symptom-self-report': 'symptoms',
  'exercise-session-completed': 'exercise',
}
type Coding = { system?: string; code?: string }
type FhirObs = {
  resourceType?: string
  code?: { coding?: Coding[] }
  effectiveDateTime?: string
  valueQuantity?: { value?: number }
  valueBoolean?: boolean
  component?: { code?: { coding?: Coding[] }; valueQuantity?: { value?: number }; valueBoolean?: boolean; valueString?: string }[]
  extension?: { url?: string; valueInteger?: number }[]
}
const codes = (c?: { coding?: Coding[] }) => (c?.coding ?? []).map((x) => x.code ?? '')

/** 讀 FHIR Bundle（或 Observation 陣列、單一 Observation）；看不懂的資源略過，回傳略過的筆數 */
export function parseFhir(json: unknown, today: number, now = Date.now()): { obs: Obs[]; skipped: number } {
  const list: FhirObs[] = Array.isArray(json)
    ? (json as FhirObs[])
    : (json as { resourceType?: string; entry?: { resource?: FhirObs }[] })?.resourceType === 'Bundle'
      ? ((json as { entry?: { resource?: FhirObs }[] }).entry ?? []).map((e) => e.resource ?? {})
      : [json as FhirObs]
  const out: Obs[] = []
  let skipped = 0
  for (const r of list) {
    const t = Date.parse(r?.effectiveDateTime ?? '')
    if (r?.resourceType !== 'Observation' || Number.isNaN(t)) {
      skipped++
      continue
    }
    const dayExt = (r.extension ?? []).find((e) => (e.url ?? '').endsWith(':mission-day'))?.valueInteger
    const day = dayExt ?? today - Math.floor((now - t) / DAY_MS)
    const cs = codes(r.code)
    const base = { t, day, source: 'import' as const }
    if (cs.includes('85354-9')) {
      for (const c of r.component ?? []) {
        const cc = codes(c.code)
        const v = c.valueQuantity?.value
        if (v == null) continue
        if (cc.includes('8480-6')) out.push({ ...base, key: 'sbp', v })
        if (cc.includes('8462-4')) out.push({ ...base, key: 'dbp', v })
      }
      continue
    }
    const key = cs.map((c) => LOINC_MAP[c] ?? LOCAL_MAP[c]).find(Boolean)
    if (!key) {
      skipped++
      continue
    }
    if (key === 'symptoms') {
      const tags = (r.component ?? [])
        .filter((c) => c.valueBoolean)
        .map((c) => codes(c.code).map((x) => x.replace('symptom-', '')).find((x) => (SYMPTOMS as readonly string[]).includes(x)))
        .filter(Boolean) as Symptom[]
      out.push({ ...base, key, v: tags.length, tags })
    } else if (key === 'exercise') {
      const plan = (r.component ?? []).find((c) => codes(c.code).includes('exercise-plan'))?.valueString
      out.push({ ...base, key, v: r.valueBoolean === false ? 0 : 1, plan: plan === 'B' ? 'B' : 'A' })
    } else if (r.valueQuantity?.value != null) {
      out.push({ ...base, key, v: r.valueQuantity.value })
    } else skipped++
  }
  return { obs: out.sort((a, b) => a.t - b.t), skipped }
}

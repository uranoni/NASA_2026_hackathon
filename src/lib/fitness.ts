/**
 * 任務適任（fitness-for-duty）檢查：有氧能力、肌力、骨質密度。
 * 只做「資料進來之後」：這些數值由 NASA 的測驗送進來，畫面不能輸入。
 * 收到一筆新的測驗結果時，附在當下那一筆紀錄上；不符合下面任何一條規定，就把那一筆紀錄標示出來給地面看。
 *
 * 門檻全部出自 NASA-STD-3001 Volume 1 Rev C（2023），原文已逐字核對：
 * - [V1 4001] 4.1.1 Microgravity EVA Aerobic Capacity（p.32）
 * - [V1 4003] 4.1.3 In-Mission Aerobic Capacity（p.33）
 * - [V1 4024] 4.6.2 In-Mission Skeletal Muscle Strength（p.38）
 * - [V1 4027] 4.7.2 In-Mission Bone Countermeasures（p.39）
 *
 * 量測方式（決定 demo 有哪些資料）：
 * - 有氧能力：飛行中有測驗時間點（OCHMO-TB-031 Exercise Overview：2012–2022 年 12–21% 組員在飛行中的時間點低於 -20%）
 * - 肌力：等速肌力測驗在飛行前、後做（OCHMO-TB-031：before and after flight per NASA AMMERD 6.1）
 * - 骨質密度：DXA 在飛行前、後量（OCHMO-MTB-013 Bone Loss：DXA pre- and post-flight）
 * 所以 demo 只送飛行中的有氧測驗；肌力、骨密度的檢查已經寫好，資料進來就會檢查，沒有資料就不判斷、不亂編。
 */
import type { MissionEnv } from './assessment'

export type FitnessResult = {
  /** 測驗結果的識別碼；同一筆結果只會附在一筆紀錄上 */
  id: string
  /** 測驗日（任務第幾天） */
  day: number
  /** 量到的 VO2max（ml/min/kg），直接或間接量測 */
  vo2max?: number
  /** 飛行前的 VO2max（ml/min/kg），[V1 4003] 的比較基準 */
  vo2maxPre?: number
  /** 肌力，相對飛行前基準的百分比 */
  strengthPct?: number
  /** 骨質密度，相對飛行前的百分比 */
  bmdPct?: { hip?: number; spine?: number; femoralNeck?: number }
  /** 資料來源說明（demo 要標示） */
  source: string
}

export type FitnessFlag = {
  /** 規定編號，例如 V1 4001 */
  req: string
  /** 一行說明：量到多少、規定多少 */
  text: string
  /** 規定原文（NASA-STD-3001 Vol 1 Rev C），滑鼠移上去顯示 */
  quote: string
}

/** 任務本身的靜態資訊：這個 HUD 是 EVA 太空衣遙測，任務有微重力艙外活動，所以適用 [V1 4001] */
export const MISSION_HAS_MICROGRAVITY_EVA = true
const MICROGRAVITY: MissionEnv[] = ['iss', 'transit']

export const FITNESS_RULES = {
  eva: {
    req: 'V1 4001',
    min: 32.9,
    quote:
      'Crewmembers shall maintain an in-mission VO2max at or above 32.9 ml/min/kg for missions with microgravity EVAs as determined by either direct or indirect measures.',
  },
  aerobic: {
    req: 'V1 4003',
    minPct: 80,
    quote:
      'The in-mission aerobic capacity shall be maintained, either through countermeasures or work performance, at or above 80% of the pre-mission capacity determined by either direct or indirect measures.',
  },
  strength: {
    req: 'V1 4024',
    minPct: 80,
    quote: 'Countermeasures shall maintain in-mission skeletal muscle strength at or above 80% of baseline values.',
  },
  bone: {
    req: 'V1 4027',
    minHipSpinePct: 95,
    minNeckPct: 90,
    quote:
      'Countermeasures shall maintain bone mineral density of the hip and spine at or above 95% of pre-mission values and at or above 90% for the femoral neck.',
  },
} as const

const r1 = (n: number) => Math.round(n * 10) / 10

/** 依 NASA-STD-3001 Vol 1 Rev C 檢查一筆測驗結果；沒有的資料不檢查 */
export function checkFitness(f: FitnessResult, env: MissionEnv): FitnessFlag[] {
  const flags: FitnessFlag[] = []
  const R = FITNESS_RULES

  if (f.vo2max != null && MISSION_HAS_MICROGRAVITY_EVA && MICROGRAVITY.includes(env) && f.vo2max < R.eva.min) {
    flags.push({
      req: R.eva.req,
      text: `VO₂max ${f.vo2max} ml/min/kg, below ${R.eva.min} required for microgravity EVA`,
      quote: R.eva.quote,
    })
  }
  if (f.vo2max != null && f.vo2maxPre) {
    const pct = r1((f.vo2max / f.vo2maxPre) * 100)
    if (pct < R.aerobic.minPct) {
      flags.push({
        req: R.aerobic.req,
        text: `Aerobic capacity ${pct}% of pre-mission (${f.vo2max} / ${f.vo2maxPre}), below ${R.aerobic.minPct}%`,
        quote: R.aerobic.quote,
      })
    }
  }
  if (f.strengthPct != null && f.strengthPct < R.strength.minPct) {
    flags.push({
      req: R.strength.req,
      text: `Muscle strength ${f.strengthPct}% of baseline, below ${R.strength.minPct}%`,
      quote: R.strength.quote,
    })
  }
  const b = f.bmdPct
  if (b) {
    const low: string[] = []
    if (b.hip != null && b.hip < R.bone.minHipSpinePct) low.push(`hip ${b.hip}%`)
    if (b.spine != null && b.spine < R.bone.minHipSpinePct) low.push(`spine ${b.spine}%`)
    if (b.femoralNeck != null && b.femoralNeck < R.bone.minNeckPct) low.push(`femoral neck ${b.femoralNeck}%`)
    if (low.length) {
      flags.push({
        req: R.bone.req,
        text: `Bone mineral density ${low.join(', ')} of pre-mission (limits: hip/spine ${R.bone.minHipSpinePct}%, femoral neck ${R.bone.minNeckPct}%)`,
        quote: R.bone.quote,
      })
    }
  }
  return flags
}

/**
 * Demo 資料：任務第 44 天的飛行中有氧測驗（模擬，非真實組員資料）。
 * 飛行前 40.1、飛行中 31.6 ml/min/kg → 低於 32.9 [V1 4001]，也只剩飛行前的 78.8% [V1 4003]。
 * 真正接上時，由 NASA 的測驗資料取代這裡。
 */
export const DEMO_FITNESS: FitnessResult = {
  id: 'demo-aerobic-md44',
  day: 44,
  vo2max: 31.6,
  vo2maxPre: 40.1,
  source: 'Demo: simulated in-flight aerobic test (not real crew data)',
}

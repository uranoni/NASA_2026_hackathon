/**
 * 健康與環境判斷邏輯：移植自新版 iss_demo(1).html（使用者指定以新版為準）的
 * ranges / evalEnv / evalManual / evaluate，門檻與出處不變，畫面文字翻成英文（使用者要求資訊面板一律英文）。
 *
 * 新版的原則（照搬）：
 * - 生理門檻只採用查得到原文的數值；查不到的指標（心情、疲勞、偏離基準、清水槽）只記錄、不亮燈
 * - 艙內環境不影響人體燈號：evaluate() 只看個人量測；環境用 evalEnv() 另外算，只給左下角面板顯示
 * - 輻射已移除
 * - 建議分成 self（自己能做的事）和 ground（通報地面航醫）
 *
 * 和新版的差異：部位代號改用 repo 的 OrganId（head → brain、skin → limbs）；whole（全身）沒有 3D 部位，只顯示在面板。
 * 注意：Demo判斷依據.md 記錄的是舊版 iss_demo.html 的門檻，尚未依新版更新。
 */
import type { OrganId } from '../types/telemetry'

export type Level = 'ok' | 'warn' | 'bad'
export type Region = OrganId | 'whole'
export type Activity = 'rest' | 'work' | 'exercise' | 'critical' | 'eva' | 'eva_active'
export type MissionEnv = 'iss' | 'transit' | 'moon' | 'mars' | 'ground'
export type Context = { day: number; env: MissionEnv; act: Activity }

export type Finding = { level: Level; text: string; src: string }
export type Advice = { lv: Level; to: 'self' | 'ground'; text: string }
/** 每個量測項目的狀態（主畫面卡片用）；dir＝超出上限 hi／下限 lo，數值後顯示 ↑↓（F.4.3.1） */
export type VitalKey = 'hr' | 'bp' | 'glu' | 'temp' | 'sleep' | 'mood' | 'spo2' | 'k' | 'hydra' | 'sym' | 'clot' | 'eva'
export type Vital = { lv: Level | 'info'; text: string; dir: 'hi' | 'lo' | null }

export type EnvCard = {
  key: 'co2' | 'pio2' | 'press' | 'temp' | 'water'
  name: string
  val: number
  digits: number
  unit: string
  /** info＝只顯示數值、沒有公開門檻（清水槽） */
  lv: Level | 'info'
  status: string
  detail: string
}

/** 艙內讀值（mmHg、°C、%）；null 表示還沒收到 */
export type EnvReadings = {
  labO2: number | null
  labCO2: number | null
  n3O2: number | null
  n3CO2: number | null
  press: number | null
  temp: number | null
  water: number | null
  /** 兩艙段 CO2 的 1 小時平均取高者 */
  co2Avg: number | null
  /** 60 秒內壓力變化 */
  pChg: { delta: number; rate: number }
  /** 已累積幾分鐘的 CO2 資料（顯示用） */
  co2Minutes: number
  sim: boolean
}

/** 新版的個人量測欄位；repo 目前沒有手動輸入，只由遙測填入其中幾項 */
export type ManualInput = {
  hr?: number | null
  sbp?: number | null
  dbp?: number | null
  spo2?: number | null
  temp?: number | null
  k?: number | null
  water?: number | null
  basehr?: number | null
  basesbp?: number | null
  glu?: number | null
  /** 血糖量測時機：fast＝空腹、nonfast＝非空腹 */
  gluctx?: 'fast' | 'nonfast'
  sleep?: number | null
  /** 心情 1–5、疲勞 Samn-Perelli 1–7：只記錄，不判斷 */
  mood?: number | null
  fatigue?: number | null
  swell?: '' | 'neck' | 'arm' | 'leg'
  us?: '' | 'normal' | 'reduced' | 'absent'
  irreg?: boolean
  palp?: boolean
  dizzy?: boolean
  head?: boolean
  naus?: boolean
  cantdx?: boolean
  evaopen?: boolean
  helmetAt?: number | null
  /** 運動回報模組：false＝今天沒回報而且本週休息日已用掉（每週 6 天規則）；undefined＝不判斷（例如案例回放）。見 src/lib/exercise.ts */
  exercise_done?: boolean
  /** 最近 7 天有運動的天數（顯示用） */
  exercise_week?: number
}

export type Assessment = {
  body: Record<Region, Finding[]>
  level: Record<Region, Level>
  advice: Advice[]
  vit: Partial<Record<VitalKey, Vital>>
  overall: Level
  hasData: boolean
  R: Ranges
}

// ===================== 門檻常數（來源見註解，與新版相同） =====================
export const MMHG_PER_PSI = 51.715
export const LIMITS = {
  // 環境
  co2Avg1h: 3.0, // [V2 6004] 1 小時平均上限 mmHg
  co2Headache1pct: 2.5, // TB-004：7 天平均 <2.5 頭痛風險 <1%（此處以 1 小時平均近似）
  pio2Normoxia: [145, 155] as const, // [V2 6003] 表 6.2-1 常氧目標
  pio2MildHypoxia: 127, // 表 6.2-1 輕度缺氧下限
  pio2HyperIndef: 356, // 表 6.2-1 可無限期暴露的高氧上限
  pio2HyperShort: 791, // 表 6.2-1 短時間（6–9 小時）高氧上限
  pMin: 5 * MMHG_PER_PSI,
  pMax: 15 * MMHG_PER_PSI, // [V2 6006]
  pRatePsiMin: 13.5, // [V2 6007]
  tHealth: [18, 27] as const, // [V2 6012]
  tPerf: [20, 25] as const, // [V2 6013] 理由段
  // 清水槽存量：找不到公開的百分比門檻，只顯示數值（不亮燈）
}
// 生理門檻：只採用查得到原文的數值；查不到的指標只記錄不亮燈
export const TH = {
  hr: [60, 100] as const, // MedlinePlus：成人靜止心率 60–100 bpm（AHA ACLS 危急心率 <50／≥150 尚未能讀到原文，未採用）
  bpHi: [140, 90] as const, // MedlinePlus／NHLBI：第 2 期高血壓 ≥140 或 ≥90
  bpCrisis: [180, 120] as const, // MedlinePlus：高於 180 及／或高於 120 應立即就醫
  sbpLow: 90,
  dbpLow: 60, // NHLBI：低血壓 <90/60
  sbpDrop: 8,
  dbpDrop: 9, // Norsk 2015：長期任務 24 小時收縮壓 −8±2、舒張壓 −9±2 mmHg
  bpAdjFromDay: 85, // Norsk 2015：飛行中量測在第 85–192 天
  tempVLow: 35.0, // MedlinePlus：低體溫 <35°C（95°F）
  feverWarn: 38.0, // CDC：發燒 ≥38°C（100.4°F）；太空修正只上修此門檻
  feverBad: 39.4, // MedlinePlus：≥39.4°C（103°F）聯絡醫療人員；不隨任務修正
  tempRiseMax: 1.0, // Stahn 2017：休息核心體溫逐漸升高約 1°C
  tempRiseDays: 75, // Stahn 2017：約 2.5 個月，約第 75 天後持平
  gluL1: 70,
  gluL2: 54, // ADA 2026 表 6.4：第 1 級低血糖 <70、第 2 級 <54 mg/dL
  gluFastHi: 100, // ADA 2026 表 2.2：空腹 100–125 偏高（≥126 為表 2.1 診斷值，本工具不做診斷）
  gluNonHi: 200, // ADA 2026 表 2.1：隨機血糖 ≥200
  gluVHi: 250, // ADA「Managing Ketones」：血糖 ≥250 mg/dL 需量酮體
  sleepOk: 7, // AASM/SRS 2015：成人每晚 ≥7 小時；NASA OCHMO 睡眠簡報：成人需 7–9 小時
  issSleep: 6.09, // Barger 2014：ISS 平均睡眠（活動記錄器）
  spo2: 95,
  spo2Rep: 92,
  spo2Bad: 88, // MedlinePlus：正常 95–100%、≤92% 聯絡醫療人員、≤88% 立即就醫
  k: [3.7, 5.2] as const, // MedlinePlus：血鉀 3.70–5.20 mmol/L（各實驗室略有差異）
  waterMin: 2500, // [V2 6109]：每位組員每日至少 2.5 L 飲用水
  smsDays: 3,
  smsPct: 67, // Davis 1988：首次飛行 67%；Vanderploeg 1986：多數人第 3 天結束前症狀消失
}

/** 太空修正範圍：微重力環境才套用 Stahn 2017／Norsk 2015 */
const MICRO: Record<MissionEnv, boolean> = { iss: true, transit: true, moon: false, mars: false, ground: false }

export type Ranges = ReturnType<typeof ranges>
export function ranges(c: Pick<Context, 'day' | 'env'>) {
  const micro = MICRO[c.env]
  const tOff = micro ? Math.min(c.day / TH.tempRiseDays, 1) * TH.tempRiseMax : 0 // Stahn 2017
  const bpOn = micro && c.day >= TH.bpAdjFromDay // Norsk 2015
  return {
    micro,
    tOff,
    bpOff: bpOn ? TH.sbpDrop : 0,
    dbpOff: bpOn ? TH.dbpDrop : 0,
    sbpLow: TH.sbpLow - (bpOn ? TH.sbpDrop : 0),
    dbpLow: TH.dbpLow - (bpOn ? TH.dbpDrop : 0),
    fever: +(TH.feverWarn + tOff).toFixed(1),
  }
}

const rank = (l: Level | 'info') => ({ ok: 0, info: 0, warn: 1, bad: 2 })[l]
export const worse = (a: Level, b: Level): Level => (rank(a) >= rank(b) ? a : b)

const fx = (v: number, d: number) => v.toFixed(d)
function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

const ACT_NAME: Record<Activity, string> = {
  rest: 'rest',
  work: 'routine work',
  exercise: 'exercise',
  critical: 'critical tasks',
  eva: 'EVA prep',
  eva_active: 'EVA',
}

type Add = (reg: Region, lv: Level, text: string, src: string) => void
type AddAdvice = (lv: Level, to: Advice['to'], text: string, first?: boolean) => void

// ===================== 評估：環境（只給左下角面板，不影響人體燈號） =====================
export function evalEnv(r: EnvReadings, activity: Activity) {
  const cards: EnvCard[] = [],
    advice: Advice[] = []
  const A: AddAdvice = (lv, to, text) => advice.push({ lv, to, text })
  if (r.labCO2 != null || r.n3CO2 != null) {
    const co2 = Math.max(r.labCO2 ?? 0, r.n3CO2 ?? 0),
      avg = r.co2Avg ?? co2
    let lv: Level = avg <= LIMITS.co2Headache1pct ? 'ok' : avg <= LIMITS.co2Avg1h ? 'warn' : 'bad'
    if (co2 > 4.5) lv = 'bad'
    if (lv !== 'ok') {
      // 環境數值地面飛控同時看得到 → 只給自己能做的事；「通報」只用於地面看不到的症狀
      A(
        lv,
        'self',
        `CO₂ 1-h average ${avg.toFixed(2)} mmHg${lv === 'bad' ? ', above NASA limit 3 mmHg [V2 6004]' : ', near the limit'}: move to a better-ventilated module and check the module fans are on (TB-004). Ground controllers see this value too; no separate report needed`,
      )
      A(lv, 'ground', 'If you get a headache, fatigue or other symptoms, tell the flight surgeon (ground cannot see symptoms)')
      if (activity === 'exercise')
        A(lv, 'self', 'Postpone high-intensity exercise or move to a well-ventilated module (exercise sharply raises CO₂ output, TB-004)')
      if (activity === 'critical') A(lv, 'self', 'CO₂ can impair attention and cause fatigue: run a reaction test or swap crew before critical tasks')
    }
    cards.push({
      key: 'co2',
      name: 'CO₂ partial pressure (higher of 2 modules)',
      val: co2,
      digits: 2,
      unit: 'mmHg',
      lv,
      status: { ok: 'Normal (low headache risk)', warn: 'Near limit, watch for headache', bad: 'Above limit, action needed' }[lv],
      detail: r.sim ? 'Simulated value' : `1-h avg ${avg.toFixed(2)} (${r.co2Minutes} min collected) | limit 3.0 [V2 6004]`,
    })
  }
  if (r.press != null && (r.labO2 != null || r.n3O2 != null)) {
    const ppO2 = Math.min(r.labO2 ?? Infinity, r.n3O2 ?? Infinity)
    const fio2 = ppO2 / r.press,
      pio2 = (r.press - 47) * fio2
    let lv: Level
    if (pio2 < LIMITS.pio2MildHypoxia) lv = 'bad'
    else if (pio2 < LIMITS.pio2Normoxia[0]) lv = 'warn'
    else if (pio2 <= LIMITS.pio2HyperIndef) lv = 'ok'
    else if (pio2 <= LIMITS.pio2HyperShort) lv = 'warn'
    else lv = 'bad'
    const v = pio2.toFixed(0)
    if (pio2 < LIMITS.pio2MildHypoxia) {
      A(lv, 'self', 'Put on an oxygen mask and stop work now; hypoxia often goes unnoticed, so crew should watch each other')
      A(
        lv,
        'self',
        `Inspired O₂ ${v} mmHg, below the 127 floor: follow the depress/hypoxia emergency procedure (TB-003); ground also sees cabin pressure and O₂`,
      )
    } else if (pio2 < LIMITS.pio2Normoxia[0]) {
      A(
        lv,
        'self',
        activity === 'eva'
          ? `Mild hypoxia is allowed by procedure during EVA prep (PIO₂ ${v}, ≥127 permitted, [V2 6003] Table 6.2-1); keep monitoring`
          : `Inspired O₂ ${v} mmHg, below the 145 normoxia target: NASA allows long exposure with monitoring [V2 6003]; tell the flight surgeon if dizzy or tired`,
      )
    }
    if (pio2 > LIMITS.pio2HyperIndef)
      A(lv, 'self', `Hyperoxia (PIO₂ ${v}): above the 356 indefinite-exposure limit, allowed only 6–9 h [V2 6003]`)
    cards.push({
      key: 'pio2',
      name: 'Inspired O₂ partial pressure PIO₂ (calculated)',
      val: pio2,
      digits: 0,
      unit: 'mmHg',
      lv,
      status:
        lv === 'ok'
          ? pio2 > LIMITS.pio2Normoxia[1]
            ? 'Normal (slightly above normoxia target, indefinite OK)'
            : 'Normoxia, normal'
          : lv === 'warn'
            ? pio2 < 145
              ? 'Below normoxia target, monitor'
              : 'Hyperoxia, time-limited'
            : 'Outside safe range',
      detail: `ppO₂ US Lab ${r.labO2?.toFixed(1) ?? '—'} / Node 3 ${r.n3O2?.toFixed(1) ?? '—'} (lower used), O₂ fraction ${(fio2 * 100).toFixed(1)}% | normoxia 145–155, floor 127 [V2 6003]`,
    })
  }
  if (r.press != null) {
    const psia = r.press / MMHG_PER_PSI
    let lv: Level = r.press > LIMITS.pMin && r.press <= LIMITS.pMax ? 'ok' : 'bad'
    const chg = r.pChg || { delta: 0, rate: 0 }
    if (Math.abs(chg.delta) > MMHG_PER_PSI) {
      const l2: Level = chg.rate > LIMITS.pRatePsiMin ? 'bad' : 'warn'
      lv = worse(lv, l2)
      A(
        l2,
        'self',
        `Pressure changed ${(chg.delta / MMHG_PER_PSI).toFixed(2)} psi within 1 min: if ears hurt, ask to pause the pressure change [V2 6150] and check for leaks per emergency procedure`,
      )
    }
    if (r.press <= LIMITS.pMin || r.press > LIMITS.pMax)
      A('bad', 'self', `Cabin pressure ${psia.toFixed(2)} psia is outside the 5–15 psia long-term range [V2 6006]: follow emergency procedure`)
    cards.push({
      key: 'press',
      name: 'Cabin total pressure',
      val: r.press,
      digits: 1,
      unit: 'mmHg',
      lv,
      status: lv === 'ok' ? 'Normal' : 'Abnormal',
      detail: `${psia.toFixed(2)} psia | long-term 5–15 psia [V2 6006] | 60-s change ${chg.delta.toFixed(1)} mmHg`,
    })
  }
  if (r.temp != null) {
    const tc = r.temp,
      [h1, h2] = LIMITS.tHealth,
      [p1, p2] = LIMITS.tPerf
    const lv: Level = tc < h1 || tc > h2 ? 'bad' : tc < p1 || tc > p2 ? 'warn' : 'ok'
    if (lv !== 'ok')
      A(
        lv,
        'self',
        `Cabin ${tc.toFixed(1)}°C${lv === 'bad' ? ', outside the 18–27°C health range [V2 6012]' : ', within the health range but outside the 20–25°C comfort zone'}: adjust thermal control, local airflow or clothing`,
      )
    cards.push({
      key: 'temp',
      name: 'Cabin temperature',
      val: tc,
      digits: 1,
      unit: '°C',
      lv,
      status: { ok: 'Comfortable, best performance', warn: 'Acceptable, may affect performance', bad: 'Outside health range' }[lv],
      detail: 'Health 18–27°C [V2 6012] | comfort 20–25°C [V2 6013] | no public ISS humidity data',
    })
  }
  if (r.water != null) {
    cards.push({
      key: 'water',
      name: 'Clean water tank',
      val: r.water,
      digits: 1,
      unit: '%',
      lv: 'info',
      status: 'For reference only (no public threshold)',
      detail: 'Daily drinking water is judged per person [V2 6109]',
    })
  }
  return { cards, advice }
}

// ===================== 評估：個人量測 =====================
function evalManual(
  m: ManualInput,
  c: Context,
  R: Ranges,
  add: Add,
  A: AddAdvice,
  vit: Partial<Record<VitalKey, Vital>>,
) {
  const activity = c.act
  const evaNow = activity === 'eva_active' || activity === 'eva'
  const setV = (k: VitalKey, lv: Vital['lv'], text: string, dir: Vital['dir'] = null) => {
    const o = vit[k]
    if (!o || rank(lv) > rank(o.lv)) vit[k] = { lv, text, dir }
  }
  const OK = 'Within range'

  if (m.hr != null) {
    const lv: Level = m.hr < TH.hr[0] || m.hr > TH.hr[1] ? 'warn' : 'ok'
    setV('hr', lv, lv === 'ok' ? OK : m.hr > TH.hr[1] ? 'High' : 'Low', lv === 'ok' ? null : m.hr > TH.hr[1] ? 'hi' : 'lo')
    if (lv !== 'ok') {
      add(
        'heart',
        lv,
        `Heart rate ${fx(m.hr, 0)} bpm (resting range ${TH.hr[0]}–${TH.hr[1]})${activity === 'exercise' || activity === 'eva_active' ? '; high HR is expected during exercise or EVA, recheck at rest' : ''}`,
        'MedlinePlus (ground)',
      )
      A(lv, 'self', 'Rest 5 min, then recheck heart rate')
      A(lv, 'ground', 'If heart rate is still out of range on recheck, notify the flight surgeon')
    }
  }
  if (m.sbp != null) {
    const s = m.sbp,
      d = m.dbp ?? 999
    let lv: Level = 'ok',
      txt = OK,
      dir: Vital['dir'] = null
    if (s > TH.bpCrisis[0] || (m.dbp != null && d > TH.bpCrisis[1])) {
      lv = 'bad'
      dir = 'hi'
      txt = `Crisis range (>${TH.bpCrisis[0]}/${TH.bpCrisis[1]})`
    } else if (s >= TH.bpHi[0] || (m.dbp != null && d >= TH.bpHi[1])) {
      lv = 'warn'
      dir = 'hi'
      txt = `High (≥${TH.bpHi[0]}/${TH.bpHi[1]})`
    } else if (s < R.sbpLow || d < R.dbpLow) {
      lv = 'warn'
      dir = 'lo'
      txt = `Low (< ${R.sbpLow}/${R.dbpLow})`
    }
    setV('bp', lv, txt, dir)
    if (lv !== 'ok') {
      add('heart', lv, `${s}/${m.dbp ?? '—'} mmHg: ${txt}`, R.bpOff ? 'Norsk 2015 + MedlinePlus / NHLBI' : 'MedlinePlus / NHLBI (ground)')
      A(lv, 'self', 'Stop activity, rest 5 min, then recheck blood pressure')
      A(
        lv,
        'ground',
        lv === 'bad'
          ? 'Blood pressure in crisis range: notify the flight surgeon now'
          : 'If blood pressure is still out of range on recheck, notify the flight surgeon',
      )
    }
  }
  if (m.glu != null) {
    const g = m.glu,
      hi = m.gluctx === 'nonfast' ? TH.gluNonHi : TH.gluFastHi
    let lv: Level = 'ok',
      txt = OK
    if (g < TH.gluL2) {
      lv = 'bad'
      txt = `Clearly low (< ${TH.gluL2})`
    } else if (g < TH.gluL1) {
      lv = 'warn'
      txt = `Low (< ${TH.gluL1})`
    } else if (g >= TH.gluVHi) {
      lv = 'bad'
      txt = `Clearly high (≥ ${TH.gluVHi})`
    } else if (g >= hi) {
      lv = 'warn'
      txt = 'High'
    }
    setV('glu', lv, txt, lv === 'ok' ? null : g < TH.gluL1 ? 'lo' : 'hi')
    if (lv !== 'ok') {
      add('whole', lv, `Glucose ${g} mg/dL: ${txt}`, 'ADA 2026 (ground clinical value, not validated in space)')
      if (g < TH.gluL1) add('brain', lv, 'Low glucose can affect attention and reaction', 'ADA')
      A(lv, 'self', 'Ask the crew medical officer to recheck, and record timing (fasting / non-fasting)')
      A(lv, 'ground', `Glucose ${g} mg/dL: notify the flight surgeon`)
    }
  }
  if (m.temp != null) {
    const tc = m.temp
    let lv: Level = 'ok',
      txt = OK
    if (tc >= TH.feverBad) {
      lv = 'bad'
      txt = `High fever (≥ ${TH.feverBad}°C)`
    } else if (tc < TH.tempVLow) {
      lv = 'bad'
      txt = `Too low (< ${TH.tempVLow}°C)`
    } else if (tc >= R.fever) {
      lv = 'warn'
      txt = 'Fever (above current range)'
    }
    setV('temp', lv, txt, lv === 'ok' ? null : tc < TH.tempVLow ? 'lo' : 'hi')
    if (lv !== 'ok') {
      add('whole', lv, `Body temp ${fx(tc, 1)}°C: ${txt}`, R.micro ? 'Stahn 2017 + CDC / MedlinePlus' : 'CDC / MedlinePlus (ground)')
      A(lv, 'self', 'Recheck body temperature and record it')
      A(lv, 'ground', `Body temp ${fx(tc, 1)}°C: notify the flight surgeon`)
    }
  }
  if (m.sleep != null) {
    const h = m.sleep,
      lv: Level = h < TH.sleepOk ? 'warn' : 'ok'
    setV('sleep', lv, lv === 'ok' ? OK : `Short sleep (< ${TH.sleepOk} h)`, lv === 'ok' ? null : 'lo')
    if (lv !== 'ok') {
      add('whole', lv, `Slept ${h} h last night: short sleep (< ${TH.sleepOk} h)`, 'AASM/SRS 2015; Barger 2014')
      if (activity === 'critical' || evaNow) {
        add('brain', lv, `Short sleep lowers alertness and affects ${ACT_NAME[activity]}`, 'Barger 2014')
        A(lv, 'self', 'Have a crewmate double-check steps before critical tasks')
      }
      A(lv, 'ground', 'Short sleep: discuss the work/rest schedule with ground')
    }
  }
  // 心情、疲勞：沒有公開門檻，只記錄（不加入人體圖、不產生建議）
  if (m.mood != null || m.fatigue != null) setV('mood', 'info', 'Recorded (no public threshold, not judged)')
  if (m.spo2 != null) {
    const lv: Level = m.spo2 <= TH.spo2Bad ? 'bad' : m.spo2 < TH.spo2 ? 'warn' : 'ok'
    setV(
      'spo2',
      lv,
      lv === 'ok' ? OK : lv === 'bad' ? 'Clearly low' : m.spo2 <= TH.spo2Rep ? 'Low, report' : 'Below normal',
      lv === 'ok' ? null : 'lo',
    )
    if (lv !== 'ok') {
      add('lungs', lv, `SpO₂ ${fx(m.spo2, 0)}% (range ≥ ${TH.spo2}%)`, 'MedlinePlus (ground)')
      A(lv, 'self', 'Recheck SpO₂')
      if (m.spo2 <= TH.spo2Rep) A(lv, 'ground', `SpO₂ ${fx(m.spo2, 0)}%: notify the flight surgeon`)
    }
  }
  if (m.k != null) {
    const lv: Level = m.k < TH.k[0] || m.k > TH.k[1] ? 'warn' : 'ok'
    setV('k', lv, lv === 'ok' ? OK : 'Out of range', lv === 'ok' ? null : m.k > TH.k[1] ? 'hi' : 'lo')
    if (lv !== 'ok') {
      add(
        'heart',
        lv,
        `Potassium ${m.k} mmol/L (range ${TH.k[0]}–${TH.k[1]}): electrolyte imbalance can trigger arrhythmia`,
        'MedlinePlus (ground)',
      )
      A(lv, 'ground', 'Potassium out of range: notify the flight surgeon')
    }
  }
  // 不舒服回報（症狀是地面看不到的資訊）
  let nSym = 0
  if (m.irreg) {
    nSym++
    const severe = m.dizzy || m.palp,
      lv: Level = severe ? 'bad' : 'warn'
    add('heart', lv, severe ? 'Irregular rhythm with dizziness or palpitations' : 'Irregular heart rhythm', 'ECG')
    if (severe) {
      A(lv, 'self', 'Stop physical activity and record an ECG')
      if (evaNow) A(lv, 'self', 'During EVA, abort and return to the airlock')
      A(lv, 'ground', 'Irregular rhythm with symptoms: notify the flight surgeon now')
    } else A(lv, 'self', 'Record an ECG after rest and check fluids and electrolytes')
    setV('sym', lv, '')
  } else if (m.palp) {
    add('heart', 'warn', 'Palpitations', 'Self-report')
  }
  if (m.palp) nSym++
  if (m.dizzy) {
    nSym++
    add('brain', 'warn', 'Dizziness', 'Self-report')
  }
  if (m.head) {
    nSym++
    add('brain', 'warn', 'Headache', 'Self-report')
  }
  if (m.naus) {
    nSym++
    add('whole', 'warn', 'Nausea', 'Self-report')
    if (R.micro && c.day <= TH.smsDays)
      add(
        'whole',
        'warn',
        `Mission day ${c.day}: about ${TH.smsPct}% of first-time flyers get space motion sickness [Davis 1988]; most recover by the end of day 3 [Vanderploeg 1986]`,
        'Davis 1988; Vanderploeg 1986',
      )
  }
  if (m.cantdx) {
    nSym++
    add('whole', 'warn', 'Unexplained symptoms (cannot be diagnosed onboard)', 'Crew-11 precedent')
    A('bad', 'ground', 'Cannot diagnose onboard: arrange a remote consult and evaluate early return (2026 Crew-11 precautionary evacuation)')
    if (evaNow) A('bad', 'ground', 'Cancel EVA until the cause is known')
    setV('sym', 'bad', '')
  }
  if (nSym) {
    setV('sym', 'warn', '')
    vit.sym!.text = `${nSym} reported`
    if (!m.irreg && !m.cantdx) A('warn', 'ground', 'If symptoms persist or worsen, notify the flight surgeon') // 每個黃燈都要有對應行動
    if (m.temp == null && m.spo2 == null && m.hr == null)
      A('warn', 'self', 'Feeling unwell: use the medical kit to measure temperature, SpO₂, heart rate and blood pressure')
  }
  // 頸靜脈超音波（排程、地面判讀）與單側腫脹
  if (m.swell) {
    const where: Region = m.swell === 'neck' ? 'neck' : 'limbs',
      w = m.swell
    add(where, 'warn', `One-sided ${w} swelling: possible venous clot`, 'Self-report')
    A('warn', 'self', 'Schedule an ultrasound')
    A('warn', 'ground', `One-sided ${w} swelling: notify the flight surgeon (the 2020 clot had no symptoms and was found by ultrasound)`)
    setV('clot', 'warn', 'Needs follow-up')
  }
  if (m.us) {
    if (m.us === 'normal') setV('clot', 'ok', OK)
    if (m.us === 'reduced') {
      add('neck', 'warn', 'Reduced jugular vein flow', 'Ultrasound')
      A('warn', 'ground', 'Reduced jugular vein flow: schedule a follow-up ultrasound with the flight surgeon')
      setV('clot', 'warn', 'Needs follow-up')
    }
    if (m.us === 'absent') {
      add('neck', 'bad', 'No jugular vein flow / suspected clot', 'Ultrasound')
      A('bad', 'ground', 'Ultrasound suggests a clot: notify the flight surgeon and request remote radiology review (treatment is the physician’s decision)')
      if (evaNow || activity === 'exercise') A('bad', 'self', 'Pause EVA and high-intensity exercise until confirmed')
      setV('clot', 'bad', 'Suspected clot')
    }
  }
  // 飲水
  if (m.water != null) {
    if (m.water < TH.waterMin) {
      add('whole', 'warn', `Water intake today ${m.water} ml, below the NASA daily supply ${TH.waterMin} ml [V2 6109]`, '[V2 6109]')
      A('warn', 'self', 'Drink more and record it')
      setV('hydra', 'warn', 'Below daily supply', 'lo')
    } else setV('hydra', 'ok', OK)
  }
  // 與任務前基準比較：沒有公開的偏離門檻，只顯示差距（不亮燈）
  for (const [k, base, card] of [
    ['hr', 'basehr', 'hr'],
    ['sbp', 'basesbp', 'bp'],
  ] as const) {
    const v = m[k],
      b = m[base],
      o = vit[card]
    if (v != null && b && o) {
      const dev = ((v - b) / b) * 100
      o.text += ` | ${dev > 0 ? '+' : ''}${dev.toFixed(0)}% from pre-mission baseline`
    }
  }
  // 運動回報（Demo 自訂，使用者指定；依據 OCHMO-TB-031、NASA/SP-20250000273，見 src/lib/exercise.ts）
  // 每週 6 天：今天沒回報而且本週休息日已用掉 → 四肢、心臟、全身亮黃燈＋提醒
  if (m.exercise_done === false) {
    const src = 'Demo-defined; 6 days/week per NASA/SP-20250000273, effects per OCHMO-TB-031'
    const wk = m.exercise_week != null ? ` (${m.exercise_week}/6 sessions in the last 7 days)` : ''
    add('limbs', 'warn', `No training today and this week's rest day is used${wk}: bone and muscle loading missed`, src)
    add('heart', 'warn', `No training today and this week's rest day is used${wk}: cardiovascular deconditioning risk`, src)
    add('whole', 'warn', `Below the 6-days-a-week exercise plan${wk}`, src)
    A(
      'warn',
      'self',
      `No resistive or aerobic training reported today, and this week's rest day is already used${wk}. Per NASA OCHMO-TB-031, missing training speeds up loss of aerobic capacity, muscle strength and bone strength, and weakens sensorimotor function. Do today’s training plan soon to stay fit for duty`,
    )
  }
  // EVA
  if (m.helmetAt) {
    const mins = (Date.now() - m.helmetAt) / 60000
    add('brain', 'bad', 'Water in EVA helmet: drowning and suffocation risk', 'EVA 23 investigation')
    A(
      'bad',
      'self',
      `Water in helmet: abort EVA and return to the airlock now. ${fmtElapsed(Date.now() - m.helmetAt)} since report${mins >= 5 ? ' (EVA 23 waited 23 min before the return order; do not wait)' : ''}`,
      true,
    )
    setV('eva', 'bad', 'Water in helmet')
  }
  if (m.evaopen) {
    const lv: Level = evaNow ? 'bad' : 'warn'
    A(
      lv,
      'ground',
      `Last EVA anomaly is still unexplained: ${evaNow ? 'do not go outside until the cause is found' : 'do not close it out or schedule the next EVA until it is explained'} (EVA 23 investigation: tracing the EVA 22 leak would likely have prevented the incident)`,
    )
    setV('eva', lv, 'Unexplained anomaly')
  }
}

const REGIONS: Region[] = ['brain', 'eyes', 'neck', 'heart', 'lungs', 'limbs', 'whole']

/** 主畫面只看個人量測；艙內環境不在題目範圍，不影響燈號（新版原則） */
export function evaluate(c: Context, m: ManualInput): Assessment {
  const body = Object.fromEntries(REGIONS.map((k) => [k, [] as Finding[]])) as Record<Region, Finding[]>
  const advice: Advice[] = [],
    vit: Partial<Record<VitalKey, Vital>> = {}
  const add: Add = (reg, lv, text, src) => body[reg].push({ level: lv, text, src })
  const A: AddAdvice = (lv, to, text, first) => {
    const x = { lv, to, text }
    if (first) advice.unshift(x)
    else advice.push(x)
  }
  const R = ranges(c)
  evalManual(m, c, R, add, A, vit)
  const level = Object.fromEntries(REGIONS.map((k) => [k, body[k].reduce<Level>((a, x) => worse(a, x.level), 'ok')])) as Record<
    Region,
    Level
  >
  let overall = Object.values(level).reduce(worse, 'ok')
  overall = advice.reduce<Level>((a, x) => worse(a, x.lv), overall)
  overall = Object.values(vit).reduce<Level>((a, x) => worse(a, x.lv === 'info' ? 'ok' : x.lv), overall)
  const hasData = Object.keys(vit).length > 0 || advice.length > 0
  if (overall === 'bad' && c.act === 'critical') A('bad', 'self', 'Pause or postpone critical tasks', true)
  advice.sort((a, b) => rank(b.lv) - rank(a.lv)) // 嚴重的排前面（sort 是穩定排序，同等級維持原順序）
  return { body, level, advice, vit, overall, hasData, R }
}

/** 任務環境名稱（新版 envIss 等，翻成英文） */
export const ENV_NAME: Record<MissionEnv, string> = {
  iss: 'Space station (microgravity)',
  transit: 'Mars transit (microgravity)',
  moon: 'Lunar base (partial gravity)',
  mars: 'Mars base (partial gravity)',
  ground: 'Ground (training / post-flight)',
}

/** 任務天數限制在 1–1200（新版 ctx()） */
export const clampDay = (d: number) => Math.min(1200, Math.max(1, Math.round(d) || 1))

/** 目前情境下的範圍修正說明（新版 rg_temp_adj／rg_bp_adj／rg_bp_early／rg_partial／rg_ground） */
export function rangeNotes(c: Pick<Context, 'day' | 'env'>, R: Ranges): string[] {
  if (c.env === 'ground') return ['Ground clinical values (no spaceflight adjustment)']
  if (!R.micro) return ['No spaceflight-specific data for partial gravity; ground clinical values are used']
  const notes: string[] = []
  // 新版 shortRange 也是 tOff ≥ 0.05 才顯示上修
  notes.push(
    R.tOff >= 0.05
      ? `Fever threshold raised +${R.tOff.toFixed(1)}°C for mission day ${c.day} (about +${TH.tempRiseMax}°C by day ${TH.tempRiseDays}) [Stahn 2017]`
      : `No fever adjustment yet on day ${c.day} (rises to about +${TH.tempRiseMax}°C by day ${TH.tempRiseDays}) [Stahn 2017]`,
  )
  notes.push(
    R.bpOff
      ? `Day ${c.day}: 24-h blood pressure drops on long missions (systolic −${TH.sbpDrop}, diastolic −${TH.dbpDrop}), so the low-BP threshold is lowered to < ${R.sbpLow}/${R.dbpLow} [Norsk 2015]`
      : `Ground blood pressure values until day ${TH.bpAdjFromDay} (study measured on flight days 85–192) [Norsk 2015]`,
  )
  return notes
}

export const REGION_NAME: Record<Region, string> = {
  brain: 'HEAD / BRAIN',
  eyes: 'EYES',
  neck: 'NECK (VESSELS)',
  heart: 'HEART / CIRCULATION',
  lungs: 'RESPIRATORY',
  limbs: 'LIMBS / SKIN',
  whole: 'WHOLE BODY',
}

export const VITAL_NAME: Record<VitalKey, string> = {
  hr: 'Heart rate',
  bp: 'Blood pressure',
  glu: 'Glucose',
  temp: 'Body temp',
  sleep: 'Sleep',
  mood: 'Mood & fatigue',
  spo2: 'SpO₂',
  k: 'Potassium',
  hydra: 'Water intake',
  sym: 'Symptoms',
  clot: 'Jugular ultrasound',
  eva: 'EVA report',
}

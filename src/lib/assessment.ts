/**
 * 健康與環境判斷邏輯：從 iss_demo.html 的 evalEnv / evalManual / evaluate 移植，門檻與出處不變，畫面文字翻成英文。
 * 門檻的完整依據見 iss_demo.html 同目錄的「Demo判斷依據.md」；改門檻時兩邊要一起改。
 *
 * 和原版的差異：
 * - 部位代號改用 repo 的 OrganId：head → brain、skin → limbs；whole（全身）沒有 3D 部位，只顯示在面板
 * - 新增 repo 原有的兩個判斷（肌肉疲勞 >70%、輻射 >0.5 mGy/h），標為 Demo 自訂（出處待補）
 * - 顯示文字為英文（使用者要求資訊面板一律英文）
 */
import type { OrganId } from '../types/telemetry'

export type Level = 'ok' | 'warn' | 'bad'
export type Region = OrganId | 'whole'
export type Activity = 'rest' | 'work' | 'exercise' | 'critical' | 'eva' | 'eva_active'

/** metric：對應到面板上哪一個數值列（只有遙測數值有） */
export type Metric = "hr" | "bp" | "spo2" | "temp" | "sleep" | "fatigue" | "rad"
export type Finding = { level: Level; text: string; src: string; metric?: Metric }
export type Advice = { lv: Level; text: string }
export type EnvCard = {
  key: 'co2' | 'pio2' | 'press' | 'temp' | 'water'
  name: string
  val: number
  digits: number
  unit: string
  lv: Level
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

/** 原版的手動輸入欄位；repo 目前沒有手動輸入，只由遙測填入其中幾項，其餘為 null／false */
export type ManualInput = {
  hr?: number | null
  sbp?: number | null
  dbp?: number | null
  spo2?: number | null
  temp?: number | null
  k?: number | null
  water?: number | null
  calf?: number | null
  basehr?: number | null
  basesbp?: number | null
  glu?: number | null
  sleep?: number | null
  mood?: number | null
  radcar?: number | null
  radrate?: number | null
  urine?: string
  swell?: string
  us?: string
  irreg?: boolean
  palp?: boolean
  dizzy?: boolean
  head?: boolean
  naus?: boolean
  cantdx?: boolean
  evaopen?: boolean
  spe?: boolean
  helmetAt?: number | null
  /** repo 新增：肌肉疲勞 %、輻射劑量率 mGy/h（repo 原有門檻） */
  fatigue?: number | null
  radMgyH?: number | null
}

export type Assessment = {
  body: Record<Region, Finding[]>
  level: Record<Region, Level>
  advice: Advice[]
  cards: EnvCard[]
  overall: Level
  hasData: boolean
}

// ===================== 常數（來源見註解） =====================
export const MMHG_PER_PSI = 51.715
export const LIMITS = {
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
  waterWarn: 30,
  waterBad: 15, // Demo 自訂
}
const CLIN = 'Ground clinical value (not validated in space)'
const REPO_CUSTOM = 'Demo-defined (source pending)'

const rank = (l: Level) => ({ ok: 0, warn: 1, bad: 2 })[l]
export const worse = (a: Level, b: Level): Level => (rank(a) >= rank(b) ? a : b)

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

type Add = (reg: Region, lv: Level, text: string, src: string, metric?: Metric) => void

// ===================== 評估：環境 =====================
function evalEnv(r: EnvReadings, activity: Activity, add: Add, advice: Advice[], cards: EnvCard[]) {
  if (r.labCO2 != null || r.n3CO2 != null) {
    const co2 = Math.max(r.labCO2 ?? 0, r.n3CO2 ?? 0),
      avg = r.co2Avg ?? co2
    let lv: Level = avg <= LIMITS.co2Headache1pct ? 'ok' : avg <= LIMITS.co2Avg1h ? 'warn' : 'bad'
    if (co2 > 4.5) lv = 'bad'
    const src = 'TB-004'
    if (co2 >= 2.8)
      add('brain', co2 > 4.5 ? 'bad' : 'warn', 'Headache risk (headaches reported in flight at 2.8–4.5 mmHg)', src)
    if (co2 >= 3.5) {
      add('eyes', 'warn', 'Blurred vision (reported at 3.5 mmHg)', src)
      add('lungs', 'warn', 'Chronic cough (reported at 3.5 mmHg)', src)
      add('whole', 'warn', 'Poorer sleep', src)
    }
    if (co2 > 4.5) {
      add('whole', 'bad', 'Fatigue, malaise, less sleep, nausea (>4.5 mmHg)', src)
      add('brain', 'bad', 'Facial sensation changes (cranial nerve V, 4.5–5.0 mmHg)', src)
    }
    if (lv !== 'ok') {
      advice.push({
        lv,
        text: `CO2 1-h average ${avg.toFixed(2)} mmHg${lv === 'bad' ? ', above NASA limit 3 mmHg [V2 6004]' : ', near the limit'}: notify ground, check CO2 removal and ventilation`,
      })
      if (activity === 'exercise')
        advice.push({
          lv,
          text: 'Exercise sharply raises CO2 output (TB-004): postpone high-intensity exercise or move to a well-ventilated module',
        })
      if (activity === 'critical')
        advice.push({ lv, text: 'CO2 can impair attention and cause fatigue: run a reaction test or swap crew before critical tasks' })
    }
    cards.push({
      key: 'co2',
      name: 'CO2 partial pressure (higher of 2 modules)',
      val: co2,
      digits: 2,
      unit: 'mmHg',
      lv,
      status: lv === 'ok' ? 'Normal (low headache risk)' : lv === 'warn' ? 'Near limit, watch for headache' : 'Above limit, action needed',
      detail: r.sim
        ? 'Simulated value'
        : `1-h avg ${avg.toFixed(2)} (${r.co2Minutes} min collected) | limit 3.0 [V2 6004]`,
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
    const src = 'TB-003 / [V2 6003]'
    if (pio2 < LIMITS.pio2MildHypoxia) {
      add('brain', 'bad', 'Cognitive and mood changes (often unnoticed by the person)', src)
      add('eyes', 'bad', 'Reduced color vision, night vision and peripheral vision', src)
      add('lungs', 'bad', 'Hyperventilation', src)
      add('whole', 'bad', 'Fatigue, nausea, dizziness, poorer sleep', src)
      advice.push({
        lv,
        text: `Inspired O2 ${pio2.toFixed(0)} mmHg, below the 127 floor: put on an oxygen mask, stop work and report (TB-003). Hypoxia often goes unnoticed; crew should watch each other`,
      })
    } else if (pio2 < LIMITS.pio2Normoxia[0]) {
      advice.push({
        lv,
        text:
          activity === 'eva'
            ? `Mild hypoxia is allowed by procedure during EVA prep (PIO2 ${pio2.toFixed(0)}, ≥127 permitted, [V2 6003] Table 6.2-1); keep monitoring`
            : `Inspired O2 ${pio2.toFixed(0)} mmHg, below the 145 normoxia target: NASA allows long exposure with monitoring [V2 6003]; report if dizzy or tired`,
      })
    }
    if (pio2 > LIMITS.pio2HyperIndef)
      advice.push({
        lv,
        text: `Hyperoxia (PIO2 ${pio2.toFixed(0)}): above the 356 indefinite-exposure limit, allowed only 6–9 h [V2 6003]`,
      })
    if (fio2 > 0.5) add('lungs', 'warn', 'O2 fraction >50%: absorption atelectasis risk [V2 6002]', '[V2 6002]')
    cards.push({
      key: 'pio2',
      name: 'Inspired O2 partial pressure PIO2 (calculated)',
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
      detail: `ppO2 US Lab ${r.labO2?.toFixed(1) ?? '—'} / Node 3 ${r.n3O2?.toFixed(1) ?? '—'} (lower used), O2 fraction ${(fio2 * 100).toFixed(1)}% | normoxia 145–155, floor 127 [V2 6003]`,
    })
  }
  if (r.press != null) {
    const psia = r.press / MMHG_PER_PSI
    let lv: Level = r.press > LIMITS.pMin && r.press <= LIMITS.pMax ? 'ok' : 'bad'
    const chg = r.pChg || { delta: 0, rate: 0 }
    if (Math.abs(chg.delta) > MMHG_PER_PSI) {
      const l2: Level = chg.rate > LIMITS.pRatePsiMin ? 'bad' : 'warn'
      lv = worse(lv, l2)
      add('brain', l2, 'Ear and sinus barotrauma risk (rapid pressure change)', '[V2 6007]')
      advice.push({
        lv: l2,
        text: `Pressure changed ${(chg.delta / MMHG_PER_PSI).toFixed(2)} psi within 1 min: if ears hurt, ask to pause the pressure change [V2 6150] and check for leaks per emergency procedure`,
      })
    }
    if (r.press <= LIMITS.pMin || r.press > LIMITS.pMax)
      advice.push({
        lv: 'bad',
        text: `Cabin pressure ${psia.toFixed(2)} psia is outside the 5–15 psia long-term range [V2 6006]: follow emergency procedure`,
      })
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
    const t = r.temp,
      [h1, h2] = LIMITS.tHealth,
      [p1, p2] = LIMITS.tPerf
    const lv: Level = t < h1 || t > h2 ? 'bad' : t < p1 || t > p2 ? 'warn' : 'ok'
    if (t > p2) {
      add('whole', lv, `Too warm: heat discomfort, lower performance${activity === 'exercise' ? ' (worse during exercise)' : ''}`, '[V2 6012/6013]')
      add('limbs', lv, 'Stuffiness, mucous membrane irritation (needs humidity to judge)', '[V2 6012]')
    }
    if (t < p1) add('whole', lv, 'Too cold: cold discomfort, lower performance', '[V2 6012/6013]')
    if (lv !== 'ok')
      advice.push({
        lv,
        text: `Cabin ${t.toFixed(1)}°C${lv === 'bad' ? ', outside the 18–27°C health range [V2 6012]' : ', within the health range but outside the 20–25°C comfort zone'}: adjust thermal control, local airflow or clothing`,
      })
    cards.push({
      key: 'temp',
      name: 'Cabin temperature',
      val: t,
      digits: 1,
      unit: '°C',
      lv,
      status: lv === 'ok' ? 'Comfortable, best performance' : lv === 'warn' ? 'Acceptable, may affect performance' : 'Outside health range',
      detail: 'Health 18–27°C [V2 6012] | comfort 20–25°C | no public ISS humidity data',
    })
  }
  if (r.water != null) {
    const lv: Level = r.water >= LIMITS.waterWarn ? 'ok' : r.water >= LIMITS.waterBad ? 'warn' : 'bad'
    if (lv !== 'ok') {
      add('whole', lv, 'Drinking water may be rationed: dehydration, kidney stone risk (HRP)', 'HRP')
      advice.push({ lv, text: 'Clean water tank is low: track daily intake and discuss rationing with ground if needed' })
    }
    cards.push({
      key: 'water',
      name: 'Clean water tank',
      val: r.water,
      digits: 1,
      unit: '%',
      lv,
      status: lv === 'ok' ? 'Water supply sufficient' : lv === 'warn' ? 'Tank low' : 'Tank very low',
      detail: 'Thresholds are demo-defined (not a NASA standard)',
    })
  }
}

// ===================== 評估：人體量測（原版的手動輸入） =====================
function evalManual(m: ManualInput, activity: Activity, add: Add, advice: Advice[]) {
  let any = false
  const evaNow = activity === 'eva_active' || activity === 'eva'
  if (m.hr != null) {
    any = true
    const lv: Level = m.hr < 40 || m.hr > 130 ? 'bad' : m.hr < 60 || m.hr > 100 ? 'warn' : 'ok'
    if (lv !== 'ok')
      add(
        'heart',
        lv,
        `Heart rate ${m.hr.toFixed(0)} bpm (resting normal 60–100)${activity === 'exercise' || activity === 'eva_active' ? '; high HR is expected during exercise or EVA, recheck at rest' : ''}`,
        CLIN,
        "hr",
      )
  }
  if (m.sbp != null) {
    any = true
    const s = m.sbp,
      d = m.dbp ?? 0
    let lv: Level = 'ok',
      txt = ''
    if (s >= 180 || d >= 120) {
      lv = 'bad'
      txt = 'hypertensive crisis range (≥180/120)'
    } else if (s >= 140 || d >= 90) {
      lv = 'warn'
      txt = 'high blood pressure (≥140/90)'
    } else if (s < 90) {
      lv = 'warn'
      txt = 'low blood pressure (systolic <90): watch for dizziness or fainting when standing or after landing'
    }
    if (lv !== 'ok') {
      add('heart', lv, `${s}/${m.dbp ?? '—'} mmHg: ${txt}`, CLIN, 'bp')
      if (lv === 'bad') advice.push({ lv, text: 'Blood pressure in crisis range: stop activity, recheck, and notify the flight surgeon now' })
    }
  }
  if (m.spo2 != null) {
    any = true
    const lv: Level = m.spo2 >= 95 ? 'ok' : m.spo2 >= 90 ? 'warn' : 'bad'
    if (lv !== 'ok') {
      add('lungs', lv, `SpO2 ${m.spo2.toFixed(0)}% (normal ≥95%)`, CLIN, 'spo2')
      advice.push({
        lv,
        text: `SpO2 ${m.spo2.toFixed(0)}%: recheck, and compare with cabin inspired O2 to rule out environmental hypoxia${lv === 'bad' ? '; below 90%, notify the flight surgeon' : ''}`,
      })
    }
  }
  if (m.temp != null) {
    any = true
    const t = m.temp
    const lv: Level = t >= 39.5 || t < 35 ? 'bad' : t >= 38 || t < 36 ? 'warn' : 'ok'
    if (lv !== 'ok') add('whole', lv, t >= 38 ? `Body temp ${t.toFixed(1)}°C: fever` : `Body temp ${t.toFixed(1)}°C: low`, CLIN, 'temp')
  }
  if (m.k != null) {
    any = true
    const lv: Level = m.k < 3.0 || m.k >= 6.0 ? 'bad' : m.k < 3.5 || m.k > 5.0 ? 'warn' : 'ok'
    if (lv !== 'ok')
      add(
        'heart',
        lv,
        `Potassium ${m.k} mmol/L (normal 3.5–5.0): electrolyte imbalance can trigger arrhythmia (suspected cause on Apollo 15)`,
        CLIN,
      )
  }
  if (m.irreg) {
    any = true
    const severe = m.dizzy || m.palp
    add('heart', severe ? 'bad' : 'warn', severe ? 'Irregular rhythm with dizziness or palpitations' : 'Irregular heart rhythm', 'ECG')
    advice.push({
      lv: severe ? 'bad' : 'warn',
      text: severe
        ? 'Irregular rhythm with symptoms: stop physical activity, record an ECG, notify the flight surgeon now' +
          (evaNow ? '; during EVA, abort and return to the airlock' : '')
        : 'Irregular rhythm: record an ECG after rest and check fluids and electrolytes',
    })
  } else if (m.palp) {
    any = true
    add('heart', 'warn', 'Palpitations', 'Self-report')
  }
  if (m.dizzy) {
    any = true
    add('brain', 'warn', 'Dizziness', 'Self-report')
  }
  if (m.head) {
    any = true
    add('brain', 'warn', 'Headache (compare with cabin CO2)', 'Self-report')
  }
  if (m.naus) {
    any = true
    add('whole', 'warn', 'Nausea', 'Self-report')
  }
  if (m.swell) {
    any = true
    const where = ({ neck: 'neck', arm: 'limbs', leg: 'limbs' } as Record<string, Region>)[m.swell] ?? 'limbs'
    const name = ({ neck: 'neck', arm: 'arm', leg: 'leg' } as Record<string, string>)[m.swell] ?? 'limb'
    add(where, 'warn', `One-sided ${name} swelling: possible venous clot`, 'Self-report')
    advice.push({
      lv: 'warn',
      text: `One-sided ${name} swelling: schedule an ultrasound and notify the flight surgeon (the 2020 clot had no symptoms and was found by ultrasound)`,
    })
  }
  if (m.calf != null) {
    any = true
    if (m.calf > 3)
      add('limbs', 'warn', `Calf circumference difference ${m.calf} cm (>3 cm is a Wells criterion)`, 'Wells criteria (ground)')
  }
  if (m.us) {
    any = true
    if (m.us === 'reduced') add('neck', 'warn', 'Reduced jugular vein flow', 'Ultrasound')
    if (m.us === 'absent') {
      add('neck', 'bad', 'No jugular vein flow / suspected clot', 'Ultrasound')
      advice.push({
        lv: 'bad',
        text: 'Ultrasound suggests a clot: notify the flight surgeon and request remote radiology review; anticoagulation is the physician’s decision (2020 case)',
      })
      if (evaNow || activity === 'exercise') advice.push({ lv: 'bad', text: 'Pause EVA and high-intensity exercise until confirmed' })
    }
  }
  if (m.water != null) {
    any = true
    if (m.water < 1500)
      add(
        'whole',
        'warn',
        `Water intake today ${m.water} ml (demo threshold 1500 ml): dehydration raises kidney stone and electrolyte risk`,
        'Demo-defined / HRP',
      )
  }
  if (m.urine) {
    any = true
    if (m.urine === 'dark' || m.urine === 'amber') {
      add('whole', 'warn', 'Dark urine: possible dehydration', 'Demo-defined')
      advice.push({ lv: 'warn', text: 'Dark urine: drink more; if there is also irregular rhythm or cramping, check electrolytes' })
    }
  }
  for (const [k, base, label] of [
    ['hr', 'basehr', 'Heart rate'],
    ['sbp', 'basesbp', 'Systolic BP'],
  ] as const) {
    const v = m[k],
      b = m[base]
    if (v != null && b) {
      any = true
      const dev = ((v - b) / b) * 100
      if (Math.abs(dev) > 20)
        add(
          'heart',
          'warn',
          `${label} ${dev > 0 ? '+' : ''}${dev.toFixed(0)}% from pre-mission baseline (demo threshold 20%)`,
          'Demo-defined',
        )
    }
  }
  if (m.helmetAt) {
    any = true
    const mins = (Date.now() - m.helmetAt) / 60000
    add('brain', 'bad', 'Water in EVA helmet: drowning and suffocation risk', 'EVA 23 investigation')
    advice.unshift({
      lv: 'bad',
      text: `Water in helmet: abort EVA and return to the airlock now. ${fmtElapsed(Date.now() - m.helmetAt)} since report${mins >= 5 ? ' (EVA 23 waited 23 min before the return order; do not wait)' : ''}`,
    })
  }
  // ---- 血糖（地面臨床通用值；太空臥床研究顯示胰島素阻抗會上升）----
  if (m.glu != null) {
    any = true
    const g = m.glu
    const lv: Level = g < 54 || g >= 250 ? 'bad' : g < 70 || g >= 100 ? 'warn' : 'ok'
    const txt =
      g < 54
        ? 'severe hypoglycemia (<54)'
        : g < 70
          ? 'hypoglycemia (<70)'
          : g >= 250
            ? 'very high glucose (≥250)'
            : g >= 126
              ? 'high fasting glucose (≥126)'
              : g >= 100
                ? 'slightly high fasting glucose (100–125)'
                : ''
    if (lv !== 'ok') {
      add('whole', lv, `Glucose ${g} mg/dL: ${txt}`, g >= 100 ? CLIN + '; ground bed-rest studies: insulin resistance rises' : CLIN)
      if (g < 70)
        advice.push({
          lv,
          text: `Low glucose: take fast carbs and recheck in 15 min; pause EVA and critical tasks${lv === 'bad' ? ', and notify the flight surgeon' : ''}`,
        })
      else if (lv === 'bad') advice.push({ lv, text: 'Very high glucose: recheck and notify the flight surgeon; watch for thirst, frequent urination, dehydration' })
      else
        advice.push({
          lv,
          text: 'High fasting glucose: keep logging, review diet and exercise (bed-rest studies show inactivity lowers insulin sensitivity)',
        })
    }
  }
  // ---- 睡眠（[V1 6001] 建議 8.5 小時睡眠時段；OCHMO-TB-041：ISS 實際平均約 6 小時）----
  if (m.sleep != null) {
    any = true
    const s = m.sleep
    const lv: Level = s < 5 ? 'bad' : s < 7 ? 'warn' : 'ok'
    if (lv !== 'ok') {
      add('brain', lv, `Slept ${s} h last night: reduced attention and reaction speed`, '[V1 6001] / TB-041')
      add('whole', lv, 'Short sleep (adults 7–9 h on ground; ISS average about 6 h)', 'TB-041', 'sleep')
      advice.push({
        lv,
        text: `Slept ${s} h: avoid scheduling critical tasks in fatigue windows today${activity === 'critical' || activity === 'eva_active' || activity === 'eva' ? '; run a reaction test before critical tasks or EVA, swap crew if needed' : ''}; tonight keep an 8.5 h sleep period per [V1 6001]`,
      })
    }
  }
  // ---- 情緒（[V1 4011] 行為健康須在臨床可接受範圍；單題 1–5 分是 Demo 簡化，NASA 實際用 POMS 等問卷）----
  if (m.mood != null) {
    any = true
    const lv: Level = m.mood <= 1 ? 'bad' : m.mood <= 2 ? 'warn' : 'ok'
    if (lv !== 'ok') {
      add('brain', lv, `Mood today ${m.mood}/5`, '[V1 4011] (demo simplified scale)')
      advice.push({
        lv,
        text:
          lv === 'bad'
            ? 'Very low mood: schedule a private conference with the ground behavioral health team and tell the commander to adjust workload'
            : 'Low mood: schedule leisure time or a family call; if low for several days, schedule a psychological conference',
      })
    }
  }
  // ---- 輻射（[V1 4030] 生涯 <600 mSv；[V1 4031] 太陽粒子事件 <250 mSv；[V1 4033] 深空載具設計 1.3／0.9 mSv/日）----
  if (m.radcar != null) {
    any = true
    const c = m.radcar
    const lv: Level = c >= 600 ? 'bad' : c >= 480 ? 'warn' : 'ok'
    if (lv !== 'ok') {
      add('whole', lv, `Career dose ${c} mSv (limit 600): long-term cancer and cardiovascular risk`, '[V1 4030] / HRP §5.1')
      add('eyes', lv, 'Cataract risk (long-term)', 'HRP §5.1')
      advice.push({
        lv,
        text:
          lv === 'bad'
            ? `Career dose ${c} mSv has reached the NASA 600 mSv limit [V1 4030]: notify radiation and medical teams, no further exposure`
            : `Career dose ${c} mSv is ${(c / 6).toFixed(0)}% of the limit: reduce exposure per ALARA [V1 4029]`,
      })
    }
    if (m.radrate != null && m.radrate > 0 && c < 600) {
      const days = Math.floor((600 - c) / m.radrate)
      advice.push({ lv: 'ok', text: `At ${m.radrate.toFixed(2)} mSv/day, the 600 mSv career limit is reached in about ${days} days` })
    }
  }
  if (m.radrate != null) {
    any = true
    const r = m.radrate
    if (r > 1.3) {
      add('whole', 'warn', `Dose rate ${r.toFixed(2)} mSv/day: above the 1.3 mSv/day deep-space vehicle design value`, '[V1 4033]')
      advice.push({
        lv: 'warn',
        text: `Dose rate ${r.toFixed(2)} mSv/day exceeds 3001 deep-space design values (1.3 free space, 0.9 planetary surface): spend less time in lightly shielded areas`,
      })
    }
  }
  if (m.spe) {
    any = true
    add('whole', 'bad', 'Solar particle event: large dose in a short time', '[V1 4031]')
    advice.unshift({
      lv: 'bad',
      text: 'Solar particle event alert: move to the best-shielded module now (add shielding with onboard water and food, HRP §5.1); cancel or abort EVA',
    })
  }
  if (m.evaopen) {
    any = true
    const lv: Level = evaNow ? 'bad' : 'warn'
    advice.push({
      lv,
      text: `Last EVA anomaly is still unexplained: until the cause is found, ${evaNow ? 'do not go outside' : 'do not close it out or schedule the next EVA'} (EVA 23 investigation: tracing the EVA 22 leak would likely have prevented the incident)`,
    })
  }
  if (m.cantdx) {
    any = true
    add('whole', 'warn', 'Unexplained symptoms (cannot be diagnosed onboard)', 'Crew-11 precedent')
    advice.push({
      lv: 'bad',
      text: 'Cannot diagnose onboard: arrange a remote consult and evaluate early return (2026 Crew-11 precautionary evacuation)',
    })
    if (evaNow) advice.push({ lv: 'bad', text: 'Cancel EVA until the cause is known' })
  }
  // ---- repo 原有的兩個判斷，沿用原門檻，出處待補 ----
  if (m.fatigue != null) {
    any = true
    if (m.fatigue > 70) {
      add('limbs', 'warn', `Muscle fatigue ${m.fatigue.toFixed(0)}% (>70%): rest, then do planned resistive exercise`, REPO_CUSTOM, 'fatigue')
    }
  }
  if (m.radMgyH != null) {
    any = true
    if (m.radMgyH > 0.5) {
      add('whole', 'warn', `Radiation dose rate ${m.radMgyH.toFixed(2)} mGy/h (>0.5)`, REPO_CUSTOM, 'rad')
      advice.push({
        lv: 'warn',
        text: `Radiation dose rate ${m.radMgyH.toFixed(2)} mGy/h is high: spend less time in lightly shielded areas and notify ground`,
      })
    }
  }
  return any
}

const REGIONS: Region[] = ['brain', 'eyes', 'neck', 'heart', 'lungs', 'limbs', 'whole']

export function evaluate(r: EnvReadings | null, activity: Activity, m: ManualInput): Assessment {
  const body = Object.fromEntries(REGIONS.map((k) => [k, [] as Finding[]])) as Record<Region, Finding[]>
  const level = Object.fromEntries(REGIONS.map((k) => [k, 'ok' as Level])) as Record<Region, Level>
  const add: Add = (reg, lv, text, src, metric) => {
    body[reg].push({ level: lv, text, src, metric })
    level[reg] = worse(level[reg], lv)
  }
  const advice: Advice[] = [],
    cards: EnvCard[] = []
  if (r) evalEnv(r, activity, add, advice, cards)
  const manualAny = evalManual(m, activity, add, advice)
  let overall = Object.values(level).reduce(worse, cards.reduce<Level>((a, c) => worse(a, c.lv), 'ok'))
  overall = advice.reduce<Level>((a, x) => worse(a, x.lv), overall)
  const hasData = cards.length > 0 || manualAny
  if (hasData && overall === 'ok')
    advice.unshift({
      lv: 'ok',
      text:
        activity === 'critical'
          ? 'Cabin and body readings are within range: OK to perform critical tasks'
          : 'Cabin and body readings are within range: normal operations',
    })
  if (overall === 'bad' && activity === 'critical') advice.unshift({ lv: 'bad', text: 'Pause or postpone critical tasks' })
  return { body, level, advice, cards, overall, hasData }
}

export const REGION_NAME: Record<Region, string> = {
  brain: 'HEAD / BRAIN',
  eyes: 'EYES',
  neck: 'NECK (VESSELS)',
  heart: 'HEART / CIRCULATION',
  lungs: 'RESPIRATORY',
  limbs: 'LIMBS / SKIN',
  whole: 'WHOLE BODY (FATIGUE, SLEEP, FLUIDS)',
}

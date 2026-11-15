export type OrganId = 'brain' | 'eyes' | 'neck' | 'heart' | 'lungs' | 'core' | 'limbs'

export interface OrganMetrics {
  heartRate: number
  spo2: number
  coreTemp: number
  radiationDose: number
  muscleFatigue: number
  respRate: number
  bloodPressureSys: number
  bloodPressureDia: number
  sleepHours: number
  moodIndex: number
}

export interface TelemetryState extends OrganMetrics {
  connected: boolean
  missionCode: string
  crewId: string
  emergency: boolean
  lastUpdate: number
}

/** 預留 WebSocket / 遙測串流介面 */
export interface TelemetrySource {
  connect: (onData: (partial: Partial<TelemetryState>) => void) => () => void
}

export const ORGAN_META: Record<
  OrganId,
  {
    label: string
    subtitle: string
    guidance: string
    position: [number, number, number]
    labelOffset: [number, number, number]
  }
> = {
  brain: {
    label: 'BRAIN',
    subtitle: 'Cognitive / CNS',
    guidance:
      'Isolation & circadian disruption may elevate cognitive load. Prioritize sleep hygiene and scheduled check-ins with ground.',
    // 對齊 1.80 m 真人模型座標（頭部範圍 y 1.56–1.80）
    // 原本 y=1.62 約在鼻子高度，會蓋住眼睛熱點，上移到頭部中央
    // 腦模型縮放後高約 0.146 m；中心 1.715 → 頂部約 1.79，留 1 cm 給顱骨（頭頂 1.80）
    position: [0, 1.715, 0.02],
    labelOffset: [0.72, 1.82, 0.18],
  },
  eyes: {
    label: 'EYES',
    subtitle: 'Vision / SANS',
    guidance:
      'Spaceflight-associated neuro-ocular syndrome (SANS) can cause swelling at the back of the eye. Report blurred or changed vision to the flight surgeon. High CO₂ or low O₂ can also blur vision; check cabin readings.',
    // 雙眼中心：y 依頭部高度比例估計，z 為臉部表面
    position: [0, 1.69, 0.1],
    labelOffset: [0.78, 1.62, 0.2],
  },
  neck: {
    label: 'NECK',
    subtitle: 'Jugular vein',
    guidance:
      'Fluid shift can slow blood flow in the neck veins; a 2020 ISS case found a clot with no symptoms. Report one-sided neck swelling and follow the scheduled ultrasound.',
    position: [0, 1.52, 0.04],
    labelOffset: [-0.8, 1.56, 0.18],
  },
  limbs: {
    label: 'LIMBS',
    subtitle: 'Muscle / Clot check',
    guidance:
      'Unloading weakens arm and leg muscles. One-sided swelling or a calf difference over 3 cm should be reported to the flight surgeon.',
    // 主要座標放在小腿（血栓自評的位置）；手臂熱點見 OrganModules 的 LIMB_SPOTS
    position: [-0.11, 0.36, 0.05],
    labelOffset: [-0.78, 0.5, 0.15],
  },
  heart: {
    label: 'HEART',
    subtitle: 'Cardiovascular',
    guidance:
      'Microgravity fluid shifts alter cardiac workload. BPM >110 or irregular rhythm warrants flight surgeon consult.',
    // 依一般人體比例估計（非精確解剖）：1.80 m 的人胸骨上緣約 1.47 m，心臟中心約 1.31 m。
    // 畫面是背視圖（腳尖朝 -z，背對相機），本人左側＝畫面左側（-x）；心臟偏胸前，所以 z 取 -0.02
    position: [-0.03, 1.31, -0.02],
    labelOffset: [-0.85, 1.4, 0.22],
  },
  lungs: {
    label: 'LUNGS',
    subtitle: 'Respiratory',
    guidance:
      'Closed-loop atmosphere & suit CO₂ scrubbing affect SpO₂. Sustained SpO₂ <94% requires cabin / suit review.',
    // 雙肺置中：肺尖約到鎖骨上方（約 1.47 m），肺底約 1.19 m，中心約 1.33 m（一般人體比例估計）
    position: [0, 1.33, 0.01],
    labelOffset: [0.88, 1.36, 0.18],
  },
  core: {
    label: 'CORE',
    subtitle: 'Musculoskeletal',
    guidance:
      'Gravity unloading accelerates muscle & bone loss. Schedule resistive exercise; monitor fatigue >70%.',
    position: [0.02, 1.02, 0.08],
    labelOffset: [-0.82, 0.92, 0.15],
  },
}

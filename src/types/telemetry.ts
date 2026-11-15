// 原本的 core（腹部的核心肌群形狀）已移除，肌肉疲勞改顯示在 limbs
export type OrganId = 'brain' | 'eyes' | 'neck' | 'heart' | 'lungs' | 'limbs'

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

/**
 * labelOffset 一律放在人體左邊（x < 0）：右側有資訊面板，放右邊會被擋住；y 錯開避免同時顯示時重疊。
 * x 約 -0.5：框從這點往左長；選取時相機拉近，畫面左緣約只到 x -0.9，放太遠框會整個跑出畫面只剩線。
 * 核心肌群的高度有手（A 字姿勢手在 x -0.52），所以放 -0.62、略高。
 */
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
    // 頭部前後範圍約 z -0.12（後腦）～ +0.08（鼻尖），中心約 -0.02
    position: [0, 1.715, -0.02],
    labelOffset: [-0.45, 1.82, 0.18],
  },
  eyes: {
    label: 'EYES',
    subtitle: 'Vision / SANS',
    guidance:
      'Spaceflight-associated neuro-ocular syndrome (SANS) can cause swelling at the back of the eye. Report blurred or changed vision to the flight surgeon. High CO₂ or low O₂ can also blur vision; check cabin readings.',
    // 雙眼中心：y 依頭部高度比例估計；z 在鼻尖（+0.08）後方約 2 cm
    position: [0, 1.69, 0.06],
    labelOffset: [-0.45, 1.68, 0.2],
  },
  neck: {
    label: 'NECK',
    subtitle: 'Jugular vein',
    guidance:
      'Fluid shift can slow blood flow in the neck veins; a 2020 ISS case found a clot with no symptoms. Report one-sided neck swelling and follow the scheduled ultrasound.',
    // 頸部前後範圍約 z -0.09～+0.02，取中心
    position: [0, 1.52, -0.03],
    labelOffset: [-0.45, 1.52, 0.18],
  },
  limbs: {
    label: 'LIMBS',
    subtitle: 'Muscle fatigue / Clot check',
    guidance:
      'Unloading weakens arm and leg muscles; schedule resistive exercise and watch fatigue >70%. One-sided swelling or a calf difference over 3 cm should be reported to the flight surgeon.',
    // 標籤與相機焦點放在本人右上臂（正面視角下在畫面左側，和其他標籤同側）；
    // 使用者要求不要顯示在腿上。四個熱點見 OrganModules 的 LIMB_SPOTS
    position: [-0.31, 1.18, 0.0],
    labelOffset: [-0.55, 1.08, 0.15],
  },
  heart: {
    label: 'HEART',
    subtitle: 'Cardiovascular',
    guidance:
      'Microgravity fluid shifts alter cardiac workload. BPM >110 or irregular rhythm warrants flight surgeon consult.',
    // 依一般人體比例估計（非精確解剖）：1.80 m 的人胸骨上緣約 1.47 m，心臟中心約 1.31 m。
    // 模型已轉成正面朝相機（+z 是胸前）：本人左側＝畫面右側（+x），心臟偏胸前，所以 z 取 +0.02
    position: [0.03, 1.31, 0.02],
    labelOffset: [-0.5, 1.42, 0.22],
  },
  lungs: {
    label: 'LUNGS',
    subtitle: 'Respiratory',
    guidance:
      'Closed-loop atmosphere & suit CO₂ scrubbing affect SpO₂. Sustained SpO₂ <94% requires cabin / suit review.',
    // 雙肺置中：肺尖約到鎖骨上方（約 1.47 m），肺底約 1.19 m，中心約 1.33 m（一般人體比例估計）
    position: [0, 1.33, -0.01],
    labelOffset: [-0.5, 1.24, 0.18],
  },
}

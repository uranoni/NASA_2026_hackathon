export type OrganId = 'brain' | 'heart' | 'lungs' | 'core'

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
    // 對齊 1.80 m 真人模型座標
    position: [0, 1.62, 0.06],
    labelOffset: [0.72, 1.72, 0.18],
  },
  heart: {
    label: 'HEART',
    subtitle: 'Cardiovascular',
    guidance:
      'Microgravity fluid shifts alter cardiac workload. BPM >110 or irregular rhythm warrants flight surgeon consult.',
    position: [-0.06, 1.28, 0.1],
    labelOffset: [-0.85, 1.35, 0.22],
  },
  lungs: {
    label: 'LUNGS',
    subtitle: 'Respiratory',
    guidance:
      'Closed-loop atmosphere & suit CO₂ scrubbing affect SpO₂. Sustained SpO₂ <94% requires cabin / suit review.',
    position: [0.05, 1.26, 0.08],
    labelOffset: [0.88, 1.28, 0.18],
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

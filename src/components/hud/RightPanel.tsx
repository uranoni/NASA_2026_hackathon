import type { OrganId, TelemetryState } from '../../types/telemetry'
import { ORGAN_META } from '../../types/telemetry'
import { EcgWaveform } from './EcgWaveform'

type Props = {
  data: TelemetryState
  selected: OrganId | null
}

function MetricRow({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-cyan-400/15 py-2">
      <span className="text-[11px] tracking-[0.18em] text-cyan-200/65">{label}</span>
      <span
        className={`text-sm tracking-wider ${warn ? 'text-[#ff2a55]' : 'text-cyan-100'}`}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {value}
      </span>
    </div>
  )
}

export function RightPanel({ data, selected }: Props) {
  const organ = selected ? ORGAN_META[selected] : null
  const hrWarn = data.heartRate > 110
  const spo2Warn = data.spo2 < 94
  const fatigueWarn = data.muscleFatigue > 70
  const radWarn = data.radiationDose > 0.5

  return (
    <aside
      className={`hud-glass hud-corner relative w-[min(360px,92vw)] p-4 ${
        data.emergency ? 'alert-border' : ''
      }`}
    >
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] tracking-[0.28em] text-cyan-300/70">SELECTED MODULE</p>
          <h2
            className="mt-1 text-lg tracking-[0.12em] text-cyan-50"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {organ ? organ.label : 'CREW OVERVIEW'}
          </h2>
          <p className="text-xs text-cyan-200/60">
            {organ ? organ.subtitle : 'Multi-system vitals'}
          </p>
        </div>
        <div className="text-right text-[10px] tracking-widest text-cyan-300/55">
          T+{Math.floor((Date.now() % 86400000) / 1000)}s
        </div>
      </div>

      <div className="mb-3 rounded-sm border border-cyan-400/20 bg-black/25 p-2">
        <p className="mb-1 text-[10px] tracking-[0.22em] text-cyan-300/70">ECG // LIVE</p>
        <EcgWaveform bpm={data.heartRate} alert={hrWarn || data.emergency} />
      </div>

      <MetricRow label="HEART RATE" value={`${data.heartRate.toFixed(0)} BPM`} warn={hrWarn} />
      <MetricRow label="SpO₂" value={`${data.spo2.toFixed(1)} %`} warn={spo2Warn} />
      <MetricRow
        label="BLOOD PRESSURE"
        value={`${data.bloodPressureSys}/${data.bloodPressureDia} mmHg`}
      />
      <MetricRow label="CORE TEMP" value={`${data.coreTemp.toFixed(1)} °C`} />
      <MetricRow
        label="RADIATION DOSE"
        value={`${data.radiationDose.toFixed(2)} mGy/h`}
        warn={radWarn}
      />
      <MetricRow
        label="MUSCLE FATIGUE"
        value={`${data.muscleFatigue.toFixed(0)} %`}
        warn={fatigueWarn}
      />
      <MetricRow label="RESP RATE" value={`${data.respRate.toFixed(0)} /min`} />
      <MetricRow label="SLEEP (24h)" value={`${data.sleepHours.toFixed(1)} h`} />
      <MetricRow label="MOOD INDEX" value={`${data.moodIndex.toFixed(0)} /100`} />

      <div className="mt-4 border border-cyan-400/20 bg-cyan-950/30 p-3">
        <p className="text-[10px] tracking-[0.22em] text-cyan-300/70">GUIDANCE // HRP</p>
        <p className="mt-2 text-xs leading-relaxed text-cyan-100/80">
          {organ
            ? organ.guidance
            : 'Click Brain / Heart / Lungs / Core on the hologram to inspect system-specific status against Artemis mission health hazards (radiation, isolation, distance, gravity, closed environment).'}
        </p>
        {(hrWarn || spo2Warn || fatigueWarn || radWarn || data.emergency) && (
          <p className="mt-2 text-xs tracking-wide text-[#ff2a55]">
            ATTENTION: Threshold exceeded — recommend crew self-check and downlink to flight surgeon.
          </p>
        )}
      </div>
    </aside>
  )
}

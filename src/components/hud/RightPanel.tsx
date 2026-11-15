import type { Assessment, Level, Metric, Region } from '../../lib/assessment'
import { REGION_NAME, worse } from '../../lib/assessment'
import type { OrganId, TelemetryState } from '../../types/telemetry'
import { ORGAN_META } from '../../types/telemetry'
import { EcgWaveform } from './EcgWaveform'

type Props = {
  data: TelemetryState
  selected: OrganId | null
  assessment: Assessment
}

/** 狀態色依 3001 Vol 2 表 F.5-1（黃＝注意、紅＝警告），另附文字標籤，顏色不是唯一提示 [V2 10045] */
const LV_COLOR: Record<Level, string> = { ok: 'text-cyan-100', warn: 'text-[#ffd23f]', bad: 'text-[#ff2a55]' }
const LV_TAG: Record<Level, string> = { ok: '', warn: 'CAUTION', bad: 'WARNING' }
const LV_MARK: Record<Level, string> = { ok: '●', warn: '▲', bad: '■' }

function MetricRow({ label, value, level = 'ok' }: { label: string; value: string; level?: Level }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-cyan-400/15 py-2">
      <span className="text-[11px] tracking-[0.18em] text-cyan-200/65">{label}</span>
      <span className={`text-sm tracking-wider ${LV_COLOR[level]}`} style={{ fontFamily: 'var(--font-mono)' }}>
        {value}
        {level !== 'ok' && <span className="ml-1.5 text-[10px]">{LV_TAG[level]}</span>}
      </span>
    </div>
  )
}

/** 每個數值列的狀態：取判斷結果中標了同一個 metric 的項目（同一套門檻，見 src/lib/assessment.ts） */
function metricLevel(a: Assessment, metric: Metric): Level {
  return Object.values(a.body)
    .flat()
    .filter((f) => f.metric === metric)
    .reduce<Level>((acc, f) => worse(acc, f.level), 'ok')
}

export function RightPanel({ data, selected, assessment: a }: Props) {
  const organ = selected ? ORGAN_META[selected] : null
  const hrLv = metricLevel(a, 'hr')
  const bpLv = metricLevel(a, 'bp')
  const spo2Lv = metricLevel(a, 'spo2')
  const tempLv = metricLevel(a, 'temp')
  const radLv = metricLevel(a, 'rad')
  const fatigueLv = metricLevel(a, 'fatigue')
  const sleepLv = metricLevel(a, 'sleep')

  // 選取部位時只列該部位的判斷；未選取時列出所有有異常的部位
  const regions: Region[] = selected ? [selected] : (Object.keys(a.body) as Region[]).filter((k) => a.body[k].length)

  return (
    <aside
      className={`hud-glass hud-corner relative w-[min(360px,92vw)] p-4 ${
        data.emergency || a.overall === 'bad' ? 'alert-border' : ''
      }`}
    >
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] tracking-[0.28em] text-cyan-300/70">SELECTED MODULE</p>
          <h2 className="mt-1 text-lg tracking-[0.12em] text-cyan-50" style={{ fontFamily: 'var(--font-display)' }}>
            {organ ? organ.label : 'CREW OVERVIEW'}
          </h2>
          <p className="text-xs text-cyan-200/60">{organ ? organ.subtitle : 'Multi-system vitals'}</p>
        </div>
        <div className="text-right text-[10px] tracking-widest text-cyan-300/55">
          T+{Math.floor((Date.now() % 86400000) / 1000)}s
        </div>
      </div>

      <div className="mb-3 rounded-sm border border-cyan-400/20 bg-black/25 p-2">
        <p className="mb-1 text-[10px] tracking-[0.22em] text-cyan-300/70">ECG // LIVE</p>
        <EcgWaveform bpm={data.heartRate} alert={hrLv !== 'ok' || data.emergency} />
      </div>

      <MetricRow label="HEART RATE" value={`${data.heartRate.toFixed(0)} BPM`} level={hrLv} />
      <MetricRow label="SpO₂" value={`${data.spo2.toFixed(1)} %`} level={spo2Lv} />
      <MetricRow label="BLOOD PRESSURE" value={`${data.bloodPressureSys}/${data.bloodPressureDia} mmHg`} level={bpLv} />
      <MetricRow label="CORE TEMP" value={`${data.coreTemp.toFixed(1)} °C`} level={tempLv} />
      <MetricRow label="RADIATION DOSE" value={`${data.radiationDose.toFixed(2)} mGy/h`} level={radLv} />
      <MetricRow label="MUSCLE FATIGUE" value={`${data.muscleFatigue.toFixed(0)} %`} level={fatigueLv} />
      <MetricRow label="RESP RATE" value={`${data.respRate.toFixed(0)} /min`} />
      <MetricRow label="SLEEP (24h)" value={`${data.sleepHours.toFixed(1)} h`} level={sleepLv} />
      <MetricRow label="MOOD INDEX" value={`${data.moodIndex.toFixed(0)} /100`} />

      {/* 判斷結果：依部位列出影響，附出處 */}
      <div className="mt-4 border border-cyan-400/20 bg-cyan-950/30 p-3">
        <p className="text-[10px] tracking-[0.22em] text-cyan-300/70">ASSESSMENT // BODY + CABIN</p>
        {regions.length === 0 ? (
          <p className="mt-2 text-xs text-cyan-100/80">
            {selected ? 'No known effect on this region right now.' : 'No known effect on any region right now.'}
          </p>
        ) : (
          regions.map((k) => (
            <div key={k} className="mt-2">
              <p className="text-[10px] tracking-[0.18em] text-cyan-200/70">{REGION_NAME[k]}</p>
              {a.body[k].length === 0 ? (
                <p className="text-xs text-cyan-100/70">No known effect on this region right now.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {a.body[k].map((f, i) => (
                    <li key={i} className={`text-xs leading-snug ${LV_COLOR[f.level]}`}>
                      {LV_MARK[f.level]} {f.text} <span className="text-[10px] text-cyan-200/45">[{f.src}]</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
        {/* 已看到全身判斷時也一併列出（全身沒有 3D 部位可點） */}
        {selected && a.body.whole.length > 0 && (
          <p className="mt-2 text-[10px] text-cyan-200/50">
            Whole-body findings: {a.body.whole.length} (click RESET VIEW to see all)
          </p>
        )}
      </div>

      {/* 建議：依數值即時產生；只做提醒與通報建議，不做診斷、不建議用藥 */}
      <div className="mt-3 border border-cyan-400/20 bg-cyan-950/30 p-3">
        <p className="text-[10px] tracking-[0.22em] text-cyan-300/70">GUIDANCE // ACTIONS</p>
        <ul className="mt-2 space-y-1.5">
          {a.advice.map((x, i) => (
            <li key={i} className={`text-xs leading-relaxed ${LV_COLOR[x.lv]}`}>
              {LV_MARK[x.lv]} {x.text}
            </li>
          ))}
        </ul>
        {organ && <p className="mt-2 text-xs leading-relaxed text-cyan-100/70">{organ.guidance}</p>}
      </div>
    </aside>
  )
}

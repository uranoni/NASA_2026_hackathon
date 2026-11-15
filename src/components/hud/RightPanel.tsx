import type { Assessment, Context, Level, Region, Vital } from '../../lib/assessment'
import { ENV_NAME, rangeNotes, REGION_NAME } from '../../lib/assessment'
import type { OrganId, TelemetryState } from '../../types/telemetry'
import { ORGAN_META } from '../../types/telemetry'
import { EcgWaveform } from './EcgWaveform'

type Props = {
  data: TelemetryState
  selected: OrganId | null
  assessment: Assessment
  ctx: Context
  /** 建議旁的快捷按鈕：帶入運動課表 A／B */
  onSuggestPlan: (plan: 'A' | 'B') => void
}

/** 狀態色依 3001 Vol 2 表 F.5-1（黃＝注意、紅＝警告），另附文字與符號，顏色不是唯一提示 [V2 10045] */
const LV_COLOR: Record<Level, string> = { ok: 'text-cyan-100', warn: 'text-[#ffd23f]', bad: 'text-[#ff2a55]' }
const LV_MARK: Record<Level, string> = { ok: '●', warn: '▲', bad: '■' }

/** vit：判斷結果裡這一項的狀態；沒有 vit 的列只顯示數值（沒有公開門檻，不判斷） */
function MetricRow({ label, value, vit }: { label: string; value: string; vit?: Vital }) {
  const lv: Level = vit && vit.lv !== 'info' ? vit.lv : 'ok'
  // 超出範圍時數值後加 ↑↓（F.4.3.1）
  const arrow = vit?.dir === 'hi' ? ' ↑' : vit?.dir === 'lo' ? ' ↓' : ''
  return (
    <div className="border-b border-cyan-400/15 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] tracking-[0.18em] text-cyan-200/65">{label}</span>
        <span className={`text-sm tracking-wider ${LV_COLOR[lv]}`} style={{ fontFamily: 'var(--font-mono)' }}>
          {value}
          {arrow}
        </span>
      </div>
      {lv !== 'ok' && vit && <p className={`text-right text-[10px] ${LV_COLOR[lv]}`}>{LV_MARK[lv]} {vit.text}</p>}
    </div>
  )
}

export function RightPanel({ data, selected, assessment: a, ctx, onSuggestPlan }: Props) {
  const organ = selected ? ORGAN_META[selected] : null
  const v = a.vit

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
        <EcgWaveform bpm={data.heartRate} alert={(v.hr != null && v.hr.lv !== 'ok') || data.emergency} />
      </div>

      <MetricRow label="HEART RATE" value={`${data.heartRate.toFixed(0)} BPM`} vit={v.hr} />
      <MetricRow label="SpO₂" value={`${data.spo2.toFixed(1)} %`} vit={v.spo2} />
      <MetricRow label="BLOOD PRESSURE" value={`${data.bloodPressureSys}/${data.bloodPressureDia} mmHg`} vit={v.bp} />
      <MetricRow label="CORE TEMP" value={`${data.coreTemp.toFixed(1)} °C`} vit={v.temp} />
      <MetricRow label="SLEEP (24h)" value={`${data.sleepHours.toFixed(1)} h`} vit={v.sleep} />
      <MetricRow label="RESP RATE" value={`${data.respRate.toFixed(0)} /min`} />
      <MetricRow label="MUSCLE FATIGUE" value={`${data.muscleFatigue.toFixed(0)} %`} />
      <MetricRow label="MOOD INDEX" value={`${data.moodIndex.toFixed(0)} /100`} />
      <MetricRow label="RADIATION DOSE" value={`${data.radiationDose.toFixed(2)} mGy/h`} />
      {/* 新版判斷規則：查不到公開門檻的指標只記錄、不亮燈；輻射已不在判斷範圍 */}
      <p className="mt-1 text-[10px] leading-snug text-cyan-200/45">
        Resp rate, fatigue, mood and radiation are shown only (no public threshold, not judged).
      </p>

      {/* 任務情境與目前生效的範圍修正（新版 ranges()；設定在左下角） */}
      <div className="mt-3 border border-cyan-400/20 bg-black/20 p-2">
        <p className="text-[10px] tracking-[0.18em] text-cyan-300/70">
          DAY {ctx.day} · {ENV_NAME[ctx.env].toUpperCase()}
        </p>
        <ul className="mt-1 space-y-0.5">
          {rangeNotes(ctx, a.R).map((n, i) => (
            <li key={i} className="text-[10px] leading-snug text-cyan-100/65">
              {n}
            </li>
          ))}
        </ul>
      </div>

      {/* 判斷結果：依部位列出影響，附出處 */}
      <div className="mt-4 border border-cyan-400/20 bg-cyan-950/30 p-3">
        <p className="text-[10px] tracking-[0.22em] text-cyan-300/70">ASSESSMENT // BODY</p>
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
        {a.advice.length === 0 ? (
          <p className="mt-2 text-xs text-cyan-100/80">No action needed right now.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {a.advice.map((x, i) => (
              <li key={i} className={`text-xs leading-relaxed ${LV_COLOR[x.lv]}`}>
                {/* SELF＝自己能做的事、GROUND＝通報地面航醫 */}
                <span className="mr-1.5 rounded-sm border border-cyan-400/30 px-1 text-[9px] tracking-wider text-cyan-200/80">
                  {x.to === 'self' ? 'SELF' : 'GROUND'}
                </span>
                {LV_MARK[x.lv]} {x.text}
                {x.action && (
                  <button
                    type="button"
                    onClick={() => onSuggestPlan(x.action!.plan)}
                    className="mt-1.5 block w-full rounded-sm border border-[#ffd23f]/70 bg-[#ffd23f]/10 px-2 py-1.5 text-left text-[11px] text-[#ffd23f] hover:bg-[#ffd23f]/20"
                  >
                    {x.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-cyan-200/45">Reminders and reporting only; no diagnosis, no medication advice.</p>
        {organ && <p className="mt-2 text-xs leading-relaxed text-cyan-100/70">{organ.guidance}</p>}
      </div>
    </aside>
  )
}

import type { ReactNode } from 'react'
import { clampDay, ENV_NAME, type EnvCard, type Level, type MissionEnv } from '../../lib/assessment'
import type { CabinStatus } from '../../hooks/useCabinTelemetry'

/** 艙內資料選單：none＝面板收起；iss＝顯示 ISS 艙內遙測。和下面的任務環境（影響判斷範圍）是兩件事 */
export type Environment = 'none' | 'iss'
const ENV_OPTIONS: { value: Environment; label: string }[] = [
  { value: 'none', label: 'NONE' },
  { value: 'iss', label: 'ISS CABIN' },
]
const MISSION_ENVS: MissionEnv[] = ['iss', 'transit', 'moon', 'mars', 'ground']
/** 下拉選單用短名稱（完整名稱太長會超出 300px 面板）；完整名稱放在 title，右側面板也會顯示 */
const ENV_SHORT: Record<MissionEnv, string> = {
  iss: 'ISS',
  transit: 'MARS TRANSIT',
  moon: 'LUNAR BASE',
  mars: 'MARS BASE',
  ground: 'GROUND',
}

const SELECT_CLS =
  'shrink-0 rounded-sm border border-cyan-400/35 bg-[#020617] px-1.5 py-0.5 text-[10px] tracking-wider text-cyan-100 outline-none focus:border-cyan-300'

type Props = {
  /** 任務第幾天、所在環境：會改變體溫、血壓的判斷範圍（新版設定頁） */
  day: number
  onDay: (d: number) => void
  missionEnv: MissionEnv
  onMissionEnv: (e: MissionEnv) => void
  env: Environment
  onEnv: (e: Environment) => void
  cards: EnvCard[]
  status: CabinStatus
}

/** 狀態色依 3001 Vol 2 表 F.5-1：紅＝警告、黃＝注意、灰＝無資料、青＝資料過舊；另附文字，顏色不是唯一提示 [V2 10045] */
const LV = {
  ok: { color: 'text-cyan-100', dot: 'bg-emerald-400', tag: 'OK' },
  warn: { color: 'text-[#ffd23f]', dot: 'bg-[#ffd23f]', tag: 'CAUTION' },
  bad: { color: 'text-[#ff2a55]', dot: 'bg-[#ff2a55]', tag: 'WARNING' },
  // 清水槽沒有公開門檻，只顯示數值（新版原則）
  info: { color: 'text-cyan-100', dot: 'bg-slate-500', tag: 'INFO' },
} satisfies Record<Level | 'info', { color: string; dot: string; tag: string }>

const SHORT_NAME: Record<EnvCard['key'], string> = {
  co2: 'CO2',
  pio2: 'O2 (PIO2)',
  press: 'PRESSURE',
  temp: 'CABIN TEMP',
  water: 'WATER TANK',
}

function connText(s: CabinStatus) {
  if (!s.libLoaded) return { text: 'Library failed to load (offline or unpkg blocked)', dot: 'bg-[#ff2a55]' }
  if (s.conn === 'connecting') return { text: 'Connecting…', dot: 'bg-slate-500' }
  if (s.conn === 'disconnected') return { text: 'Disconnected (auto-reconnecting)', dot: 'bg-[#ff2a55]' }
  if (s.signal === null) return { text: 'Connected, waiting for ISS signal', dot: 'bg-slate-500' }
  if (!s.signal) return { text: 'ISS signal lost (data may be stale)', dot: 'bg-cyan-500' }
  return { text: 'ISS LIVE (ISSLIVE)', dot: 'status-live bg-emerald-400' }
}

export function CabinPanel({ day, onDay, missionEnv, onMissionEnv, env, onEnv, cards, status }: Props) {
  const c = connText(status)
  // ISS 訊號中斷時數值可能過舊，依 F.5-1 用青色標示
  const stale = status.signal === false

  const header = (
    <div className="space-y-1.5">
      <Row id="mission-day" label="MISSION DAY">
        <input
          id="mission-day"
          type="number"
          min={1}
          max={1200}
          inputMode="numeric"
          value={day}
          onChange={(e) => onDay(clampDay(parseFloat(e.target.value)))}
          className={`${SELECT_CLS} w-16 text-right`}
        />
      </Row>
      <Row id="mission-env" label="LOCATION">
        <select
          id="mission-env"
          value={missionEnv}
          onChange={(e) => onMissionEnv(e.target.value as MissionEnv)}
          className={SELECT_CLS}
          title={ENV_NAME[missionEnv]}
        >
          {MISSION_ENVS.map((k) => (
            <option key={k} value={k} title={ENV_NAME[k]}>
              {ENV_SHORT[k]}
            </option>
          ))}
        </select>
      </Row>
      <Row id="env-select" label="CABIN DATA">
        <select id="env-select" value={env} onChange={(e) => onEnv(e.target.value as Environment)} className={SELECT_CLS}>
          {ENV_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
    </div>
  )

  // 艙內資料選 NONE：只留設定，艙內數值全部收起
  if (env === 'none') {
    // 寬度跟著內容（w-max），原本固定 220px 會讓下拉框超出框外
    return <section className="hud-glass hud-corner relative w-max max-w-[92vw] p-2.5">{header}</section>
  }

  return (
    <section className="hud-glass hud-corner relative w-[min(300px,92vw)] p-3">
      {header}
      {/* 新版 envNotIss：環境不是太空站時，艙內數值仍來自 ISS，只供展示 */}
      {missionEnv !== 'iss' && (
        <p className="mt-1.5 text-[10px] leading-snug text-[#ffd23f]">
          Location is not the space station; cabin values still come from ISS telemetry, for display only.
        </p>
      )}
      <div className="mt-1 flex justify-end">
        <span className="text-[9px] tracking-widest text-cyan-200/45">GMT {status.gmt}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-cyan-100/75">
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
        <span>{c.text}</span>
      </div>

      <div className="mt-2">
        {cards.length === 0 ? (
          <p className="py-2 text-[11px] text-slate-400">No cabin data yet</p>
        ) : (
          cards.map((card) => {
            const lv = LV[card.lv]
            return (
              <div key={card.key} className="border-b border-cyan-400/15 py-1.5" title={card.detail}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] tracking-[0.16em] text-cyan-200/65">{SHORT_NAME[card.key]}</span>
                  <span
                    className={`text-xs tracking-wider ${stale ? 'text-cyan-500' : lv.color}`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {card.val.toFixed(card.digits)} {card.unit}
                    <span className="ml-1.5 text-[10px]">{stale ? 'STALE' : lv.tag}</span>
                  </span>
                </div>
                <p className={`text-[10px] leading-snug ${stale ? 'text-cyan-500/80' : 'text-cyan-100/55'}`}>
                  {card.status}
                </p>
              </div>
            )
          })
        )}
      </div>

      <p className="mt-1.5 text-[9px] leading-snug text-cyan-200/40">
        Thresholds: NASA-STD-3001 Vol 2 Rev F, OCHMO-TB-003 / TB-004. Hover a reading for limits and sources. Cabin readings do not change body status.
      </p>
    </section>
  )
}

function Row({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label
        htmlFor={id}
        className="whitespace-nowrap text-[10px] tracking-[0.22em] text-cyan-300/80"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

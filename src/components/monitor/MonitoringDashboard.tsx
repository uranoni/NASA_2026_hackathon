import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCabinTelemetry } from '../../hooks/useCabinTelemetry'
import { useRecords } from '../../hooks/useRecords'
import {
  clampDay,
  ENV_NAME,
  evalEnv,
  evaluate,
  TH,
  VITAL_NAME,
  type Context,
  type Level,
  type ManualInput,
  type MissionEnv,
  type VitalKey,
} from '../../lib/assessment'
import { weekStatus, type PlanId } from '../../lib/exercise'
import {
  DAY_MS,
  dataGaps,
  demoFeed,
  FEED_GROUPS,
  latest,
  nextPfeDay,
  parseFhir,
  series,
  SYMPTOM_NAME,
  type FeedKey,
  type Obs,
} from '../../lib/feed'
import { dayKey } from '../../lib/records'
import type { OrganId } from '../../types/telemetry'
import { TelemetryScene } from '../scene/TelemetryScene'

/**
 * 太空人健康監測（資料進來之後）
 *
 * - 不做量測、沒有手動輸入：資料視為 NASA 既有管道送進來的 FHIR Observation（src/lib/feed.ts）。
 *   Demo 用示範資料，或匯入 FHIR Bundle（資料進來的接口）。
 * - 判斷沿用 src/lib/assessment.ts（有出處的門檻與太空修正）。
 * - 版面依 NASA 組員介面原則：一眼看到整體狀態；顏色一律搭配圖示與文字；超出範圍的數值後加 ↑↓。
 * - 3D 人體縮小成索引：點部位只篩選下方指標。
 * 舊的 HUD 畫面仍在：網址加 ?view=hud。
 */

type Lv = Level | 'info' | 'none' | 'gap'

const LV_TEXT: Record<Lv, string> = { ok: 'Normal', warn: 'Attention', bad: 'Action needed', info: 'Record only', none: 'No data', gap: 'Data gap' }
const LV_COLOR: Record<Lv, string> = {
  ok: 'text-emerald-400',
  warn: 'text-yellow-300',
  bad: 'text-red-400',
  info: 'text-sky-300',
  none: 'text-slate-400',
  gap: 'text-slate-300',
}

function StatusIcon({ lv, className = '' }: { lv: Lv; className?: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <span className={`inline-flex shrink-0 ${LV_COLOR[lv]} ${className}`} aria-label={LV_TEXT[lv]} title={LV_TEXT[lv]}>
      {lv === 'ok' && (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      )}
      {lv === 'warn' && (
        <svg {...common}>
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17v.01" />
        </svg>
      )}
      {lv === 'bad' && (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      )}
      {lv === 'info' && (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8v.01" />
        </svg>
      )}
      {lv === 'none' && (
        <svg {...common}>
          <path d="M6 12h12" />
        </svg>
      )}
      {lv === 'gap' && (
        <svg {...common}>
          <path d="M7 12h4M13 12h4" />
          <path d="M4 7l16 10" />
        </svg>
      )}
    </span>
  )
}

function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-slate-300">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Sparkline({ values, lv }: { values: number[]; lv: Lv }) {
  if (values.length < 2) return <span className="text-slate-500">—</span>
  const lo = Math.min(...values),
    hi = Math.max(...values),
    span = hi - lo || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 70},${16 - ((v - lo) / span) * 14 + 1}`).join(' ')
  const stroke = lv === 'warn' ? '#fde047' : lv === 'bad' ? '#f87171' : '#94a3b8'
  return (
    <svg width="72" height="18" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function when(o: Obs | null, today: number) {
  if (!o) return '—'
  if (o.day === today) return `Today ${hhmm(o.t)}`
  if (o.day === today - 1) return `Yesterday ${hhmm(o.t)}`
  return `Day ${o.day}`
}

/** 指標表的每一列：feed 的哪個資料、對應 assessment 的哪個判斷、怎麼顯示 */
type Row = { key: FeedKey; vit?: VitalKey; name: string; value: (o: Obs) => string; range: string; trend?: FeedKey }

/** 3D 部位 → 相關指標（點部位只篩選，不改判斷） */
const REGION_KEYS: Record<OrganId, FeedKey[]> = {
  brain: ['sleep', 'mood', 'symptoms'],
  eyes: [],
  neck: [],
  heart: ['hr', 'sbp', 'k', 'exercise'],
  lungs: ['spo2'],
  limbs: ['exercise'],
}
const REGION_LABEL: Record<OrganId, string> = { brain: 'Head / brain', eyes: 'Eyes', neck: 'Neck', heart: 'Heart', lungs: 'Lungs', limbs: 'Limbs' }

const IMPORT_KEY = 'astroHealth.feedImport.v1'
const SENT_KEY = 'astroHealth.downlinkAt.v1'
function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeStore(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch (err) {
    console.warn('[monitor] save failed', err)
  }
}

export default function MonitoringDashboard() {
  const rec = useRecords()
  const { day, env } = rec.records.settings
  const ctx: Context = useMemo(() => ({ day, env, act: 'work' }), [day, env])

  // 每分鐘重算（跨過午夜換日、「今天」的判斷）
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // ---------- 資料來源：示範資料或匯入的 FHIR Bundle ----------
  const [imported, setImported] = useState<Obs[]>(() => readStore<Obs[]>(IMPORT_KEY, []))
  const [mode, setMode] = useState<'demo' | 'import'>(() => (readStore<Obs[]>(IMPORT_KEY, []).length ? 'import' : 'demo'))
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const obs = useMemo(() => (mode === 'demo' ? demoFeed(day, env, new Date(now)) : imported), [mode, imported, day, env, now])

  const onImport = async (file: File) => {
    try {
      const { obs: got, skipped } = parseFhir(JSON.parse(await file.text()), day)
      if (!got.length) throw new Error('no supported Observations found')
      setImported(got)
      writeStore(IMPORT_KEY, got)
      setMode('import')
      setImportMsg(`Imported ${got.length} observations${skipped ? ` (${skipped} skipped)` : ''}`)
    } catch (err) {
      setImportMsg(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ---------- 資料 → 判斷 ----------
  const L = (k: FeedKey) => latest(obs, k)
  const symToday = (() => {
    const s = L('symptoms')
    return s && s.day === day ? (s.tags ?? []) : []
  })()
  const sleepObs = L('sleep')
  const waterObs = L('water')
  const checkins = useMemo(() => {
    const c: Record<string, { exercise_done: boolean; exercise_at: string; exercise_plan?: PlanId }> = {}
    for (const o of obs) if (o.key === 'exercise' && o.v) c[dayKey(new Date(o.t))] = { exercise_done: true, exercise_at: new Date(o.t).toISOString(), exercise_plan: o.plan }
    return c
  }, [obs])
  const week = useMemo(() => weekStatus(checkins, new Date(now)), [checkins, now])

  const input: ManualInput = {
    hr: L('hr')?.v ?? null,
    sbp: L('sbp')?.v ?? null,
    dbp: L('dbp')?.v ?? null,
    temp: L('temp')?.v ?? null,
    spo2: L('spo2')?.v ?? null,
    glu: L('glu')?.v ?? null,
    gluctx: 'fast',
    k: L('k')?.v ?? null,
    // 睡眠看昨晚或今天的紀錄；飲水只算今天
    sleep: sleepObs && sleepObs.day >= day - 1 ? sleepObs.v : null,
    water: waterObs && waterObs.day === day ? waterObs.v : null,
    mood: L('mood')?.v ?? null,
    fatigue: L('fatigue')?.v ?? null,
    irreg: symToday.includes('irreg'),
    palp: symToday.includes('palp'),
    dizzy: symToday.includes('dizzy'),
    head: symToday.includes('head'),
    naus: symToday.includes('naus'),
    cantdx: symToday.includes('cantdx'),
    exercise_done: !week.warn,
    exercise_week: week.sessions,
    exercise_suggest: week.nextPlan,
    exercise_doneA: week.doneA,
    exercise_doneB: week.doneB,
  }
  const a = useMemo(() => evaluate(ctx, input), [ctx, JSON.stringify(input)]) // eslint-disable-line react-hooks/exhaustive-deps
  const gaps = useMemo(() => dataGaps(obs, day), [obs, day])

  // ---------- 自動傳回地面（示範：不會真的傳送） ----------
  const cabin = useCabinTelemetry()
  const [sentAt, setSentAt] = useState<number>(() => readStore<number>(SENT_KEY, 0))
  const [lastBatch, setLastBatch] = useState<{ t: number; n: number; cabin: boolean } | null>(null)
  useEffect(() => {
    const fresh = obs.filter((o) => o.t > sentAt)
    if (!fresh.length) return
    const t = Date.now()
    const cabinCards = evalEnv(cabin.readings(), 'work').cards
    setLastBatch({ t, n: fresh.length, cabin: cabinCards.length > 0 })
    setSentAt(t)
    writeStore(SENT_KEY, t)
    console.log('[monitor]', `auto-downlink (demo): ${fresh.length} observations${cabinCards.length ? ' + cabin snapshot' : ''}`)
  }, [obs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 3D 部位篩選 ----------
  const [selected, setSelected] = useState<OrganId | null>(null)
  const [resetToken, setResetToken] = useState(0)

  // ---------- 畫面資料 ----------
  const vitLv = (k?: VitalKey): Lv => {
    const v = k ? a.vit[k] : undefined
    return v ? v.lv : 'none'
  }
  const issues = (Object.keys(a.vit) as VitalKey[]).filter((k) => a.vit[k]?.lv === 'warn' || a.vit[k]?.lv === 'bad')
  const overall: Lv = a.hasData ? a.overall : 'none'
  const findings = useMemo(() => {
    const seen = new Set<string>()
    const out: { level: Level; text: string; src: string }[] = []
    for (const list of Object.values(a.body)) for (const f of list) if (f.level !== 'ok' && !seen.has(f.text)) {
      seen.add(f.text)
      out.push(f)
    }
    return out.sort((x, y) => (x.level === 'bad' ? -1 : 0) - (y.level === 'bad' ? -1 : 0))
  }, [a])
  const actions = a.advice.filter((x) => x.lv !== 'ok')

  const R = a.R
  const ROWS: Record<string, Row[]> = {
    daily: [
      { key: 'sleep', vit: 'sleep', name: 'Sleep', value: (o) => `${o.v.toFixed(1)} h`, range: `≥ ${TH.sleepOk} h` },
      { key: 'water', vit: 'hydra', name: 'Water intake', value: (o) => `${o.v.toLocaleString()} ml`, range: `≥ ${TH.waterMin.toLocaleString()} ml / day` },
    ],
    self: [
      {
        key: 'mood',
        vit: 'mood',
        name: 'Mood / fatigue',
        value: (o) => `${o.v}/5 · ${L('fatigue')?.v ?? '—'}/7`,
        range: 'No public threshold',
      },
      {
        key: 'symptoms',
        vit: 'sym',
        name: 'Symptoms',
        value: (o) => (o.day === day ? (o.tags?.length ? o.tags.map((s) => SYMPTOM_NAME[s]).join(', ') : 'None') : 'None today'),
        range: 'Report any',
      },
      { key: 'exercise', name: 'Exercise sessions', value: () => `${week.sessions} of last 7 days`, range: '6 days / week' },
    ],
    pfe: [
      { key: 'hr', vit: 'hr', name: 'Heart rate', value: (o) => `${Math.round(o.v)} bpm`, range: `${TH.hr[0]}–${TH.hr[1]} bpm` },
      {
        key: 'sbp',
        vit: 'bp',
        name: 'Blood pressure',
        value: (o) => `${o.v}/${L('dbp')?.v ?? '—'} mmHg`,
        range: `${R.sbpLow}–${TH.bpHi[0] - 1} / ${R.dbpLow}–${TH.bpHi[1] - 1}${R.bpOff ? ' (adjusted)' : ''}`,
      },
    ],
    sick: [
      {
        key: 'temp',
        vit: 'temp',
        name: 'Body temperature',
        value: (o) => `${o.v.toFixed(1)} °C`,
        range: `${TH.tempVLow.toFixed(1)}–${(R.fever - 0.1).toFixed(1)} °C${R.tOff >= 0.05 ? ' (adjusted)' : ''}`,
      },
      { key: 'spo2', vit: 'spo2', name: 'SpO₂', value: (o) => `${Math.round(o.v)} %`, range: `≥ ${TH.spo2} %` },
      { key: 'glu', vit: 'glu', name: 'Glucose', value: (o) => `${o.v} mg/dL`, range: `${TH.gluL1}–${TH.gluFastHi - 1} mg/dL (fasting)` },
      { key: 'k', vit: 'k', name: 'Potassium', value: (o) => `${o.v.toFixed(1)} mmol/L`, range: `${TH.k[0]}–${TH.k[1]} mmol/L` },
    ],
  }
  const rowLv = (r: Row): Lv => (r.key === 'exercise' ? (week.warn ? 'warn' : 'ok') : vitLv(r.vit))
  const shown = selected ? REGION_KEYS[selected] : null

  const groupStatus = (g: (typeof FEED_GROUPS)[number]) => {
    const last = g.keys.map((k) => latest(obs, k)).filter(Boolean).sort((x, y) => y!.t - x!.t)[0] ?? null
    const gap = gaps.find((x) => g.keys.includes(x.key as FeedKey) || (g.id === 'pfe' && x.key === 'pfe'))
    if (gap) return { lv: 'gap' as Lv, text: g.id === 'daily' ? 'Missing today' : 'Overdue' }
    if (g.id === 'pfe') return { lv: 'ok' as Lv, text: `Last ${when(last, day)} · next day ${nextPfeDay(day + 1)}` }
    return { lv: last ? ('ok' as Lv) : ('none' as Lv), text: last ? `Last ${when(last, day)}` : 'Nothing yet' }
  }

  const reasons = [...issues.map((k) => VITAL_NAME[k]), ...(gaps.length ? [`${gaps.length} data gap${gaps.length > 1 ? 's' : ''}`] : [])]
  const barTone =
    overall === 'bad'
      ? 'border-red-500/70 bg-red-950/60 text-red-200'
      : overall === 'warn'
        ? 'border-yellow-400/70 bg-yellow-950/50 text-yellow-100'
        : overall === 'ok'
          ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-100'
          : 'border-slate-600 bg-slate-900 text-slate-200'
  const lastReceived = obs.length ? Math.max(...obs.map((o) => o.t)) : null

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-slate-100" style={{ fontFamily: 'system-ui, "Segoe UI", sans-serif' }}>
      <div className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
        {/* 標題 */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold">Crew Health Monitor</h1>
          <a className="text-xs text-slate-400 underline hover:text-slate-200" href="?view=hud">
            Previous 3D HUD view
          </a>
        </div>

        {/* 整體狀態（NASA-STD-3001 V2 附錄 F：顏色＋圖示＋文字） */}
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${barTone}`}>
          <StatusIcon lv={overall} className="scale-125" />
          <span className="text-lg font-semibold">
            {overall === 'none' ? 'No data yet' : overall === 'ok' ? 'All normal' : `${LV_TEXT[overall]}: ${issues.length} item${issues.length === 1 ? '' : 's'}`}
          </span>
          {reasons.length > 0 && <span className="text-sm opacity-90">{reasons.join(' · ')}</span>}
        </div>

        {/* 情境與資料狀態 */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-400">
          <label className="flex items-center gap-1.5">
            Mission day
            <input
              type="number"
              min={1}
              max={1200}
              value={day}
              onChange={(e) => rec.updateSettings({ day: clampDay(Number(e.target.value)) })}
              className="w-16 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Location
            <select
              value={env}
              onChange={(e) => rec.updateSettings({ env: e.target.value as MissionEnv })}
              className="rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-slate-100"
            >
              {(Object.keys(ENV_NAME) as MissionEnv[]).map((k) => (
                <option key={k} value={k}>
                  {ENV_NAME[k]}
                </option>
              ))}
            </select>
          </label>
          <span>Last data received: {lastReceived ? `${when(obs.find((o) => o.t === lastReceived) ?? null, day)}` : '—'}</span>
          <span>
            Downlink: {lastBatch ? `auto-sent ${hhmm(lastBatch.t)} · ${lastBatch.n} records${lastBatch.cabin ? ' + cabin snapshot' : ''}` : sentAt ? `up to date (${hhmm(sentAt)})` : '—'}{' '}
            <span className="text-slate-500">(demo, not transmitted)</span>
          </span>
          <span className="flex items-center gap-1.5">
            Input:{' '}
            <span className={mode === 'demo' ? 'text-sky-300' : 'text-slate-200'}>{mode === 'demo' ? 'Demo data (simulated FHIR Observations)' : 'Imported FHIR Bundle'}</span>
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded border border-slate-600 px-1.5 py-0.5 text-slate-200 hover:bg-slate-800">
              Import FHIR…
            </button>
            {mode === 'import' && (
              <button type="button" onClick={() => setMode('demo')} className="rounded border border-slate-600 px-1.5 py-0.5 text-slate-200 hover:bg-slate-800">
                Use demo data
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json,application/fhir+json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImport(f)
                e.target.value = ''
              }}
            />
          </span>
          {importMsg && <span className="text-slate-300">{importMsg}</span>}
        </div>

        <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
          {/* 人體索引 */}
          <Panel
            title="Body (select to filter)"
            right={
              selected && (
                <button
                  type="button"
                  className="text-xs text-slate-400 underline"
                  onClick={() => {
                    setSelected(null)
                    setResetToken((n) => n + 1)
                  }}
                >
                  Show all
                </button>
              )
            }
          >
            <div className="h-[320px] overflow-hidden rounded-lg">
              <TelemetryScene
                heartRate={input.hr ?? 70}
                spo2={input.spo2 ?? 98}
                respRate={14}
                muscleFatigue={20}
                selected={selected}
                onSelect={setSelected}
                scanEnabled={false}
                emergency={false}
                resetToken={resetToken}
                levels={a.level}
                limbParts={a.limbParts}
                alert={a.overall === 'bad'}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400">{selected ? `Showing items for: ${REGION_LABEL[selected]}` : 'Highlighted parts have findings.'}</p>
          </Panel>

          {/* 警示與行動 */}
          <Panel title="Alerts and actions">
            {findings.length === 0 && actions.length === 0 && gaps.length === 0 && <p className="text-sm text-slate-400">No action needed.</p>}
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.text} className={`border-l-2 pl-2 ${f.level === 'bad' ? 'border-red-400' : 'border-yellow-300'}`}>
                  <div className="flex items-start gap-1.5 text-sm">
                    <StatusIcon lv={f.level} className="mt-0.5" />
                    <span>{f.text}</span>
                  </div>
                  <div className="pl-6 text-[11px] text-slate-400">Source: {f.src}</div>
                </li>
              ))}
              {gaps.map((g) => (
                <li key={g.text} className="border-l-2 border-slate-500 pl-2">
                  <div className="flex items-start gap-1.5 text-sm text-slate-200">
                    <StatusIcon lv="gap" className="mt-0.5" />
                    <span>{g.text}</span>
                  </div>
                  <div className="pl-6 text-[11px] text-slate-400">
                    {g.since ? `Last received ${when(obs.find((o) => o.t === g.since) ?? null, day)}` : 'Never received'} · check the data source
                  </div>
                </li>
              ))}
            </ul>
            {actions.length > 0 && (
              <>
                <h3 className="mb-1 mt-3 text-[12px] font-semibold text-slate-400">What to do</h3>
                <ul className="space-y-1.5">
                  {actions.map((x) => (
                    <li key={x.text} className="flex items-start gap-1.5 text-sm">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-semibold ${
                          x.to === 'self' ? 'bg-sky-900/70 text-sky-200' : 'bg-red-900/60 text-red-200'
                        }`}
                      >
                        {x.to === 'self' ? 'SELF' : 'REPORT'}
                      </span>
                      <span>{x.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-3 text-[11px] text-slate-500">Reminders, triage and reporting only. No diagnosis, no medication advice.</p>
          </Panel>

          {/* 資料接收狀態 */}
          <Panel title="Data received">
            <ul className="space-y-2 text-sm">
              {FEED_GROUPS.map((g) => {
                const s = groupStatus(g)
                return (
                  <li key={g.id} className="border-b border-slate-800 pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span>{g.name}</span>
                      <StatusIcon lv={s.lv} />
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Expected: {g.expect} · {s.text}
                    </div>
                    <div className="text-[11px] text-slate-500">Source: {g.src}</div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Data is supplied by NASA’s existing onboard channels as FHIR Observations; this system does not take measurements.
            </p>
          </Panel>
        </div>

        {/* 指標表 */}
        <Panel title="Indicators" right={<span className="text-[11px] text-slate-500">30-day trend · ranges include spaceflight adjustments where published</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-[12px] text-slate-400">
                  <th className="py-1.5 pr-2 font-medium">Item</th>
                  <th className="py-1.5 pr-2 font-medium">Latest</th>
                  <th className="py-1.5 pr-2 font-medium">Normal range</th>
                  <th className="py-1.5 pr-2 font-medium">Status</th>
                  <th className="py-1.5 pr-2 font-medium">Trend</th>
                  <th className="py-1.5 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {FEED_GROUPS.map((g) => {
                  const rows = (ROWS[g.id] ?? []).filter((r) => !shown || shown.includes(r.key))
                  if (!rows.length) return null
                  return [
                    <tr key={g.id}>
                      <td colSpan={6} className="pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {g.name}
                      </td>
                    </tr>,
                    ...rows.map((r) => {
                      const o = latest(obs, r.key)
                      const lv = rowLv(r)
                      const v = r.vit ? a.vit[r.vit] : undefined
                      const trend = series(obs, r.key, 30, now).map((x) => x.v)
                      return (
                        <tr key={r.key} className="border-b border-slate-800">
                          <td className="py-1.5 pr-2">{r.name}</td>
                          <td className={`py-1.5 pr-2 font-semibold tabular-nums ${lv === 'warn' || lv === 'bad' ? LV_COLOR[lv] : ''}`}>
                            {o ? r.value(o) : <span className="font-normal text-slate-500">—</span>}
                            {v?.dir && <span className="ml-1">{v.dir === 'hi' ? '↑' : '↓'}</span>}
                          </td>
                          <td className="py-1.5 pr-2 text-slate-300">{r.range}</td>
                          <td className="py-1.5 pr-2">
                            <span className="flex items-center gap-1 text-[12px]">
                              <StatusIcon lv={lv} />
                              <span className={LV_COLOR[lv]}>{LV_TEXT[lv]}</span>
                            </span>
                          </td>
                          <td className="py-1.5 pr-2">{r.key === 'symptoms' || r.key === 'exercise' ? <span className="text-slate-500">—</span> : <Sparkline values={trend} lv={lv} />}</td>
                          <td className="py-1.5 text-[12px] text-slate-400">{when(o, day)}</td>
                        </tr>
                      )
                    }),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Thresholds and sources: src/lib/assessment.ts (MedlinePlus, NHLBI, CDC, ADA 2026, AASM/SRS, NASA-STD-3001; spaceflight adjustments Stahn 2017, Norsk
            2015). Items without a published threshold are recorded only.
          </p>
        </Panel>

        <p className="pb-4 text-center text-[11px] text-slate-500">
          Screen updated {hhmm(now)} · each value shows when it was received
          {lastReceived && now - lastReceived > DAY_MS ? ` · newest data is ${Math.floor((now - lastReceived) / DAY_MS)} day(s) old` : ''}
        </p>
      </div>
    </div>
  )
}

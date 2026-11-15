import { useCallback, useEffect, useRef, useState } from 'react'
import { MMHG_PER_PSI, type EnvReadings } from '../lib/assessment'

/**
 * ISS 艙內即時遙測（NASA ISSLIVE，經 Lightstreamer 公開推送）。從 iss_demo.html 移植。
 * 模擬情境已移除：人體判斷不使用艙內數值（新版原則），模擬只會改左下角顯示，使用者決定拿掉。
 * 函式庫由 index.html 的 <script>（unpkg lightstreamer-client-web@9.2.1）載入，掛在 window 上。
 */
const IDS = {
  labO2: 'USLAB000053',
  labCO2: 'USLAB000055',
  n3O2: 'NODE3000001',
  n3CO2: 'NODE3000003',
  press: 'USLAB000058',
  temp: 'USLAB000059',
  water: 'NODE3000009',
  time: 'TIME_000001',
} as const
type Key = keyof typeof IDS
type ValueKey = Exclude<Key, 'time'>

const STALE_MS = 15000
const HOUR = 3600e3

export type CabinStatus = {
  /** 函式庫是否載入 */
  libLoaded: boolean
  /** 連線狀態文字 */
  conn: 'connecting' | 'connected' | 'disconnected' | 'unavailable'
  /** ISS 訊號：null＝還沒收到、true＝正常、false＝中斷或資料過舊 */
  signal: boolean | null
  gmt: string
}

type Point = { t: number; v: number }

function log(msg: string) {
  console.log('[ISS cabin]', msg)
}

function avg1h(s: Point[] | undefined): number | null {
  if (!s || !s.length) return null
  const now = Date.now(),
    start = Math.max(now - HOUR, s[0].t)
  let sum = 0,
    dur = 0
  for (let i = 0; i < s.length; i++) {
    const a = Math.max(s[i].t, start),
      b = i + 1 < s.length ? s[i + 1].t : now
    if (b > a) {
      sum += s[i].v * (b - a)
      dur += b - a
    }
  }
  return dur > 0 ? sum / dur : s[s.length - 1].v
}

function pressureChange(s: Point[] | undefined) {
  if (!s || s.length < 2) return { delta: 0, rate: 0 }
  const now = Date.now(),
    win = s.filter((p) => p.t >= now - 60000)
  if (win.length < 2) return { delta: 0, rate: 0 }
  const d = win[win.length - 1].v - win[0].v,
    mins = Math.max((win[win.length - 1].t - win[0].t) / 60000, 1 / 60)
  return { delta: d, rate: Math.abs(d) / MMHG_PER_PSI / mins }
}

export function useCabinTelemetry() {
  const raw = useRef<Partial<Record<ValueKey, number>>>({})
  const series = useRef<Partial<Record<ValueKey, Point[]>>>({})
  const lastTimeMsg = useRef(0)
  const [status, setStatus] = useState<CabinStatus>({ libLoaded: true, conn: 'connecting', signal: null, gmt: '—' })
  // 有新資料時遞增，讓畫面重算
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const LS = window.LightstreamerClient,
      Sub = window.Subscription
    if (!LS || !Sub) {
      log('錯誤：Lightstreamer 函式庫沒有載入（可能沒有網路，或 unpkg.com 被擋）。艙內只能用模擬情境展示。')
      setStatus((s) => ({ ...s, libLoaded: false, conn: 'unavailable' }))
      return
    }
    const client = new LS('https://push.lightstreamer.com', 'ISSLIVE')
    client.addListener({
      onStatusChange: (st: string) => {
        log('連線狀態：' + st)
        const conn = st.startsWith('CONNECTED') ? 'connected' : st.startsWith('DISCONNECTED') ? 'disconnected' : 'connecting'
        setStatus((s) => ({ ...s, conn }))
      },
      onServerError: (code: number, msg: string) => log(`伺服器錯誤 ${code}：${msg}`),
    })
    const keyOf = Object.fromEntries(Object.entries(IDS).map(([k, v]) => [v, k])) as Record<string, Key>
    const sub = new Sub('MERGE', Object.values(IDS), ['Value', 'Status.Class', 'CalibratedData'])
    sub.addListener({
      onSubscription: () => log(`訂閱成功，共 ${Object.keys(IDS).length} 個項目`),
      onSubscriptionError: (code: number, msg: string) => log(`訂閱失敗 ${code}：${msg}`),
      onItemUpdate: (u) => {
        const key = keyOf[u.getItemName()]
        if (!key) return
        if (key === 'time') {
          lastTimeMsg.current = Date.now()
          // 依 ISS Mimic 慣例：24 = 有訊號（推論）
          const ok = u.getValue('Status.Class') === '24'
          setStatus((s) => {
            if (s.signal !== ok) log('ISS 訊號：' + (ok ? '正常' : '中斷'))
            return { ...s, signal: ok, gmt: u.getValue('CalibratedData') || '—' }
          })
          return
        }
        const text = u.getValue('Value')
        const v = parseFloat(text ?? '')
        if (!Number.isFinite(v)) {
          log(`${u.getItemName()} 收到非數字：${text}`)
          return
        }
        raw.current[key] = v
        const s = (series.current[key] ||= [])
        s.push({ t: Date.now(), v })
        const cut = Date.now() - HOUR
        while (s.length > 1 && s[1].t < cut) s.shift()
        setTick((n) => n + 1)
      },
    })
    client.subscribe(sub)
    client.connect()

    // 15 秒沒收到時間訊號就標成資料過舊；也讓 1 小時平均隨時間更新
    const id = window.setInterval(() => {
      if (lastTimeMsg.current && Date.now() - lastTimeMsg.current > STALE_MS) {
        setStatus((s) => (s.signal === false ? s : { ...s, signal: false }))
      }
      setTick((n) => n + 1)
    }, 5000)

    return () => {
      window.clearInterval(id)
      client.unsubscribe(sub)
      client.disconnect()
    }
  }, [])

  const readings = useCallback((): EnvReadings => {
    const r = raw.current
    const a1 = avg1h(series.current.labCO2),
      a2 = avg1h(series.current.n3CO2)
    const first = series.current.labCO2?.[0]
    return {
      labO2: r.labO2 ?? null,
      labCO2: r.labCO2 ?? null,
      n3O2: r.n3O2 ?? null,
      n3CO2: r.n3CO2 ?? null,
      press: r.press ?? null,
      temp: r.temp ?? null,
      water: r.water ?? null,
      co2Avg: a1 == null && a2 == null ? null : Math.max(a1 ?? 0, a2 ?? 0),
      pChg: pressureChange(series.current.press),
      co2Minutes: first ? Math.round((Date.now() - first.t) / 60000) : 0,
      sim: false,
    }
    // tick 讓 readings 在新資料進來時換一個新函式，使用端會重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  return { readings, status }
}

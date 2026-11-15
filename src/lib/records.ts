/**
 * 紀錄（只存在這台瀏覽器的 localStorage，使用者選定）：任務設定、生命徵象快照、艙內環境快照，
 * 以及留給隊友接的每日打卡欄位。
 *
 * 為什麼只用 localStorage：demo 要放 GitHub Pages（只有靜態網頁、沒有後端）。
 * 限制：每台瀏覽器各一份；清除瀏覽資料就不見；不同評審看不到彼此的紀錄。
 *
 * 失敗處理：讀取失敗 → 退回空白紀錄並記 console；寫入超過容量 → 丟掉最舊的一半快照再試一次，仍失敗就記 console。
 * 任何失敗都不影響畫面其他功能。
 */
import type { Activity, Assessment, EnvCard, Level, MissionEnv, VitalKey } from './assessment'
import { clampDay } from './assessment'

const KEY = 'astroHealth.records.v1'
/** 舊的設定位置（第 2 步用過，也和新版 iss_demo(1).html 共用）；第一次載入時搬過來 */
const LEGACY_SETTINGS_KEY = 'astroHealth.settings.v1'
/** 快照最多保留筆數：每分鐘一筆約 8 小時；每筆約 0.5 KB，500 筆約 250 KB，遠低於 localStorage 約 5 MB 的上限 */
export const MAX_SNAPSHOTS = 500
/** 自動快照間隔 */
export const SNAPSHOT_EVERY_MS = 60_000

export type CabinChoice = 'none' | 'iss'
export type Settings = { day: number; env: MissionEnv; cabin: CabinChoice }

export type Snapshot = {
  /** ISO 時間 */
  t: string
  ctx: { day: number; env: MissionEnv; act: Activity }
  vitals: { hr: number; sbp: number; dbp: number; spo2: number; temp: number; sleep: number }
  /** 當下的判斷結果：整體等級＋各項等級（只記錄有判斷的項目） */
  status: { overall: Level; vit: Partial<Record<VitalKey, Level | 'info'>> }
  /** 艙內環境（CABIN DATA 選 ISS 且有收到資料時才有）；stale＝ISS 訊號中斷，數值可能過舊 */
  cabin?: { stale: boolean; values: Partial<Record<EnvCard['key'], number>> }
  /** 是否為按下 SIMULATE EMERGENCY 時的假數據 */
  emergency: boolean
}

/**
 * 每日打卡：交給隊友實作，這裡只留欄位和存取函式。
 * key 用本地日期 yyyy-mm-dd，內容格式由打卡功能自行決定（建議 { exercise: boolean | null, sleep: 'sad' | 'neutral' | 'happy' | null }）。
 * 使用方式：import { getCheckin, saveCheckin } from './records'
 */
export type CheckinEntry = Record<string, unknown>

export type Records = {
  version: 1
  settings: Settings
  snapshots: Snapshot[]
  checkins: Record<string, CheckinEntry>
}

const DEFAULT_SETTINGS: Settings = { day: 45, env: 'iss', cabin: 'iss' }
const ENVS: MissionEnv[] = ['iss', 'transit', 'moon', 'mars', 'ground']

function log(msg: string, err?: unknown) {
  if (err) console.warn('[records]', msg, err)
  else console.log('[records]', msg)
}

function cleanSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    day: clampDay(Number(raw?.day) || DEFAULT_SETTINGS.day),
    env: raw?.env && ENVS.includes(raw.env) ? raw.env : DEFAULT_SETTINGS.env,
    cabin: raw?.cabin === 'none' ? 'none' : 'iss',
  }
}

function empty(): Records {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, snapshots: [], checkins: {} }
}

export function loadRecords(): Records {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Records> | null
    if (!raw) {
      // 第一次：搬舊設定（第 2 步存在 astroHealth.settings.v1）
      const legacy = JSON.parse(localStorage.getItem(LEGACY_SETTINGS_KEY) || 'null')
      const r = empty()
      if (legacy) {
        r.settings = cleanSettings({ ...legacy, cabin: 'iss' })
        log(`已從舊設定搬入：第 ${r.settings.day} 天、${r.settings.env}`)
      }
      return r
    }
    return {
      version: 1,
      settings: cleanSettings(raw.settings),
      snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
      checkins: raw.checkins && typeof raw.checkins === 'object' ? raw.checkins : {},
    }
  } catch (err) {
    // 下一次儲存就會蓋掉原本的資料，所以先把讀不懂的原始內容另存一份，之後可以手動救回
    try {
      const raw = localStorage.getItem(KEY)
      if (raw != null) localStorage.setItem(KEY + '.corrupt-backup', raw)
      log(`讀取紀錄失敗，改用空白紀錄；原始內容已備份到 localStorage「${KEY}.corrupt-backup」`, err)
    } catch (err2) {
      log('讀取紀錄失敗，備份原始內容也失敗', err2)
    }
    return empty()
  }
}

export function saveRecords(r: Records): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
    return true
  } catch (err) {
    // 多半是容量不足：丟掉最舊的一半快照再試一次
    if (r.snapshots.length > 1) {
      const before = r.snapshots.length
      r.snapshots = r.snapshots.slice(Math.floor(before / 2))
      try {
        localStorage.setItem(KEY, JSON.stringify(r))
        log(`儲存空間不足，已刪除最舊的 ${before - r.snapshots.length} 筆快照`, err)
        return true
      } catch (err2) {
        log('儲存紀錄失敗（刪減快照後仍失敗）', err2)
        return false
      }
    }
    log('儲存紀錄失敗', err)
    return false
  }
}

/** 建立一筆快照（不寫入；由呼叫端決定何時存） */
export function makeSnapshot(
  ctx: Snapshot['ctx'],
  vitals: Snapshot['vitals'],
  a: Assessment,
  cabinCards: EnvCard[] | null,
  cabinStale: boolean,
  emergency: boolean,
): Snapshot {
  const vit: Snapshot['status']['vit'] = {}
  for (const [k, v] of Object.entries(a.vit)) if (v) vit[k as VitalKey] = v.lv
  const snap: Snapshot = {
    t: new Date().toISOString(),
    ctx: { ...ctx },
    vitals: {
      hr: Math.round(vitals.hr),
      sbp: vitals.sbp,
      dbp: vitals.dbp,
      spo2: +vitals.spo2.toFixed(1),
      temp: +vitals.temp.toFixed(2),
      sleep: vitals.sleep,
    },
    status: { overall: a.overall, vit },
    emergency,
  }
  if (cabinCards && cabinCards.length) {
    const values: NonNullable<Snapshot['cabin']>['values'] = {}
    for (const c of cabinCards) values[c.key] = +c.val.toFixed(c.digits)
    snap.cabin = { stale: cabinStale, values }
  }
  return snap
}

/** 加一筆快照，超過上限就丟掉最舊的 */
export function addSnapshot(r: Records, s: Snapshot): Records {
  const snapshots = [...r.snapshots, s].slice(-MAX_SNAPSHOTS)
  return { ...r, snapshots }
}

export function getCheckin(r: Records, dateKey: string): CheckinEntry | undefined {
  return r.checkins[dateKey]
}

export function saveCheckin(r: Records, dateKey: string, entry: CheckinEntry): Records {
  return { ...r, checkins: { ...r.checkins, [dateKey]: entry } }
}

/** 清除快照（設定與打卡保留）。畫面上要先確認才呼叫 [V2 10080] */
export function clearSnapshots(r: Records): Records {
  return { ...r, snapshots: [] }
}

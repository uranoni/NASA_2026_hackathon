import { useCallback, useEffect, useState } from 'react'
import {
  addSnapshot,
  clearSnapshots,
  loadRecords,
  reportExercise,
  reportSleep,
  resetTodayExercise,
  saveRecords,
  type Records,
  type Settings,
  type Snapshot,
} from '../lib/records'
import type { FhirObservation, PlanId } from '../lib/exercise'
import type { FitnessResult } from '../lib/fitness'
import type { SleepMood, SleepObservation } from '../lib/sleep'

/** 紀錄狀態：載入一次、每次變更就寫回 localStorage（src/lib/records.ts） */
export function useRecords() {
  const [records, setRecords] = useState<Records>(loadRecords)
  const [saveOk, setSaveOk] = useState(true)

  // 每次紀錄變更就存；失敗時面板會顯示（原因在 console）
  useEffect(() => {
    setSaveOk(saveRecords(records))
  }, [records])

  /** fitness：目前收到的最新適任測驗結果；還沒記過的話會附在這一筆上（lib/fitness.ts） */
  const add = useCallback(
    (s: Snapshot, fitness?: FitnessResult | null) => setRecords((r) => addSnapshot(r, s, fitness)),
    [],
  )

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setRecords((r) => {
      const settings = { ...r.settings, ...patch }
      console.log('[records]', `設定：任務第 ${settings.day} 天、環境 ${settings.env}、艙內資料 ${settings.cabin}`)
      return { ...r, settings }
    })
  }, [])

  const report = useCallback((plan: PlanId, items: string[], obs: FhirObservation) => {
    setRecords((r) => {
      console.log('[records]', `運動回報：課表 ${plan}，完成 ${items.length} 項，已放進傳回地面佇列（共 ${r.outbox.length + 1} 筆）`)
      return reportExercise(r, new Date(obs.effectiveDateTime), plan, items, obs)
    })
  }, [])

  const sleep = useCallback((mood: SleepMood, obs: SleepObservation) => {
    setRecords((r) => {
      console.log('[records]', `睡眠自評：${mood}`)
      return reportSleep(r, new Date(obs.effectiveDateTime), mood, obs)
    })
  }, [])

  const resetToday = useCallback(() => {
    setRecords((r) => {
      const { records, removed } = resetTodayExercise(r)
      console.log('[records]', `Demo：撤銷今天的每日任務（運動、睡眠），移除佇列 ${removed} 筆`)
      return records
    })
  }, [])

  const clear = useCallback(() => {
    setRecords((r) => {
      console.log('[records]', `清除 ${r.snapshots.length} 筆快照`)
      return clearSnapshots(r)
    })
  }, [])

  return { records, saveOk, add, updateSettings, report, sleep, resetToday, clear, setRecords }
}

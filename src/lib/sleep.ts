/**
 * 每日任務：睡眠自評（三種表情：😞 差、😐 普通、😊 好；使用者要求）。
 *
 * 判斷原則：睡眠「自評好壞」沒有公開的臨床門檻（新版 iss_demo(1).html 也只用睡眠時數判斷），
 * 所以只給提醒、不讓人體部位亮燈；睡眠時數的判斷仍在 assessment.ts（< 7 h 黃燈）。
 * 提醒內容沿用新版：關鍵作業前請組員複核步驟（a_sleep_self）、和地面討論作息（a_sleep_ground）、
 * 每週私人醫療會議 PMC（參考資料 [PMC]）。站上每月也有睡眠問卷 [Standard Measures]。
 */
export type SleepMood = 'sad' | 'neutral' | 'happy'

export const SLEEP_OPTIONS: { v: SleepMood; emoji: string; label: string }[] = [
  { v: 'sad', emoji: '😞', label: 'Poorly' },
  { v: 'neutral', emoji: '😐', label: 'OK' },
  { v: 'happy', emoji: '😊', label: 'Well' },
]

const LOCAL = 'urn:spaceapps:astro-health'

/** 睡眠自評 FHIR Observation（本地代碼；放進傳回地面佇列，同一天改選會取代前一筆） */
export function sleepObservation(when: Date, ctx: { day: number; env: string }, mood: SleepMood) {
  return {
    resourceType: 'Observation',
    id: `sleep-quality-${when.getTime()}`,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
    code: { coding: [{ system: LOCAL, code: 'sleep-quality-self-rated', display: 'Self-rated sleep quality (poorly / OK / well)' }] },
    subject: { reference: 'Patient/crew-self' },
    effectiveDateTime: when.toISOString(),
    valueString: mood,
    meta: { source: 'self-report' },
    extension: [
      { url: `${LOCAL}:mission-day`, valueInteger: ctx.day },
      { url: `${LOCAL}:environment`, valueCode: ctx.env },
    ],
  }
}
export type SleepObservation = ReturnType<typeof sleepObservation>

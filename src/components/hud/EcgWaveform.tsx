import { useEffect, useMemo, useState } from 'react'

type Props = {
  bpm: number
  alert?: boolean
}

/** 簡易動態 ECG 波形（依 BPM 調整週期） */
export function EcgWaveform({ bpm, alert }: Props) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % 240)
    }, 28)
    return () => window.clearInterval(id)
  }, [])

  const path = useMemo(() => {
    const w = 280
    const h = 64
    const mid = h / 2
    const cycle = Math.max(18, Math.round(3600 / Math.max(bpm, 40)))
    const pts: string[] = []

    for (let x = 0; x <= w; x += 2) {
      const t = (x + phase) % cycle
      let y = mid
      if (t < cycle * 0.12) y = mid - 2
      else if (t < cycle * 0.18) y = mid + 3
      else if (t < cycle * 0.22) y = mid - 22
      else if (t < cycle * 0.28) y = mid + 10
      else if (t < cycle * 0.36) y = mid - 4
      else if (t < cycle * 0.55) y = mid
      else if (t < cycle * 0.7) y = mid - 6
      else y = mid
      pts.push(`${x},${y}`)
    }
    return `M ${pts.join(' L ')}`
  }, [phase, bpm])

  return (
    <svg viewBox="0 0 280 64" className="h-16 w-full" aria-label="ECG waveform">
      <path d={path} className={`ecg-path ${alert ? 'alert' : ''}`} />
    </svg>
  )
}

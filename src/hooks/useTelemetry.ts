import { useCallback, useEffect, useRef, useState } from 'react'
import type { TelemetrySource, TelemetryState } from '../types/telemetry'

const BASE: TelemetryState = {
  connected: true,
  missionCode: 'EVA SUIT TELEMETRY',
  crewId: 'CREW-01',
  emergency: false,
  lastUpdate: Date.now(),
  heartRate: 72,
  spo2: 98,
  coreTemp: 36.7,
  radiationDose: 0.18,
  muscleFatigue: 22,
  respRate: 14,
  bloodPressureSys: 118,
  bloodPressureDia: 76,
  sleepHours: 7,
  moodIndex: 78,
}

/**
 * 模擬遙測 + 預留 WebSocket 介面。
 * 未來串接真實數據：傳入 { connect(onData) { const ws = new WebSocket(...); ...; return () => ws.close() } }
 */
export function useTelemetry(source?: TelemetrySource) {
  const [data, setData] = useState<TelemetryState>(BASE)
  const emergencyRef = useRef(false)

  const patch = useCallback((partial: Partial<TelemetryState>) => {
    setData((prev) => ({
      ...prev,
      ...partial,
      lastUpdate: Date.now(),
      connected: partial.connected ?? prev.connected,
    }))
  }, [])

  const setEmergency = useCallback((on: boolean) => {
    emergencyRef.current = on
    patch({ emergency: on, heartRate: on ? 128 : 72 })
  }, [patch])

  useEffect(() => {
    if (source) {
      const disconnect = source.connect(patch)
      return disconnect
    }

    const id = window.setInterval(() => {
      setData((prev) => {
        const targetHr = emergencyRef.current
          ? 118 + Math.random() * 22
          : 68 + Math.sin(Date.now() / 4000) * 6 + (Math.random() - 0.5) * 3

        const hr = prev.heartRate + (targetHr - prev.heartRate) * 0.18
        const resp = emergencyRef.current
          ? 22 + Math.random() * 4
          : 13 + Math.sin(Date.now() / 3200) * 1.5

        return {
          ...prev,
          connected: true,
          heartRate: Math.round(hr * 10) / 10,
          spo2: Math.min(
            99,
            Math.max(
              emergencyRef.current ? 92 : 96,
              prev.spo2 + (Math.random() - 0.5) * 0.4,
            ),
          ),
          coreTemp: 36.5 + Math.sin(Date.now() / 9000) * 0.25 + (emergencyRef.current ? 0.4 : 0),
          radiationDose: Math.max(0.05, prev.radiationDose + (Math.random() - 0.48) * 0.01),
          muscleFatigue: Math.min(
            95,
            Math.max(8, prev.muscleFatigue + (emergencyRef.current ? 0.4 : -0.05) + (Math.random() - 0.5) * 0.3),
          ),
          respRate: Math.round(resp * 10) / 10,
          bloodPressureSys: Math.round(112 + (hr - 70) * 0.35 + (Math.random() - 0.5) * 2),
          bloodPressureDia: Math.round(72 + (hr - 70) * 0.12 + (Math.random() - 0.5) * 1.5),
          lastUpdate: Date.now(),
        }
      })
    }, 400)

    return () => window.clearInterval(id)
  }, [source, patch])

  return { data, patch, setEmergency }
}

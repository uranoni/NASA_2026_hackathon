import AstronautTelemetryDashboard from './components/AstronautTelemetryDashboard'
import MonitoringDashboard from './components/monitor/MonitoringDashboard'

/**
 * NASA Hackathon — Astronaut health monitoring (after data)
 *
 * 預設：監測畫面（src/components/monitor/MonitoringDashboard.tsx）
 * 舊的 3D HUD：網址加 ?view=hud
 *
 * 資料由 NASA 既有管道以 FHIR Observation 送進來（src/lib/feed.ts）；Demo 用示範資料，或在畫面上匯入 FHIR Bundle。
 */
export default function App() {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'hud' ? <AstronautTelemetryDashboard /> : <MonitoringDashboard />
}

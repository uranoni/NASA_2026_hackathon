import AstronautTelemetryDashboard from './components/AstronautTelemetryDashboard'

/**
 * NASA Hackathon — Astronaut self-health visual assessment tool
 *
 * 未來串接真實遙測範例：
 * const source = {
 *   connect(onData) {
 *     const ws = new WebSocket('wss://your-telemetry.example/crew-01')
 *     ws.onmessage = (e) => onData(JSON.parse(e.data))
 *     return () => ws.close()
 *   },
 * }
 * return <AstronautTelemetryDashboard telemetrySource={source} />
 */
export default function App() {
  return <AstronautTelemetryDashboard />
}

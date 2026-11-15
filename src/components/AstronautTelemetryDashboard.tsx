import { useState } from 'react'
import { useTelemetry } from '../hooks/useTelemetry'
import type { OrganId, TelemetrySource } from '../types/telemetry'
import { RightPanel } from './hud/RightPanel'
import { TelemetryScene } from './scene/TelemetryScene'

type Props = {
  /** 預留：傳入真實 WebSocket / MQTT 遙測來源 */
  telemetrySource?: TelemetrySource
}

/**
 * 太空人即時生理數據 3D 監控儀表板
 * 視覺參考：J.A.R.V.I.S. 全息投影 HUD
 *
 * 3D 人體：public/models/astronaut-body.glb（CC0 Human Muscles）+ 全息掃描材質
 */
export default function AstronautTelemetryDashboard({ telemetrySource }: Props) {
  const { data, setEmergency } = useTelemetry(telemetrySource)
  const [selected, setSelected] = useState<OrganId | null>('heart')
  const [scanEnabled, setScanEnabled] = useState(true)
  const [resetToken, setResetToken] = useState(0)

  const alertActive = data.emergency || data.heartRate > 110

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020617]">
      {/* 背景氛圍 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse at 50% 20%, rgba(0, 80, 120, 0.28), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(0, 40, 90, 0.2), transparent 40%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,240,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.35) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />

      {/* 3D 場景 */}
      <div className="absolute inset-0">
        <TelemetryScene
          heartRate={data.heartRate}
          spo2={data.spo2}
          respRate={data.respRate}
          muscleFatigue={data.muscleFatigue}
          selected={selected}
          onSelect={setSelected}
          scanEnabled={scanEnabled}
          emergency={data.emergency}
          resetToken={resetToken}
        />
      </div>

      {/* 左上：任務代號 + 連線狀態 */}
      <header className="pointer-events-none absolute left-4 top-4 z-20 md:left-6 md:top-6">
        <div className="hud-glass hud-corner relative px-4 py-3">
          <p
            className="text-[11px] tracking-[0.32em] text-cyan-300"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {data.missionCode} // {data.crewId}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] tracking-[0.18em] text-cyan-100/80">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                data.connected ? 'status-live bg-emerald-400' : 'bg-rose-500'
              }`}
            />
            <span>{data.connected ? 'LINK ACTIVE // SUIT BUS' : 'LINK LOST'}</span>
          </div>
          <p className="mt-1 text-[10px] tracking-widest text-cyan-200/45">
            NASA HRP · SELF-ASSESSMENT HUD
          </p>
        </div>
      </header>

      {/* 右側詳細面板 */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20 max-h-[calc(100%-7.5rem)] overflow-y-auto md:right-6 md:top-6">
        <RightPanel data={data} selected={selected} />
      </div>

      {/* 底部控制列 */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 md:p-5">
        <div className="pointer-events-auto hud-glass hud-corner relative flex flex-wrap items-center justify-center gap-2 px-3 py-2.5 md:gap-3 md:px-4">
          <ControlButton
            label="RESET VIEW"
            onClick={() => {
              setSelected(null)
              setResetToken((n) => n + 1)
            }}
          />
          <ControlButton
            label={scanEnabled ? 'SCAN LINE: ON' : 'SCAN LINE: OFF'}
            active={scanEnabled}
            onClick={() => setScanEnabled((v) => !v)}
          />
          <ControlButton
            label={data.emergency ? 'CLEAR EMERGENCY' : 'SIMULATE EMERGENCY'}
            danger
            active={data.emergency}
            onClick={() => setEmergency(!data.emergency)}
          />
        </div>
      </footer>

      {/* 緊急狀態全畫面提示 */}
      {alertActive && (
        <div className="pointer-events-none absolute left-1/2 top-[4.8rem] z-20 -translate-x-1/2">
          <div className="border border-[#ff2a55]/70 bg-[#2a0610]/75 px-4 py-1.5 text-[11px] tracking-[0.28em] text-[#ff2a55] backdrop-blur-md">
            CARDIOVASCULAR ALERT // HR {data.heartRate.toFixed(0)} BPM
          </div>
        </div>
      )}
    </div>
  )
}

function ControlButton({
  label,
  onClick,
  active,
  danger,
}: {
  label: string
  onClick: () => void
  active?: boolean
  danger?: boolean
}) {
  const tone = danger
    ? active
      ? 'border-[#ff2a55] bg-[#ff2a55]/20 text-[#ff8aa5]'
      : 'border-[#ff2a55]/45 text-[#ff6b8a] hover:bg-[#ff2a55]/15'
    : active
      ? 'border-cyan-300 bg-cyan-400/15 text-cyan-50'
      : 'border-cyan-400/35 text-cyan-100/85 hover:bg-cyan-400/10'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm border px-3 py-2 text-[10px] tracking-[0.2em] transition md:text-[11px] ${tone}`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {label}
    </button>
  )
}

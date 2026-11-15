import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import type { LimbPart, Level, Region } from '../../lib/assessment'
import type { OrganId } from '../../types/telemetry'
import { HologramBody } from '../scene/HologramBody'
import { OrganModules } from '../scene/OrganModules'

/**
 * 監測頁的人體索引（簡化版 3D，舊 HUD 的 TelemetryScene 不受影響）：
 * - 只有人體：沒有星空、粒子、地板格線、光暈與暗角特效；背景透明
 * - 只能繞垂直軸左右轉（拖曳），可以轉到背面看被擋住的部位；不能上下翻、不能平移、不能縮放
 * - 3D 裡不畫文字（hideLabels），部位名稱與狀態由外面的清單顯示
 */
type Props = {
  selected: OrganId | null
  onSelect: (id: OrganId | null) => void
  onHover: (id: OrganId | null) => void
  levels: Record<Region, Level>
  limbParts: Record<LimbPart, Level>
  heartRate: number
}

/** 人體約 1.80 m 高：鏡頭對準 0.92 m（身體中段），垂直視角 34° 在 3.4 m 外可框住全身 */
const TARGET: [number, number, number] = [0, 0.92, 0]

export function BodyIndexScene({ selected, onSelect, onHover, levels, limbParts, heartRate }: Props) {
  return (
    <Canvas
      camera={{ position: [0, TARGET[1], 3.4], fov: 34, near: 0.1, far: 20 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none', cursor: 'grab' }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <pointLight position={[2, 3, 3]} intensity={1.2} color="#bfefff" />
        <pointLight position={[-2, 1.5, -2]} intensity={0.6} color="#8fb4ff" />
        <HologramBody scanEnabled={false} alertMix={0} decor={false} />
        <OrganModules
          metrics={{ heartRate, spo2: 98, respRate: 14, muscleFatigue: 20 }}
          selected={selected}
          onSelect={onSelect}
          levels={levels}
          limbParts={limbParts}
          hideLabels
          onHoverChange={onHover}
        />
        <OrbitControls
          makeDefault
          target={TARGET}
          enablePan={false}
          enableZoom={false}
          // 上下角度鎖在水平：只能繞垂直軸轉
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
          rotateSpeed={0.7}
          enableDamping
        />
      </Suspense>
    </Canvas>
  )
}

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { LimbPart, Level, Region } from '../../lib/assessment'
import type { OrganId } from '../../types/telemetry'
import { HologramBody } from '../scene/HologramBody'
import { OrganModules } from '../scene/OrganModules'

/**
 * 監測頁的人體索引（簡化版 3D，舊 HUD 的 TelemetryScene 不受影響）：
 * - 只有人體：沒有星空、粒子、地板格線、光暈與暗角特效；背景透明
 * - 左右拖曳＝繞垂直軸轉，可以轉到背面看被擋住的部位；上下拖曳＝沿身體上下移動視角；不能上下翻
 * - 滾輪／雙指可以縮放；選了部位（點模型或點下面清單）鏡頭會移到那個部位並拉近，取消選取回到全身
 * - 選取時，人體外殼與其他部位調淡，只留選取的部位亮著
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
const WHOLE_DIST = 3.4
/** 上下拖曳時視角高度的範圍：腳底到頭頂（人體約 1.80 m） */
const Y_MIN = 0.05
const Y_MAX = 1.8

/**
 * 每個部位鏡頭要對準的高度與距離。垂直視角 34° 時，畫面高度約 0.61 × 距離：
 * 頭部約 0.35 m 高 → 約 0.7 m；胸腔約 0.5 m → 約 1.0 m；四肢涵蓋全身 → 全身視角。
 * 高度取自 ORGAN_META 的模型座標（types/telemetry.ts）
 */
const FOCUS: Record<OrganId, { y: number; dist: number }> = {
  brain: { y: 1.7, dist: 0.75 },
  eyes: { y: 1.68, dist: 0.6 },
  neck: { y: 1.53, dist: 0.8 },
  heart: { y: 1.3, dist: 1.0 },
  lungs: { y: 1.32, dist: 1.1 },
  limbs: { y: 0.92, dist: 3.2 },
}

type Controls = {
  target: THREE.Vector3
  update: () => void
  addEventListener: (type: string, fn: () => void) => void
  removeEventListener: (type: string, fn: () => void) => void
}

/** 選取改變時，鏡頭平滑移到該部位（保留使用者目前轉到的角度）；使用者一開始拖曳或縮放就停止自動移動 */
function CameraRig({ selected }: { selected: OrganId | null }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const goal = useRef<{ y: number; dist: number } | null>(null)

  useEffect(() => {
    goal.current = selected ? FOCUS[selected] : { y: TARGET[1], dist: WHOLE_DIST }
  }, [selected])

  useEffect(() => {
    if (!controls) return
    controls.target.set(...TARGET)
    controls.update()
    const stop = () => {
      goal.current = null
    }
    controls.addEventListener('start', stop)
    return () => controls.removeEventListener('start', stop)
  }, [controls])

  // 上下拖曳＝沿著身體上下移動視角（左右拖曳由 OrbitControls 負責旋轉）。
  // 拉近之後才看得到身體其他部位；兩指縮放時不移動
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!controls) return
    const el = gl.domElement
    const pointers = new Map<number, number>()
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, e.clientY)
    }
    const move = (e: PointerEvent) => {
      const lastY = pointers.get(e.pointerId)
      if (lastY === undefined) return
      pointers.set(e.pointerId, e.clientY)
      if (pointers.size !== 1) return
      const dy = e.clientY - lastY
      if (!dy) return
      const cam = camera as THREE.PerspectiveCamera
      const t = controls.target
      const dist = camera.position.distanceTo(t)
      const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / el.clientHeight
      // 往下拖＝身體往下走＝視角往上
      const y = THREE.MathUtils.clamp(t.y + dy * worldPerPx, Y_MIN, Y_MAX)
      camera.position.y += y - t.y
      t.y = y
      controls.update()
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [gl, camera, controls])

  useFrame((_, delta) => {
    const g = goal.current
    if (!g || !controls) return
    const k = 1 - Math.exp(-delta * 6)
    const t = controls.target
    const offset = camera.position.clone().sub(t)
    offset.y = 0
    const dist = offset.length() || WHOLE_DIST
    const nextDist = THREE.MathUtils.lerp(dist, g.dist, k)
    t.set(THREE.MathUtils.lerp(t.x, 0, k), THREE.MathUtils.lerp(t.y, g.y, k), THREE.MathUtils.lerp(t.z, 0, k))
    camera.position.copy(t).add(offset.setLength(nextDist))
    controls.update()
    if (Math.abs(nextDist - g.dist) < 0.002 && Math.abs(t.y - g.y) < 0.002) goal.current = null
  })

  return null
}

export function BodyIndexScene({ selected, onSelect, onHover, levels, limbParts, heartRate }: Props) {
  return (
    <Canvas
      camera={{ position: [0, TARGET[1], WHOLE_DIST], fov: 34, near: 0.05, far: 20 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none', cursor: 'grab' }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <pointLight position={[2, 3, 3]} intensity={1.2} color="#bfefff" />
        <pointLight position={[-2, 1.5, -2]} intensity={0.6} color="#8fb4ff" />
        <HologramBody scanEnabled={false} alertMix={0} decor={false} dim={selected !== null} />
        <OrganModules
          metrics={{ heartRate, spo2: 98, respRate: 14, muscleFatigue: 20 }}
          selected={selected}
          onSelect={onSelect}
          levels={levels}
          limbParts={limbParts}
          hideLabels
          dimOthers
          onHoverChange={onHover}
        />
        <OrbitControls
          makeDefault
          // 不傳 target：drei 每次重繪都會把 target 設回去，上下拖曳的位置會被打回原點；初始值在 CameraRig 設一次
          enablePan={false}
          enableZoom
          zoomSpeed={0.8}
          minDistance={0.45}
          maxDistance={4.5}
          // 上下角度鎖在水平：只能繞垂直軸轉
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
          rotateSpeed={0.7}
          enableDamping
        />
        <CameraRig selected={selected} />
      </Suspense>
    </Canvas>
  )
}

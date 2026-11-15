import { Canvas, useThree } from '@react-three/fiber'
import { Grid, OrbitControls, Stars } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { OrganId } from '../../types/telemetry'
import { ORGAN_META } from '../../types/telemetry'
import { HologramBody } from './HologramBody'
import { NeuralField } from './NeuralField'
import { OrganModules } from './OrganModules'

type SceneProps = {
  heartRate: number
  spo2: number
  respRate: number
  muscleFatigue: number
  selected: OrganId | null
  onSelect: (id: OrganId | null) => void
  scanEnabled: boolean
  emergency: boolean
  resetToken: number
}

function CameraFocus({
  selected,
  resetToken,
}: {
  selected: OrganId | null
  resetToken: number
}) {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const target = useRef(new THREE.Vector3(0, 1.0, 0))
  const camGoal = useRef(new THREE.Vector3(0.4, 1.2, 3.1))

  useEffect(() => {
    if (selected) {
      const p = ORGAN_META[selected].position
      target.current.set(p[0], p[1], p[2])
      camGoal.current.set(p[0] * 0.35 + 0.3, p[1] + 0.1, 2.15)
    } else {
      target.current.set(0, 1.0, 0)
      camGoal.current.set(0.4, 1.2, 3.1)
    }
  }, [selected, resetToken])

  useEffect(() => {
    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      camera.position.lerp(camGoal.current, 0.06)
      if (controls) {
        controls.target.lerp(target.current, 0.08)
        controls.update()
      }
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [camera, controls])

  return null
}

function SceneContent(props: SceneProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const alertMix = props.emergency || props.heartRate > 110 ? 1 : 0

  return (
    <>
      <color attach="background" args={['#01060f']} />
      <fog attach="fog" args={['#01060f', 5, 14]} />

      <ambientLight intensity={0.22} />
      <pointLight position={[2.4, 3.4, 2.2]} intensity={1.6} color="#5de8ff" />
      <pointLight position={[-2.5, 1.2, -1.2]} intensity={0.7} color="#3a6cff" />
      <pointLight position={[0.2, 1.0, 2.2]} intensity={0.55} color="#9ef7ff" />
      <spotLight
        position={[0, 4, 1]}
        angle={0.45}
        penumbra={0.7}
        intensity={0.9}
        color="#7cf6ff"
        castShadow={false}
      />

      <Stars radius={70} depth={36} count={1800} factor={2.6} saturation={0} fade speed={0.45} />
      <NeuralField count={100} />

      <group position={[0, 0, 0]}>
        <HologramBody scanEnabled={props.scanEnabled} alertMix={alertMix} />
        <OrganModules
          metrics={{
            heartRate: props.heartRate,
            spo2: props.spo2,
            respRate: props.respRate,
            muscleFatigue: props.muscleFatigue,
          }}
          selected={props.selected}
          onSelect={props.onSelect}
          alert={props.emergency}
        />
      </group>

      <Grid
        position={[0, 0, 0]}
        args={[14, 14]}
        cellSize={0.4}
        cellThickness={0.45}
        cellColor="#062a40"
        sectionSize={1.6}
        sectionThickness={0.95}
        sectionColor="#0ea5b8"
        fadeDistance={11}
        fadeStrength={1.6}
        infiniteGrid
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        minDistance={1.6}
        maxDistance={5.8}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.72}
        target={[0, 1.0, 0]}
      />
      <CameraFocus selected={props.selected} resetToken={props.resetToken} />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.55}
          // 原本 0.18：幾乎全部都暈開，本體和部位糊在一起；調高後只剩部位發光
          luminanceThreshold={0.55}
          luminanceSmoothing={0.45}
          mipmapBlur
        />
        <Vignette offset={0.22} darkness={0.7} />
      </EffectComposer>
    </>
  )
}

export function TelemetryScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0.4, 1.2, 3.1], fov: 38, near: 0.1, far: 50 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
    </Canvas>
  )
}

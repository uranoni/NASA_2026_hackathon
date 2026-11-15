import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ORGAN_META, type OrganId } from '../../types/telemetry'

type Metrics = {
  heartRate: number
  spo2: number
  respRate: number
  muscleFatigue: number
}

type Props = {
  metrics: Metrics
  selected: OrganId | null
  onSelect: (id: OrganId) => void
  alert: boolean
}

/** 選中時偏琥珀高亮（對齊參考圖器官強調色），否則用系統色 */
function organTone(base: string, selected: boolean, alert = false) {
  if (alert) return '#ff2a55'
  if (selected) return '#ff9a3c'
  return base
}

function GlowMat({
  color,
  selected,
  intensity = 1,
}: {
  color: string
  selected: boolean
  intensity?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      emissiveIntensity={(selected ? 2.2 : 1.1) * intensity}
      transparent
      opacity={selected ? 0.95 : 0.82}
      roughness={0.22}
      metalness={0.35}
      depthWrite={false}
    />
  )
}

function HitProxy({
  id,
  onSelect,
}: {
  id: OrganId
  onSelect: (id: OrganId) => void
}) {
  return (
    <mesh
      visible={false}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(id)
      }}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      <sphereGeometry args={[0.13, 8, 8]} />
    </mesh>
  )
}

function SelectRing({ color, visible }: { color: string; visible: boolean }) {
  if (!visible) return null
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.14, 0.005, 8, 48]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function HeartMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group rotation={[0.2, 0.4, -0.25]} scale={0.95}>
      <mesh position={[-0.032, 0.015, 0]} scale={[1, 1.2, 0.95]}>
        <sphereGeometry args={[0.05, 20, 16]} />
        <GlowMat color={color} selected={selected} intensity={1.15} />
      </mesh>
      <mesh position={[0.032, 0.015, 0]} scale={[1, 1.2, 0.95]}>
        <sphereGeometry args={[0.05, 20, 16]} />
        <GlowMat color={color} selected={selected} intensity={1.15} />
      </mesh>
      <mesh position={[0, -0.04, 0]} rotation={[0, 0, Math.PI / 4]} scale={[0.9, 1.15, 0.8]}>
        <coneGeometry args={[0.055, 0.085, 14]} />
        <GlowMat color={color} selected={selected} />
      </mesh>
      <mesh position={[0.01, 0.065, 0]} rotation={[0.25, 0, 0.1]}>
        <cylinderGeometry args={[0.01, 0.016, 0.05, 8]} />
        <GlowMat color={color} selected={selected} intensity={0.85} />
      </mesh>
    </group>
  )
}

function LungsMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.075, 0]}>
        <cylinderGeometry args={[0.01, 0.012, 0.09, 8]} />
        <GlowMat color={color} selected={selected} intensity={0.7} />
      </mesh>
      <mesh position={[-0.05, 0.005, 0]} rotation={[0, 0, 0.28]} scale={[0.82, 1.3, 0.72]}>
        <sphereGeometry args={[0.065, 18, 14]} />
        <GlowMat color={color} selected={selected} />
      </mesh>
      <mesh position={[0.05, 0.005, 0]} rotation={[0, 0, -0.28]} scale={[0.82, 1.3, 0.72]}>
        <sphereGeometry args={[0.065, 18, 14]} />
        <GlowMat color={color} selected={selected} />
      </mesh>
      <mesh position={[-0.035, -0.055, 0]} scale={[0.65, 0.5, 0.5]}>
        <sphereGeometry args={[0.04, 12, 10]} />
        <GlowMat color={color} selected={selected} intensity={0.8} />
      </mesh>
      <mesh position={[0.035, -0.055, 0]} scale={[0.65, 0.5, 0.5]}>
        <sphereGeometry args={[0.04, 12, 10]} />
        <GlowMat color={color} selected={selected} intensity={0.8} />
      </mesh>
    </group>
  )
}

function BrainMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group>
      <mesh position={[-0.038, 0.012, 0]} scale={[0.95, 0.88, 1.05]}>
        <sphereGeometry args={[0.065, 20, 16]} />
        <GlowMat color={color} selected={selected} />
      </mesh>
      <mesh position={[0.038, 0.012, 0]} scale={[0.95, 0.88, 1.05]}>
        <sphereGeometry args={[0.065, 20, 16]} />
        <GlowMat color={color} selected={selected} />
      </mesh>
      <mesh position={[0, -0.04, -0.015]} scale={[0.72, 0.48, 0.65]}>
        <sphereGeometry args={[0.048, 14, 12]} />
        <GlowMat color={color} selected={selected} intensity={0.85} />
      </mesh>
    </group>
  )
}

function CoreMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group>
      {/* 肌群塊面 — 類似參考圖強調的腹腔器官體積感 */}
      <mesh position={[0.02, -0.02, 0.02]} rotation={[0.15, 0.3, -0.1]} scale={[1.15, 0.85, 0.7]}>
        <sphereGeometry args={[0.09, 20, 16]} />
        <GlowMat color={color} selected={selected} intensity={1.2} />
      </mesh>
      <mesh position={[-0.05, 0.02, 0]} rotation={[-0.1, -0.2, 0.2]} scale={[0.7, 0.9, 0.55]}>
        <sphereGeometry args={[0.06, 16, 12]} />
        <GlowMat color={color} selected={selected} intensity={0.95} />
      </mesh>
      <mesh position={[0, 0.08, -0.01]}>
        <cylinderGeometry args={[0.012, 0.016, 0.12, 8]} />
        <GlowMat color={color} selected={selected} intensity={0.7} />
      </mesh>
    </group>
  )
}

function FloatingLabel({
  id,
  text,
  accent,
}: {
  id: OrganId
  text: string
  accent: string
}) {
  const meta = ORGAN_META[id]
  const points = useMemo(
    () => [new THREE.Vector3(...meta.position), new THREE.Vector3(...meta.labelOffset)],
    [meta.position, meta.labelOffset],
  )

  return (
    <group>
      <Line points={points} color={accent} lineWidth={1} transparent opacity={0.5} />
      <Html position={meta.labelOffset} distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: 11,
            letterSpacing: '0.1em',
            color: accent,
            background: 'rgba(2, 12, 28, 0.65)',
            border: `1px solid ${accent}66`,
            backdropFilter: 'blur(10px)',
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 20px ${accent}40`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {text}
        </div>
      </Html>
    </group>
  )
}

export function OrganModules({ metrics, selected, onSelect, alert }: Props) {
  const heartRef = useRef<THREE.Group>(null)
  const lungsRef = useRef<THREE.Group>(null)
  const heartAlert = metrics.heartRate > 110 || alert

  const heartColor = organTone('#ff5a7a', selected === 'heart', heartAlert)
  const lungColor = organTone('#4de8ff', selected === 'lungs')
  const brainColor = organTone('#8fd4ff', selected === 'brain')
  const coreColor = organTone(
    metrics.muscleFatigue > 70 ? '#ff8a3d' : '#3ef0c8',
    selected === 'core',
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (heartRef.current) {
      const beat = 1 + Math.sin(t * Math.PI * 2 * (metrics.heartRate / 60)) * 0.09
      heartRef.current.scale.setScalar(beat)
    }
    if (lungsRef.current) {
      const breath = 1 + Math.sin(t * (metrics.respRate / 60) * Math.PI * 2) * 0.1
      lungsRef.current.scale.set(breath, breath, breath * 0.96)
    }
  })

  return (
    <group>
      <group ref={heartRef} position={ORGAN_META.heart.position}>
        <HeartMesh color={heartColor} selected={selected === 'heart'} />
        <SelectRing color={heartColor} visible={selected === 'heart'} />
        <HitProxy id="heart" onSelect={onSelect} />
      </group>

      <group ref={lungsRef} position={ORGAN_META.lungs.position}>
        <LungsMesh color={lungColor} selected={selected === 'lungs'} />
        <SelectRing color={lungColor} visible={selected === 'lungs'} />
        <HitProxy id="lungs" onSelect={onSelect} />
      </group>

      <group position={ORGAN_META.brain.position}>
        <BrainMesh color={brainColor} selected={selected === 'brain'} />
        <SelectRing color={brainColor} visible={selected === 'brain'} />
        <HitProxy id="brain" onSelect={onSelect} />
      </group>

      <group position={ORGAN_META.core.position}>
        <CoreMesh color={coreColor} selected={selected === 'core'} />
        <SelectRing color={coreColor} visible={selected === 'core'} />
        <HitProxy id="core" onSelect={onSelect} />
      </group>

      <FloatingLabel id="heart" text={`HR ${metrics.heartRate.toFixed(0)} BPM`} accent={heartColor} />
      <FloatingLabel id="lungs" text={`SpO₂ ${metrics.spo2.toFixed(1)}%`} accent={lungColor} />
      <FloatingLabel id="brain" text="CNS LINK" accent={brainColor} />
      <FloatingLabel
        id="core"
        text={`FATIGUE ${metrics.muscleFatigue.toFixed(0)}%`}
        accent={coreColor}
      />
    </group>
  )
}

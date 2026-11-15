import { Html, Line, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

/**
 * 顏色只表示狀態（NASA-STD-3001 Vol 2 表 F.5-1：紅＝警告、黃＝注意）：
 * 正常一律白／淺青；選取不換色，改用亮度＋選取環表示（[V2 10045] 顏色不能是唯一提示）
 */
const TONE = {
  normal: '#c8f1ff',
  caution: '#ffd23f',
  warning: '#ff2a55',
} as const
type Status = keyof typeof TONE

function organTone(status: Status = 'normal') {
  return TONE[status]
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
      // 未選取時壓低亮度，選取時才變亮
      emissiveIntensity={(selected ? 2.4 : 0.55) * intensity}
      transparent
      opacity={selected ? 0.95 : 0.6}
      roughness={0.22}
      metalness={0.35}
      depthWrite={false}
    />
  )
}

function HitProxy({
  id,
  onSelect,
  onHover,
  radius = 0.13,
}: {
  id: OrganId
  onSelect: (id: OrganId) => void
  onHover: (id: OrganId | null) => void
  /** 點擊範圍半徑；眼、頸靠近頭部，要縮小避免互相蓋住 */
  radius?: number
}) {
  return (
    <mesh
      visible={false}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        onHover(id)
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
        onHover(null)
      }}
    >
      <sphereGeometry args={[radius, 8, 8]} />
    </mesh>
  )
}

function SelectRing({
  color,
  visible,
  radius = 0.14,
}: {
  color: string
  visible: boolean
  radius?: number
}) {
  if (!visible) return null
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      {/* 加粗（原 0.005），選取靠形狀辨識而不只靠顏色 */}
      <torusGeometry args={[radius, 0.01, 8, 48]} />
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

/** 器官模型檔（Grab3D Human Heart，CC0）。檔案不存在或載入失敗時退回幾何形狀 */
const HEART_GLB_URL = '/models/astronaut-heart.glb'
/** Grab3D Human Lungs（CC0，AI-assisted），實際尺寸 0.235 × 0.147 × 0.300 m */
const LUNGS_GLB_URL = '/models/astronaut-lungs.glb'
/** Grab3D Human Brain（CC0，AI-assisted），實際尺寸 0.138 × 0.155 × 0.170 m（寬 × 高 × 前後） */
const BRAIN_GLB_URL = '/models/astronaut-brain.glb'

/** 載入失敗時顯示 fallback，並在 console 留下原因，不讓整個 3D 場景掛掉 */
class ModelErrorBoundary extends Component<
  { fallback: ReactNode; url: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error(`[OrganModel] 載入 ${this.props.url} 失敗，改用幾何形狀：`, error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * 載入 GLB 器官模型：依包圍盒縮放到 size（公尺，取最長邊）並置中，
 * 套用和其他部位相同的發光材質（原本的貼圖不顯示）。
 */
function OrganModel({
  url,
  size,
  color,
  selected,
}: {
  url: string
  size: number
  color: string
  selected: boolean
}) {
  const { scene } = useGLTF(url)
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        transparent: true,
        roughness: 0.22,
        metalness: 0.35,
        depthWrite: false,
      }),
    [],
  )

  // 和 GlowMat 同一組亮度：未選取壓低，選取才變亮
  useEffect(() => {
    material.color.set(color)
    material.emissive.set(color)
    material.emissiveIntensity = selected ? 2.4 : 0.55
    material.opacity = selected ? 0.95 : 0.6
  }, [material, color, selected])

  const object = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.material = material
        // 點擊交給 HitProxy；高面數模型不參與滑鼠射線判斷，避免移動滑鼠時卡頓
        mesh.raycast = () => {}
      }
    })
    // 和人體模型同一來源、同一匯出方式，比照人體轉 180° 朝向相機
    root.rotation.y = Math.PI
    const box = new THREE.Box3().setFromObject(root)
    const dims = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = size / Math.max(dims.x, dims.y, dims.z)
    const wrapper = new THREE.Group()
    root.position.sub(center)
    wrapper.add(root)
    wrapper.scale.setScalar(scale)
    return wrapper
  }, [scene, material, size])

  return <primitive object={object} />
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

function EyesMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group>
      {[-0.032, 0.032].map((x) => (
        <mesh key={x} position={[x, 0, 0]} scale={[1.3, 0.8, 0.7]}>
          <sphereGeometry args={[0.014, 14, 10]} />
          <GlowMat color={color} selected={selected} intensity={1.3} />
        </mesh>
      ))}
    </group>
  )
}

function NeckMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group>
      {/* 頸部外圈 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.85, 1]}>
        <torusGeometry args={[0.05, 0.006, 8, 32]} />
        <GlowMat color={color} selected={selected} intensity={0.9} />
      </mesh>
      {/* 左右頸靜脈 */}
      {[-0.03, 0.03].map((x) => (
        <mesh key={x} position={[x, 0, 0.025]}>
          <cylinderGeometry args={[0.006, 0.006, 0.09, 8]} />
          <GlowMat color={color} selected={selected} intensity={1.1} />
        </mesh>
      ))}
    </group>
  )
}

function LimbSegment({ color, selected }: { color: string; selected: boolean }) {
  return (
    <mesh>
      <capsuleGeometry args={[0.022, 0.16, 4, 10]} />
      <GlowMat color={color} selected={selected} intensity={0.9} />
    </mesh>
  )
}

/**
 * 四肢熱點（點任何一個都選到 limbs）。座標由模型頂點量測：
 * 雙臂為 A 字姿勢，上臂中段約 (±0.31, 1.18)，傾斜約 0.38 rad；小腿中段約 (±0.11, 0.36)
 */
const LIMB_SPOTS: { position: [number, number, number]; tilt: number }[] = [
  { position: [-0.31, 1.18, 0.0], tilt: -0.38 },
  { position: [0.31, 1.18, 0.0], tilt: 0.38 },
  { position: [-0.11, 0.36, 0.05], tilt: 0 },
  { position: [0.11, 0.36, 0.05], tilt: 0 },
]

function FloatingLabel({
  id,
  text,
  accent,
  visible,
}: {
  id: OrganId
  text: string
  accent: string
  /** 只在選取、滑鼠移上、或異常時顯示，避免標籤擋住其他資訊 */
  visible: boolean
}) {
  const meta = ORGAN_META[id]
  const points = useMemo(
    () => [new THREE.Vector3(...meta.position), new THREE.Vector3(...meta.labelOffset)],
    [meta.position, meta.labelOffset],
  )

  if (!visible) return null

  return (
    <group>
      <Line points={points} color={accent} lineWidth={1} transparent opacity={0.5} />
      {/* zIndexRange：drei 預設 z-index 約 1677 萬，會蓋在右側面板（z-20）上面；壓到 10 以下 */}
      <Html
        position={meta.labelOffset}
        distanceFactor={8}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
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
  const [hovered, setHovered] = useState<OrganId | null>(null)
  const heartAlert = metrics.heartRate > 110 || alert
  const fatigueCaution = metrics.muscleFatigue > 70

  // 門檻沿用原本的值（心率 >110、疲勞 >70，出處待補），只把顏色改成狀態色
  const heartColor = organTone(heartAlert ? 'warning' : 'normal')
  const coreColor = organTone(fatigueCaution ? 'caution' : 'normal')
  // 腦、肺、眼、頸、四肢目前沒有判斷，一律正常色
  const normalColor = organTone('normal')
  const lungColor = normalColor
  const brainColor = normalColor
  const eyesColor = normalColor
  const neckColor = normalColor
  const limbsColor = normalColor

  /** 標籤只在選取、滑鼠移上、或異常時顯示 */
  const showLabel = (id: OrganId, abnormal = false) =>
    selected === id || hovered === id || abnormal

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
        {/* 真實心臟約 12 cm 高（模型本身 0.098 × 0.069 × 0.121 m），size 取最長邊 */}
        <ModelErrorBoundary
          url={HEART_GLB_URL}
          fallback={<HeartMesh color={heartColor} selected={selected === 'heart'} />}
        >
          <Suspense fallback={<HeartMesh color={heartColor} selected={selected === 'heart'} />}>
            <OrganModel
              url={HEART_GLB_URL}
              size={0.12}
              color={heartColor}
              selected={selected === 'heart'}
            />
          </Suspense>
        </ModelErrorBoundary>
        <SelectRing color={heartColor} visible={selected === 'heart'} />
        {/* 背視圖下心臟在肺後面；點擊範圍往相機方向推 0.08，中間點下去優先選到心臟 */}
        <group position={[0, 0, 0.08]}>
          <HitProxy id="heart" onSelect={onSelect} onHover={setHovered} radius={0.08} />
        </group>
      </group>

      <group ref={lungsRef} position={ORGAN_META.lungs.position}>
        <ModelErrorBoundary
          url={LUNGS_GLB_URL}
          fallback={<LungsMesh color={lungColor} selected={selected === 'lungs'} />}
        >
          <Suspense fallback={<LungsMesh color={lungColor} selected={selected === 'lungs'} />}>
            {/* 位置已在 ORGAN_META.lungs 置中，不再另外位移 */}
            <OrganModel
              url={LUNGS_GLB_URL}
              size={0.28}
              color={lungColor}
              selected={selected === 'lungs'}
            />
          </Suspense>
        </ModelErrorBoundary>
        <SelectRing color={lungColor} visible={selected === 'lungs'} />
        {/* 左右肺各一個點擊範圍，讓出中間給心臟 */}
        {[-0.09, 0.09].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <HitProxy id="lungs" onSelect={onSelect} onHover={setHovered} radius={0.08} />
          </group>
        ))}
      </group>

      <group position={ORGAN_META.brain.position}>
        <ModelErrorBoundary
          url={BRAIN_GLB_URL}
          fallback={<BrainMesh color={brainColor} selected={selected === 'brain'} />}
        >
          <Suspense fallback={<BrainMesh color={brainColor} selected={selected === 'brain'} />}>
            {/* 最長邊 0.17 → 0.16：頭部只到 1.80 m，原尺寸頂部會貼齊頭頂，略縮留出顱骨厚度 */}
            <OrganModel
              url={BRAIN_GLB_URL}
              size={0.16}
              color={brainColor}
              selected={selected === 'brain'}
            />
          </Suspense>
        </ModelErrorBoundary>
        <SelectRing color={brainColor} visible={selected === 'brain'} />
        {/* 半徑 0.08：前緣不超過眼睛熱點，正面點眼睛時不會先點到腦 */}
        <HitProxy id="brain" onSelect={onSelect} onHover={setHovered} radius={0.08} />
      </group>

      <group position={ORGAN_META.eyes.position}>
        <EyesMesh color={eyesColor} selected={selected === 'eyes'} />
        <SelectRing color={eyesColor} visible={selected === 'eyes'} radius={0.06} />
        <HitProxy id="eyes" onSelect={onSelect} onHover={setHovered} radius={0.045} />
      </group>

      <group position={ORGAN_META.neck.position}>
        <NeckMesh color={neckColor} selected={selected === 'neck'} />
        <SelectRing color={neckColor} visible={selected === 'neck'} radius={0.07} />
        <HitProxy id="neck" onSelect={onSelect} onHover={setHovered} radius={0.05} />
      </group>

      {LIMB_SPOTS.map((spot) => (
        <group key={spot.position.join(',')} position={spot.position} rotation={[0, 0, spot.tilt]}>
          <LimbSegment color={limbsColor} selected={selected === 'limbs'} />
          <SelectRing color={limbsColor} visible={selected === 'limbs'} radius={0.06} />
          <HitProxy id="limbs" onSelect={onSelect} onHover={setHovered} radius={0.07} />
        </group>
      ))}

      <group position={ORGAN_META.core.position}>
        <CoreMesh color={coreColor} selected={selected === 'core'} />
        <SelectRing color={coreColor} visible={selected === 'core'} />
        <HitProxy id="core" onSelect={onSelect} onHover={setHovered} />
      </group>

      <FloatingLabel id="heart" text={`HR ${metrics.heartRate.toFixed(0)} BPM`} accent={heartColor}
        visible={showLabel('heart', heartAlert)}
      />
      <FloatingLabel id="lungs" text={`SpO₂ ${metrics.spo2.toFixed(1)}%`} accent={lungColor} visible={showLabel('lungs')} />
      <FloatingLabel id="brain" text="CNS LINK" accent={brainColor} visible={showLabel('brain')} />
      <FloatingLabel id="eyes" text="VISION" accent={eyesColor} visible={showLabel('eyes')} />
      <FloatingLabel id="neck" text="NECK VEIN" accent={neckColor} visible={showLabel('neck')} />
      <FloatingLabel id="limbs" text="LIMBS" accent={limbsColor} visible={showLabel('limbs')} />
      <FloatingLabel
        id="core"
        text={`FATIGUE ${metrics.muscleFatigue.toFixed(0)}%`}
        accent={coreColor}
        visible={showLabel('core', fatigueCaution)}
      />
    </group>
  )
}

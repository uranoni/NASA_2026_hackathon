import { Html, Line, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import type { LimbPart, Level, Region } from '../../lib/assessment'
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
  /** 各部位判斷結果（src/lib/assessment.ts）：warn＝黃、bad＝紅 */
  levels: Record<Region, Level>
  /** 四肢上下半各自的等級（上臂＝upper、小腿＝lower），見 assessment.limbParts */
  limbParts: Record<LimbPart, Level>
}

/**
 * 顏色只表示狀態（NASA-STD-3001 Vol 2 表 F.5-1：紅＝警告、黃＝注意）：
 * 正常一律白／淺青；選取不換色，改用亮度＋選取環表示（[V2 10045] 顏色不能是唯一提示）
 */
const TONE = {
  // 所有可點部位共用同一色（使用者要求，避免突兀）；重疊處改用不透明度分層，見 restOpacity
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
  restOpacity = 0.6,
}: {
  color: string
  selected: boolean
  intensity?: number
  /** 未選取時的不透明度；重疊時，前面的小部位調高、外面的大器官調低 */
  restOpacity?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={color}
      // 未選取時壓低亮度，選取時才變亮
      emissiveIntensity={(selected ? 2.4 : 0.55) * intensity}
      transparent
      opacity={selected ? 0.95 : restOpacity}
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
  onHover: (update: (prev: OrganId | null) => OrganId | null) => void
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
        onHover(() => id)
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
        // 只清掉自己：滑到相鄰部位時，新部位的 over 可能比舊部位的 out 先到，直接設 null 會讓標籤閃掉
        onHover((prev) => (prev === id ? null : prev))
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
const HEART_GLB_URL = 'models/astronaut-heart.glb'
/** Grab3D Human Lungs（CC0，AI-assisted），實際尺寸 0.235 × 0.147 × 0.300 m */
const LUNGS_GLB_URL = 'models/astronaut-lungs.glb'
/** Grab3D Human Brain（CC0，AI-assisted），實際尺寸 0.138 × 0.155 × 0.170 m（寬 × 高 × 前後） */
const BRAIN_GLB_URL = 'models/astronaut-brain.glb'

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
  restOpacity = 0.6,
}: {
  url: string
  size: number
  color: string
  selected: boolean
  /** 同 GlowMat：未選取時的不透明度 */
  restOpacity?: number
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
    material.opacity = selected ? 0.95 : restOpacity
  }, [material, color, selected, restOpacity])

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
    // 和人體模型同一來源、同一匯出方式，原始朝向就是正面朝 +z（相機），不用旋轉
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

function EyesMesh({ color, selected }: { color: string; selected: boolean }) {
  return (
    <group>
      {[-0.032, 0.032].map((x) => (
        <mesh key={x} position={[x, 0, 0]} scale={[1.3, 0.8, 0.7]}>
          <sphereGeometry args={[0.014, 14, 10]} />
          {/* 眼在腦的前面，不透明度調高才不會被腦的光蓋過 */}
          <GlowMat color={color} selected={selected} intensity={1.3} restOpacity={0.9} />
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
const LIMB_SPOTS: { position: [number, number, number]; tilt: number; part: LimbPart }[] = [
  { position: [-0.31, 1.18, 0.0], tilt: -0.38, part: 'upper' },
  { position: [0.31, 1.18, 0.0], tilt: 0.38, part: 'upper' },
  { position: [-0.11, 0.36, -0.05], tilt: 0, part: 'lower' },
  { position: [0.11, 0.36, -0.05], tilt: 0, part: 'lower' },
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
      {/* 不設 distanceFactor：原本標籤會隨相機遠近縮放，選取時相機移動、縮放視角都會忽大忽小，改成固定像素大小 */}
      <Html
        position={meta.labelOffset}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            fontFamily: '"Share Tech Mono", monospace',
            // hover 和點擊都用同一個大框（原本 11px，固定大小後顯得太小）
            fontSize: 19,
            letterSpacing: '0.1em',
            color: accent,
            background: 'rgba(2, 12, 28, 0.75)',
            border: `1px solid ${accent}88`,
            backdropFilter: 'blur(10px)',
            padding: '10px 18px',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 20px ${accent}40`,
            // 標籤都在人體左邊：框的右緣對齊連接線末端，往左長，不會蓋到人體
            transform: 'translate(-100%, -50%)',
          }}
        >
          {text}
        </div>
      </Html>
    </group>
  )
}

const LEVEL_TONE: Record<Level, Status> = { ok: 'normal', warn: 'caution', bad: 'warning' }

export function OrganModules({ metrics, selected, onSelect, levels, limbParts }: Props) {
  const heartRef = useRef<THREE.Group>(null)
  const lungsRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState<OrganId | null>(null)

  // 顏色由判斷邏輯決定（移植自 iss_demo.html，門檻與出處見 Demo判斷依據.md）
  const abnormal = (id: OrganId) => levels[id] !== 'ok'
  const toneOf = (id: OrganId) => organTone(LEVEL_TONE[levels[id]])
  const heartColor = toneOf('heart')
  const limbsColor = toneOf('limbs')
  const lungColor = toneOf('lungs')
  const brainColor = toneOf('brain')
  const eyesColor = toneOf('eyes')
  const neckColor = toneOf('neck')
  // 異常的部位不用選取也維持高亮，一眼看出是哪裡出事
  const lit = (id: OrganId) => selected === id || abnormal(id)
  const heartLit = lit('heart')
  // 四肢分上下（使用者要求）：缺上肢訓練只亮上臂、缺下肢只亮小腿；選取 limbs 時四個都亮
  const partColor = (p: LimbPart) => organTone(LEVEL_TONE[limbParts[p]])
  const partLit = (p: LimbPart) => selected === 'limbs' || limbParts[p] !== 'ok'

  /**
   * 暫時解法：預設選取心臟時，重整後只出現連接線、沒有數值框；重新點一次就正常。
   * 推測是 drei <Html> 在場景剛建立時（React 19 StrictMode 會掛載兩次）第一次掛載，
   * 內容沒有畫出來。所以等場景畫完幾個畫面後才掛載標籤，等同「重新點一次」的路徑。
   * 根因未確認：正式版（vite build，沒有 StrictMode 的重複掛載）若沒有這個問題，就是 StrictMode 造成的。
   */
  const [labelsReady, setLabelsReady] = useState(false)
  const readyFrames = useRef(0)
  useFrame(() => {
    if (!labelsReady && ++readyFrames.current > 3) setLabelsReady(true)
  })

  /** 標籤只在選取、滑鼠移上、或異常時顯示 */
  const showLabel = (id: OrganId, abnormal = false) =>
    labelsReady && (selected === id || hovered === id || abnormal)

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
          fallback={<HeartMesh color={heartColor} selected={heartLit} />}
        >
          <Suspense fallback={<HeartMesh color={heartColor} selected={heartLit} />}>
            <OrganModel
              url={HEART_GLB_URL}
              size={0.12}
              color={heartColor}
              selected={heartLit}
              restOpacity={0.9}
            />
          </Suspense>
        </ModelErrorBoundary>
        <SelectRing color={heartColor} visible={selected === 'heart'} />
        {/* 心臟和肺的點擊範圍重疊；心臟往相機方向推 0.08，胸口中間點下去優先選到心臟 */}
        <group position={[0, 0, 0.08]}>
          <HitProxy id="heart" onSelect={onSelect} onHover={setHovered} radius={0.08} />
        </group>
      </group>

      <group ref={lungsRef} position={ORGAN_META.lungs.position}>
        <ModelErrorBoundary
          url={LUNGS_GLB_URL}
          fallback={<LungsMesh color={lungColor} selected={lit('lungs')} />}
        >
          <Suspense fallback={<LungsMesh color={lungColor} selected={lit('lungs')} />}>
            {/* 位置已在 ORGAN_META.lungs 置中，不再另外位移 */}
            <OrganModel
              url={LUNGS_GLB_URL}
              size={0.28}
              color={lungColor}
              selected={lit('lungs')}
              // 肺包住心臟，平時調淡讓心臟透出來
              restOpacity={0.3}
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
          fallback={<BrainMesh color={brainColor} selected={lit('brain')} />}
        >
          <Suspense fallback={<BrainMesh color={brainColor} selected={lit('brain')} />}>
            {/* 最長邊 0.17 → 0.16：頭部只到 1.80 m，原尺寸頂部會貼齊頭頂，略縮留出顱骨厚度 */}
            <OrganModel
              url={BRAIN_GLB_URL}
              size={0.16}
              color={brainColor}
              selected={lit('brain')}
              // 腦在眼睛後方，平時調淡讓眼睛透出來
              restOpacity={0.3}
            />
          </Suspense>
        </ModelErrorBoundary>
        <SelectRing color={brainColor} visible={selected === 'brain'} />
        {/* 半徑 0.08：前緣不超過眼睛熱點，正面點眼睛時不會先點到腦 */}
        <HitProxy id="brain" onSelect={onSelect} onHover={setHovered} radius={0.08} />
      </group>

      <group position={ORGAN_META.eyes.position}>
        <EyesMesh color={eyesColor} selected={lit('eyes')} />
        <SelectRing color={eyesColor} visible={selected === 'eyes'} radius={0.06} />
        <HitProxy id="eyes" onSelect={onSelect} onHover={setHovered} radius={0.045} />
      </group>

      <group position={ORGAN_META.neck.position}>
        <NeckMesh color={neckColor} selected={lit('neck')} />
        <SelectRing color={neckColor} visible={selected === 'neck'} radius={0.07} />
        <HitProxy id="neck" onSelect={onSelect} onHover={setHovered} radius={0.05} />
      </group>

      {LIMB_SPOTS.map((spot) => (
        <group key={spot.position.join(',')} position={spot.position} rotation={[0, 0, spot.tilt]}>
          <LimbSegment color={partColor(spot.part)} selected={partLit(spot.part)} />
          <SelectRing color={partColor(spot.part)} visible={selected === 'limbs'} radius={0.06} />
          <HitProxy id="limbs" onSelect={onSelect} onHover={setHovered} radius={0.07} />
        </group>
      ))}

      <FloatingLabel id="heart" text={`HR ${metrics.heartRate.toFixed(0)} BPM`} accent={heartColor}
        visible={showLabel('heart', abnormal('heart'))}
      />
      <FloatingLabel id="lungs" text={`SpO₂ ${metrics.spo2.toFixed(1)}%`} accent={lungColor} visible={showLabel('lungs', abnormal('lungs'))} />
      <FloatingLabel id="brain" text="CNS LINK" accent={brainColor} visible={showLabel('brain', abnormal('brain'))} />
      <FloatingLabel id="eyes" text="VISION" accent={eyesColor} visible={showLabel('eyes', abnormal('eyes'))} />
      <FloatingLabel id="neck" text="NECK VEIN" accent={neckColor} visible={showLabel('neck', abnormal('neck'))} />
      <FloatingLabel
        id="limbs"
        text={`FATIGUE ${metrics.muscleFatigue.toFixed(0)}%`}
        accent={limbsColor}
        visible={showLabel('limbs', abnormal('limbs'))}
      />
    </group>
  )
}

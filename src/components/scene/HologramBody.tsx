import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { hologramFresnelShader } from '../../shaders/hologramFresnel'

type Props = {
  scanEnabled: boolean
  alertMix: number
  modelUrl?: string
}

/** CC0 真人肌肉模型（Grab3D Human Muscles light），約 1.80 m */
const DEFAULT_GLB_URL = '/models/astronaut-body.glb'

function useHologramMaterial(scanEnabled: boolean, alertMix: number) {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(hologramFresnelShader.uniforms),
      vertexShader: hologramFresnelShader.vertexShader,
      fragmentShader: hologramFresnelShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  }, [])

  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta
    material.uniforms.uScanEnabled.value = scanEnabled ? 1 : 0
    material.uniforms.uAlertMix.value = THREE.MathUtils.lerp(
      material.uniforms.uAlertMix.value,
      alertMix,
      0.08,
    )
  })

  return material
}

function useWireMaterial(alertMix: number) {
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#6ef6ff'),
        wireframe: true,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useFrame(() => {
    const alert = new THREE.Color('#ff4d6d')
    const base = new THREE.Color('#6ef6ff')
    material.color.copy(base).lerp(alert, alertMix)
  })

  return material
}

/** 水平掃描環 — 對齊參考圖全息艙效果 */
function ScanRings({ enabled }: { enabled: boolean }) {
  const group = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!group.current || !enabled) return
    const t = state.clock.elapsedTime
    group.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh
      const phase = (t * 0.22 + i * 0.28) % 1
      mesh.position.y = 0.08 + phase * 1.7
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.15 + Math.sin(phase * Math.PI) * 0.45
      const s = 0.85 + phase * 0.35
      mesh.scale.set(s, 1, s)
    })
  })

  if (!enabled) return null

  return (
    <group ref={group}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.006, 8, 64]} />
          <meshBasicMaterial
            color="#5de8ff"
            transparent
            opacity={0.4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

/** 垂直能量柱（輕微） */
function ContainmentBeams() {
  return (
    <group>
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]}>
          <boxGeometry args={[0.008, 1.85, 0.008]} />
          <meshBasicMaterial
            color="#3ecfff"
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}

function RealisticBody({
  url,
  hologramMat,
  wireMat,
}: {
  url: string
  hologramMat: THREE.ShaderMaterial
  wireMat: THREE.MeshBasicMaterial
}) {
  const { scene } = useGLTF(url)

  const { shell, wire } = useMemo(() => {
    const shellRoot = scene.clone(true)
    const wireRoot = scene.clone(true)

    // 模型約 1.80 m、腳底為原點；微調面向相機（+Z）
    const prepare = (root: THREE.Object3D, mat: THREE.Material) => {
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.material = mat
          mesh.castShadow = false
          mesh.receiveShadow = false
          mesh.frustumCulled = true
        }
      })
      // 若匯出朝向不同，微轉對齊正面
      root.rotation.y = Math.PI
      return root
    }

    return {
      shell: prepare(shellRoot, hologramMat),
      wire: prepare(wireRoot, wireMat),
    }
  }, [scene, hologramMat, wireMat])

  return (
    <group>
      <primitive object={shell} />
      <primitive object={wire} />
    </group>
  )
}

function FallbackBody({ material }: { material: THREE.ShaderMaterial }) {
  return (
    <group>
      <mesh position={[0, 1.55, 0]} material={material}>
        <sphereGeometry args={[0.14, 28, 20]} />
      </mesh>
      <mesh position={[0, 1.05, 0]} scale={[1.05, 1, 0.75]} material={material}>
        <capsuleGeometry args={[0.22, 0.45, 8, 20]} />
      </mesh>
      <mesh position={[-0.34, 1.05, 0]} rotation={[0, 0, 0.4]} material={material}>
        <capsuleGeometry args={[0.055, 0.45, 6, 12]} />
      </mesh>
      <mesh position={[0.34, 1.05, 0]} rotation={[0, 0, -0.4]} material={material}>
        <capsuleGeometry args={[0.055, 0.45, 6, 12]} />
      </mesh>
      <mesh position={[-0.11, 0.35, 0]} material={material}>
        <capsuleGeometry args={[0.08, 0.55, 6, 12]} />
      </mesh>
      <mesh position={[0.11, 0.35, 0]} material={material}>
        <capsuleGeometry args={[0.08, 0.55, 6, 12]} />
      </mesh>
    </group>
  )
}

export function HologramBody({
  scanEnabled,
  alertMix,
  modelUrl = DEFAULT_GLB_URL,
}: Props) {
  const hologramMat = useHologramMaterial(scanEnabled, alertMix)
  const wireMat = useWireMaterial(alertMix)
  const group = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!group.current) return
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.65) * 0.015
  })

  return (
    <group ref={group}>
      <Suspense fallback={<FallbackBody material={hologramMat} />}>
        <RealisticBody url={modelUrl} hologramMat={hologramMat} wireMat={wireMat} />
      </Suspense>
      <ScanRings enabled={scanEnabled} />
      <ContainmentBeams />
    </group>
  )
}

useGLTF.preload(DEFAULT_GLB_URL)

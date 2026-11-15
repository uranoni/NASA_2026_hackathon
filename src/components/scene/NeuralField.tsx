import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/** 背景神經網路粒子：點 + 近距連線，營造全息 HUD 空間感 */
export function NeuralField({ count = 90 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)

  const { positions, connections } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 4.5 - 0.5,
        (Math.random() - 0.5) * 8 - 1.5,
      )
      // 避開人體中心區域
      if (Math.abs(v.x) < 1.2 && v.z > -1 && v.z < 1.5 && v.y < 2) {
        v.x += Math.sign(v.x || 1) * 1.8
      }
      pts.push(v)
      positions[i * 3] = v.x
      positions[i * 3 + 1] = v.y
      positions[i * 3 + 2] = v.z
    }

    const conn: number[] = []
    const maxDist = 1.85
    for (let i = 0; i < count; i++) {
      let links = 0
      for (let j = i + 1; j < count && links < 3; j++) {
        if (pts[i].distanceTo(pts[j]) < maxDist) {
          conn.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z)
          links++
        }
      }
    }
    return { positions, connections: new Float32Array(conn) }
  }, [count])

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(connections, 3))
    return g
  }, [connections])

  useFrame((state) => {
    const t = state.clock.elapsedTime * 0.08
    if (pointsRef.current) pointsRef.current.rotation.y = t
    if (linesRef.current) linesRef.current.rotation.y = t
  })

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#4ecfff"
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <lineSegments ref={linesRef} geometry={lineGeo}>
        <lineBasicMaterial
          color="#1a8fb8"
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  )
}

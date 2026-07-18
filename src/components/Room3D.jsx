import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Text, Html, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'

const GAP = 2.4

function RoomBox({ room, selected, onSelect }) {
  const lightRef = useRef()
  const isOccupied = room.status === 'occupied'
  const color = selected ? '#ffb33d' : isOccupied ? '#ff3b4e' : '#3dffe0'

  // Flicker the occupied "do not enter" light slightly, like a real corridor sign.
  useFrame(({ clock }) => {
    if (lightRef.current && isOccupied) {
      const t = clock.getElapsedTime()
      lightRef.current.intensity = 1.6 + Math.sin(t * 8 + room.col) * 0.5
    }
  })

  const x = room.col * GAP - (GAP * 1.5)
  const z = room.row * GAP - GAP

  return (
    <group position={[x, 0, z]} onClick={() => onSelect(room)}>
      {/* room shell */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 1, 1.9]} />
        <meshStandardMaterial
          color={selected ? '#3a2a12' : '#1d1628'}
          emissive={color}
          emissiveIntensity={selected ? 0.35 : isOccupied ? 0.22 : 0.18}
          roughness={0.5}
          metalness={0.15}
        />
      </mesh>

      {/* status beacon on the roof */}
      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 1.2, 0]} color={color} intensity={isOccupied ? 1.8 : 1.1} distance={2.6} />

      <Html position={[0, 1.55, 0]} center distanceFactor={8} occlude>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            color: '#ede8f7',
            background: 'rgba(18,13,26,0.85)',
            border: `1px solid ${color}`,
            borderRadius: 6,
            padding: '2px 6px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {room.name} · {isOccupied ? 'ไม่ว่าง' : 'ว่าง'}
        </div>
      </Html>

      {/* clickable floor tile */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = isOccupied ? 'not-allowed' : 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = 'auto' }}
      >
        <planeGeometry args={[2.1, 2.1]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  )
}

function Floor() {
  return (
    <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[14, 10]} />
      <meshStandardMaterial color="#150f20" roughness={1} />
    </mesh>
  )
}

export default function Room3D({ rooms, selectedId, onSelect }) {
  const handleSelect = (room) => {
    if (room.status === 'occupied') return
    onSelect(room.id)
  }

  const cameraStart = useMemo(() => new THREE.Vector3(0, 6.5, 7.5), [])

  return (
    <div style={{ width: '100%', height: '420px', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' }}>
      <Canvas shadows camera={{ position: cameraStart, fov: 45 }}>
        <color attach="background" args={['#0d0813']} />
        <fog attach="fog" args={['#0d0813', 10, 22]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 8, 2]} intensity={0.5} castShadow />

        <Floor />
        {rooms.map((room) => (
          <RoomBox
            key={room.id}
            room={room}
            selected={room.id === selectedId}
            onSelect={handleSelect}
          />
        ))}

        <Text
          position={[0, 0.02, -3.6]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.4}
          color="#a79dc2"
          anchorX="center"
        >
          ทางเดินห้องคาราโอเกะ
        </Text>

        <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={14} blur={2} far={4} />
        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={13}
          maxPolarAngle={Math.PI / 2.3}
        />
      </Canvas>
    </div>
  )
}

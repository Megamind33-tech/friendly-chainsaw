'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows, Text, Box, Plane, Cylinder, Sphere, Float, Grid, SpotLight } from '@react-three/drei'
import * as THREE from 'three'
import { useStudioStore } from '@/lib/studio-store'

function NewsDesk() {
  const deskRef = useRef<THREE.Group>(null)
  const { scene } = useStudioStore()

  return (
    <group ref={deskRef} position={[0, 0, 0]}>
      {/* Main desk surface */}
      <Box args={[3.2, 0.12, 1.4]} position={[0, 0.95, 0]}>
        <meshStandardMaterial color="#1a1a2e" metalness={0.7} roughness={0.2} />
      </Box>
      {/* Desk legs */}
      <Cylinder args={[0.06, 0.06, 0.9, 16]} position={[-1.4, 0.45, -0.55]}>
        <meshStandardMaterial color="#333344" metalness={0.8} roughness={0.3} />
      </Cylinder>
      <Cylinder args={[0.06, 0.06, 0.9, 16]} position={[1.4, 0.45, -0.55]}>
        <meshStandardMaterial color="#333344" metalness={0.8} roughness={0.3} />
      </Cylinder>
      <Cylinder args={[0.06, 0.06, 0.9, 16]} position={[-1.4, 0.45, 0.55]}>
        <meshStandardMaterial color="#333344" metalness={0.8} roughness={0.3} />
      </Cylinder>
      <Cylinder args={[0.06, 0.06, 0.9, 16]} position={[1.4, 0.45, 0.55]}>
        <meshStandardMaterial color="#333344" metalness={0.8} roughness={0.3} />
      </Cylinder>
      {/* Glass panel on desk */}
      <Box args={[2.8, 0.02, 0.6]} position={[0, 1.02, 0.2]}>
        <meshStandardMaterial color="#4a90d9" metalness={0.9} roughness={0.05} transparent opacity={0.4} />
      </Box>
    </group>
  )
}

function VirtualMonitor({ position, label }: { position: [number, number, number]; label: string }) {
  const monitorRef = useRef<THREE.Group>(null)
  const time = useRef(0)

  useFrame((_, delta) => {
    time.current += delta
    if (monitorRef.current) {
      const mat = (monitorRef.current.children[1] as THREE.Mesh)?.material as THREE.MeshStandardMaterial
      if (mat) {
        mat.emissiveIntensity = 0.5 + Math.sin(time.current * 2) * 0.1
      }
    }
  })

  return (
    <group ref={monitorRef} position={position}>
      {/* Monitor frame */}
      <Box args={[2.4, 1.4, 0.08]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#111122" metalness={0.5} roughness={0.4} />
      </Box>
      {/* Screen */}
      <Box args={[2.2, 1.2, 0.01]} position={[0, 0, 0.05]}>
        <meshStandardMaterial color="#1a3a5c" emissive="#2a5a8c" emissiveIntensity={0.5} metalness={0.1} roughness={0.8} />
      </Box>
      {/* Monitor stand */}
      <Box args={[0.3, 0.8, 0.3]} position={[0, -1.1, -0.2]}>
        <meshStandardMaterial color="#222233" metalness={0.6} roughness={0.3} />
      </Box>
      <Text position={[0, 0, 0.1]} fontSize={0.12} color="#8ab4f8" anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  )
}

function WeatherDot({ index }: { index: number }) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = Math.sin(state.clock.elapsedTime + index) * 0.5 + 0.5
    }
  })

  return (
    <Sphere ref={ref} args={[0.06, 8, 8]} position={[(index - 3.5) * 0.7, 0, 0.1]}>
      <meshStandardMaterial color="#4a90d9" emissive="#4a90d9" emissiveIntensity={0.5} transparent opacity={0.7} />
    </Sphere>
  )
}

function WeatherMap() {
  return (
    <group position={[0, 2.5, -5]}>
      {/* Large weather screen */}
      <Box args={[6, 3.5, 0.1]}>
        <meshStandardMaterial color="#0a1628" metalness={0.3} roughness={0.5} />
      </Box>
      <Box args={[5.8, 3.3, 0.01]} position={[0, 0, 0.06]}>
        <meshStandardMaterial color="#0d2137" emissive="#1a4a6e" emissiveIntensity={0.3} />
      </Box>
      {/* Animated weather elements */}
      {[...Array(8)].map((_, i) => (
        <WeatherDot key={i} index={i} />
      ))}
    </group>
  )
}

function TalkShowSetup() {
  return (
    <group position={[0, 0, 0]}>
      {/* Two chairs */}
      <group position={[-1.2, 0, 0]}>
        <Box args={[0.8, 0.08, 0.8]} position={[0, 0.5, 0]}>
          <meshStandardMaterial color="#2d2d3d" metalness={0.3} roughness={0.6} />
        </Box>
        <Box args={[0.8, 0.8, 0.08]} position={[0, 0.9, -0.36]}>
          <meshStandardMaterial color="#2d2d3d" metalness={0.3} roughness={0.6} />
        </Box>
        {/* Chair legs */}
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[-0.35, 0.25, -0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[0.35, 0.25, -0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[-0.35, 0.25, 0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[0.35, 0.25, 0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
      </group>
      <group position={[1.2, 0, 0]}>
        <Box args={[0.8, 0.08, 0.8]} position={[0, 0.5, 0]}>
          <meshStandardMaterial color="#2d2d3d" metalness={0.3} roughness={0.6} />
        </Box>
        <Box args={[0.8, 0.8, 0.08]} position={[0, 0.9, -0.36]}>
          <meshStandardMaterial color="#2d2d3d" metalness={0.3} roughness={0.6} />
        </Box>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[-0.35, 0.25, -0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[0.35, 0.25, -0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[-0.35, 0.25, 0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
        <Cylinder args={[0.03, 0.03, 0.5, 8]} position={[0.35, 0.25, 0.35]}>
          <meshStandardMaterial color="#444455" metalness={0.7} />
        </Cylinder>
      </group>
      {/* Coffee table */}
      <Box args={[1.2, 0.05, 0.6]} position={[0, 0.4, 0.2]}>
        <meshStandardMaterial color="#1a1a2e" metalness={0.6} roughness={0.2} />
      </Box>
    </group>
  )
}

function BreakingNewsSet() {
  const time = useRef(0)
  const stripRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    time.current += delta
    if (stripRef.current) {
      const mat = stripRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.8 + Math.sin(time.current * 3) * 0.2
    }
  })

  return (
    <group>
      {/* Large LED wall */}
      <Box args={[10, 5, 0.15]} position={[0, 2.5, -6]}>
        <meshStandardMaterial color="#050510" metalness={0.2} roughness={0.4} />
      </Box>
      <Box args={[9.8, 4.8, 0.01]} position={[0, 2.5, -5.9]}>
        <meshStandardMaterial color="#0a1a3a" emissive="#1a3a6a" emissiveIntensity={0.4} />
      </Box>
      {/* Breaking news strip */}
      <Box ref={stripRef} args={[10, 0.4, 0.05]} position={[0, 4.8, -5.8]}>
        <meshStandardMaterial color="#cc0000" emissive="#ff0000" emissiveIntensity={0.8} />
      </Box>
      <Text position={[0, 4.8, -5.7]} fontSize={0.25} color="#ffffff" anchorX="center" fontWeight="bold">
        BREAKING NEWS
      </Text>
    </group>
  )
}

function SportsArena() {
  return (
    <group>
      {/* Scoreboard */}
      <Box args={[4, 2, 0.1]} position={[0, 4, -5]}>
        <meshStandardMaterial color="#0a0a1a" metalness={0.3} roughness={0.5} />
      </Box>
      <Box args={[3.8, 1.8, 0.01]} position={[0, 4, -4.93]}>
        <meshStandardMaterial color="#0a2a0a" emissive="#1a5a1a" emissiveIntensity={0.4} />
      </Box>
      <Text position={[0, 4.3, -4.9]} fontSize={0.2} color="#4aff4a" anchorX="center">
        SCOREBOARD
      </Text>
      {/* Podium */}
      <Box args={[2, 0.1, 1]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color="#1a2a1a" metalness={0.5} roughness={0.3} />
      </Box>
    </group>
  )
}

function ElectionHQ() {
  return (
    <group>
      {/* Multiple data screens */}
      {[-3, 0, 3].map((x, i) => (
        <group key={i} position={[x, 2.5, -5]}>
          <Box args={[2.4, 1.8, 0.1]}>
            <meshStandardMaterial color="#050510" metalness={0.2} roughness={0.5} />
          </Box>
          <Box args={[2.2, 1.6, 0.01]} position={[0, 0, 0.06]}>
            <meshStandardMaterial
              color={i === 1 ? '#1a0a2a' : '#0a1a2a'}
              emissive={i === 1 ? '#3a1a6a' : '#1a3a6a'}
              emissiveIntensity={0.4}
            />
          </Box>
        </group>
      ))}
      {/* Central desk */}
      <Box args={[3, 0.1, 1.4]} position={[0, 0.95, 0]}>
        <meshStandardMaterial color="#1a1a3e" metalness={0.7} roughness={0.2} />
      </Box>
    </group>
  )
}

function StudioFloor() {
  const { scene } = useStudioStore()

  return (
    <group>
      {scene.chromaKey ? (
        <Plane args={[30, 30]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <meshStandardMaterial color={scene.chromaColor} />
        </Plane>
      ) : (
        <>
          <Plane args={[30, 30]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <meshStandardMaterial color={scene.floorColor} metalness={0.4} roughness={0.5} />
          </Plane>
          {scene.showGrid && (
            <Grid
              position={[0, 0.01, 0]}
              args={[30, 30]}
              cellSize={1}
              cellThickness={0.5}
              cellColor="#333355"
              sectionSize={5}
              sectionThickness={1}
              sectionColor="#444466"
              fadeDistance={20}
              fadeStrength={1}
              infiniteGrid
            />
          )}
        </>
      )}
    </group>
  )
}

function StudioWalls() {
  const { scene } = useStudioStore()

  return (
    <group>
      {/* Back wall */}
      <Plane args={[20, 8]} position={[0, 4, -7]}>
        <meshStandardMaterial color={scene.backgroundColor} metalness={0.2} roughness={0.6} />
      </Plane>
      {/* Side walls */}
      <Plane args={[14, 8]} position={[-10, 4, 0]} rotation={[0, Math.PI / 2, 0]}>
        <meshStandardMaterial color={scene.backgroundColor} metalness={0.2} roughness={0.6} />
      </Plane>
      <Plane args={[14, 8]} position={[10, 4, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <meshStandardMaterial color={scene.backgroundColor} metalness={0.2} roughness={0.6} />
      </Plane>
      {/* Ceiling */}
      <Plane args={[20, 14]} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#080810" metalness={0.1} roughness={0.8} />
      </Plane>
    </group>
  )
}

function StudioLights() {
  const { lighting } = useStudioStore()
  const colorTemp = useMemo(() => {
    const t = lighting.colorTemp
    if (t < 4000) return '#ff9944'
    if (t < 5000) return '#ffcc88'
    if (t < 6500) return '#ffffff'
    return '#aaccff'
  }, [lighting.colorTemp])

  return (
    <>
      {/* Key light */}
      <SpotLight
        position={[3, 6, 4]}
        angle={0.6}
        penumbra={0.5}
        intensity={lighting.keyIntensity * 50}
        color={colorTemp}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Fill light */}
      <SpotLight
        position={[-3, 5, 3]}
        angle={0.8}
        penumbra={0.7}
        intensity={lighting.fillIntensity * 30}
        color={colorTemp}
      />
      {/* Rim light */}
      <SpotLight
        position={[0, 4, -5]}
        angle={0.5}
        penumbra={0.3}
        intensity={lighting.rimIntensity * 40}
        color="#8899cc"
      />
      {/* Ambient */}
      <ambientLight intensity={lighting.ambientIntensity} color={colorTemp} />
      {/* Light fixtures visual */}
      <Cylinder args={[0.3, 0.3, 0.1, 16]} position={[3, 7.8, 4]}>
        <meshStandardMaterial color="#222233" emissive="#ffffcc" emissiveIntensity={0.3} />
      </Cylinder>
      <Cylinder args={[0.3, 0.3, 0.1, 16]} position={[-3, 7.8, 3]}>
        <meshStandardMaterial color="#222233" emissive="#ffffcc" emissiveIntensity={0.3} />
      </Cylinder>
      <Cylinder args={[0.3, 0.3, 0.1, 16]} position={[0, 7.8, -5]}>
        <meshStandardMaterial color="#222233" emissive="#ccddff" emissiveIntensity={0.3} />
      </Cylinder>
    </>
  )
}

function AROverlayObjects() {
  const { arObjects } = useStudioStore()

  return (
    <group>
      {arObjects.filter(o => o.visible).map((obj) => {
        switch (obj.type) {
          case 'lower-third':
            return (
              <group key={obj.id} position={[obj.position.x, obj.position.y, obj.position.z]}>
                <Box args={[4, 0.5, 0.02]}>
                  <meshStandardMaterial color="#cc0000" transparent opacity={obj.opacity} emissive="#cc0000" emissiveIntensity={0.3} />
                </Box>
                <Text position={[0, 0, 0.03]} fontSize={0.15} color="#ffffff" anchorX="center">
                  HOST NAME
                </Text>
              </group>
            )
          case 'ticker':
            return (
              <group key={obj.id} position={[obj.position.x, obj.position.y, obj.position.z]}>
                <Box args={[12, 0.35, 0.02]}>
                  <meshStandardMaterial color="#111133" transparent opacity={obj.opacity} emissive="#222255" emissiveIntensity={0.2} />
                </Box>
                <Float speed={4} rotationIntensity={0} floatIntensity={0.02}>
                  <Text position={[-4, 0, 0.03]} fontSize={0.1} color="#ffcc00" anchorX="left">
                    BREAKING: Live broadcast in progress...
                  </Text>
                </Float>
              </group>
            )
          case 'logo-watermark':
            return (
              <group key={obj.id} position={[obj.position.x, obj.position.y, obj.position.z]}>
                <Box args={[0.8, 0.8, 0.02]}>
                  <meshStandardMaterial color="#ffffff" transparent opacity={obj.opacity} emissive="#ffffff" emissiveIntensity={0.1} />
                </Box>
                <Text position={[0, 0, 0.03]} fontSize={0.12} color="#000000" anchorX="center" fontWeight="bold">
                  VS
                </Text>
              </group>
            )
          case 'data-visual':
            return (
              <group key={obj.id} position={[obj.position.x, obj.position.y, obj.position.z]}>
                <Box args={[2.5, 1.8, 0.02]}>
                  <meshStandardMaterial color="#0a1a2a" transparent opacity={obj.opacity} emissive="#1a3a5a" emissiveIntensity={0.3} />
                </Box>
                <Text position={[0, 0.6, 0.03]} fontSize={0.1} color="#4a90d9" anchorX="center">
                  LIVE DATA FEED
                </Text>
                {[0.6, 0.4, 0.8, 0.5, 0.7].map((h, i) => (
                  <Box key={i} args={[0.25, h, 0.02]} position={[(i - 2) * 0.4, h / 2 - 0.3, 0.03]}>
                    <meshStandardMaterial color="#4a90d9" transparent opacity={0.8} />
                  </Box>
                ))}
              </group>
            )
          case 'virtual-screen':
            return (
              <VirtualMonitor
                key={obj.id}
                position={[obj.position.x, obj.position.y, obj.position.z]}
                label="CAM 2 FEED"
              />
            )
          case 'particle-effect':
            return (
              <Float key={obj.id} speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
                <group position={[obj.position.x, obj.position.y, obj.position.z]}>
                  {[...Array(12)].map((_, i) => (
                    <Sphere key={i} args={[0.03, 6, 6]} position={[
                      Math.sin(i * 0.5) * 0.5,
                      Math.cos(i * 0.7) * 0.5,
                      Math.sin(i * 0.3) * 0.3
                    ]}>
                      <meshStandardMaterial color="#ffcc44" emissive="#ffcc44" emissiveIntensity={0.8} transparent opacity={0.6} />
                    </Sphere>
                  ))}
                </group>
              </Float>
            )
          default:
            return null
        }
      })}
    </group>
  )
}

function SceneContent() {
  const { scene, camera } = useStudioStore()

  const sceneFurniture = useMemo(() => {
    switch (scene.template) {
      case 'news-desk':
        return (
          <group>
            <NewsDesk />
            <VirtualMonitor position={[-4, 2, -5]} label="CAM 1" />
            <VirtualMonitor position={[4, 2, -5]} label="CAM 3" />
          </group>
        )
      case 'weather-studio':
        return <WeatherMap />
      case 'talk-show':
        return (
          <group>
            <TalkShowSetup />
            <VirtualMonitor position={[0, 3, -5]} label="AUDIENCE CAM" />
          </group>
        )
      case 'sports-arena':
        return <SportsArena />
      case 'election-hq':
        return <ElectionHQ />
      case 'breaking-news':
        return <BreakingNewsSet />
      default:
        return <NewsDesk />
    }
  }, [scene.template])

  return (
    <group>
      <StudioFloor />
      <StudioWalls />
      <StudioLights />
      {sceneFurniture}
      <AROverlayObjects />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.4} scale={20} blur={2} far={8} />
    </group>
  )
}

export default function VirtualStudioScene() {
  const { camera, depth, renderQuality } = useStudioStore()

  return (
    <Canvas
      shadows
      camera={{
        position: [camera.position.x, camera.position.y, camera.position.z],
        fov: camera.fov,
        near: 0.1,
        far: 100,
      }}
      dpr={renderQuality}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      style={{ background: '#050510' }}
    >
      <SceneContent />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2 + 0.1}
        target={[0, 1.5, 0]}
      />
      <Environment preset="city" />
    </Canvas>
  )
}

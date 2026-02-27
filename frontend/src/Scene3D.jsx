import { useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, Text } from '@react-three/drei'
import * as THREE from 'three'

// ─── Color map ────────────────────────────────────────────────────────────────
const SEVERITY_COLORS = {
    green: '#22c55e',
    yellow: '#eab308',
    red: '#ef4444',
}

// ─── Animated Machine Node ───────────────────────────────────────────────────
function MachineNode({ machine }) {
    const meshRef = useRef()
    const color = SEVERITY_COLORS[machine.severity] || '#22c55e'

    useFrame((state) => {
        if (!meshRef.current) return
        // Gentle bob to feel "alive"
        meshRef.current.position.y = machine.position.y + Math.sin(state.clock.elapsedTime * 1.5 + machine.position.x) * 0.05
        // Red alert: pulse scale
        if (machine.severity === 'red') {
            const s = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.08
            meshRef.current.scale.setScalar(s)
        } else {
            meshRef.current.scale.setScalar(1)
        }
    })

    return (
        <group position={[machine.position.x, 0, machine.position.z]}>
            {/* Base platform */}
            <mesh position={[0, 0.1, 0]} receiveShadow>
                <boxGeometry args={[1.8, 0.2, 1.8]} />
                <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            {/* Machine body */}
            <mesh ref={meshRef} position={[0, 0.8, 0]} castShadow>
                <boxGeometry args={[1.2, 1.2, 1.2]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={machine.severity === 'red' ? 0.5 : 0.2}
                    roughness={0.4}
                    metalness={0.6}
                />
            </mesh>
            {/* Point light to cast glow */}
            <pointLight position={[0, 2, 0]} color={color} intensity={machine.severity === 'red' ? 2 : 0.8} distance={5} />
            {/* Label */}
            <Text
                position={[0, 2.2, 0]}
                fontSize={0.3}
                color={color}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.02}
                outlineColor="#000000"
            >
                {machine.id}
            </Text>
        </group>
    )
}

// ─── Drone Sphere ─────────────────────────────────────────────────────────────
function DroneNode({ drone }) {
    const meshRef = useRef()
    useFrame((state) => {
        if (!meshRef.current) return
        // Smooth approach to target position
        meshRef.current.position.x += (drone.x - meshRef.current.position.x) * 0.15
        meshRef.current.position.y += (drone.y - meshRef.current.position.y) * 0.15
        meshRef.current.position.z += (drone.z - meshRef.current.position.z) * 0.15
        // Rotation
        meshRef.current.rotation.y = state.clock.elapsedTime
    })

    return (
        <mesh ref={meshRef} position={[drone.x, drone.y, drone.z]} castShadow>
            <octahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color="#60a5fa" emissive="#3b82f6" emissiveIntensity={0.6} metalness={0.9} roughness={0.1} />
        </mesh>
    )
}

// ─── Factory Floor ────────────────────────────────────────────────────────────
function FactoryFloor() {
    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[30, 20]} />
                <meshStandardMaterial color="#0d1117" roughness={0.9} />
            </mesh>
            <Grid
                args={[30, 20]}
                cellSize={1}
                cellColor="#1e293b"
                sectionColor="#1e293b"
                fadeDistance={40}
                infiniteGrid={false}
            />
        </>
    )
}

// ─── Scene ────────────────────────────────────────────────────────────────────
export default function Scene3D({ machines, drones }) {
    return (
        <Canvas
            camera={{ position: [0, 12, 18], fov: 45 }}
            shadows
            style={{ background: '#030712' }}
        >
            <ambientLight intensity={0.3} />
            <directionalLight position={[10, 15, 10]} intensity={0.6} castShadow />
            <fog attach="fog" args={['#030712', 25, 50]} />

            <FactoryFloor />

            {machines.map((m) => (
                <MachineNode key={m.id} machine={m} />
            ))}
            {drones.map((d) => (
                <DroneNode key={d.id} drone={d} />
            ))}

            <OrbitControls
                enablePan={true}
                enableZoom={true}
                autoRotate={true}
                autoRotateSpeed={0.4}
                maxPolarAngle={Math.PI / 2.1}
            />
        </Canvas>
    )
}

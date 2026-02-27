import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import { analyzeMachine } from './physicsEngine'
import Scene3D from './Scene3D'

const BACKEND_URL = 'http://localhost:3001'

const MAX_POWER_LOSS_W = 3000 // for progress bar scaling

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n, dec = 1) {
    return Number(n).toFixed(dec)
}

function useCurrentTime() {
    const [time, setTime] = useState(new Date())
    useEffect(() => {
        const id = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(id)
    }, [])
    return time.toLocaleTimeString('en-IN', { hour12: false })
}

// ─── Machine Card Component ───────────────────────────────────────────────────
function MachineCard({ machine }) {
    const pct = Math.min(100, (machine.power_loss_w / MAX_POWER_LOSS_W) * 100)
    const barColor = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }[machine.severity]

    const severityLabel = { green: 'Normal', yellow: 'Moderate Loss', red: 'Critical' }[machine.severity]

    return (
        <div className={`machine-card ${machine.severity}`}>
            <div className="machine-header">
                <div>
                    <div className="machine-name">{machine.name}</div>
                    <div className="machine-id">{machine.id}</div>
                </div>
                <div className={`severity-badge ${machine.severity}`}>{severityLabel}</div>
            </div>

            {machine.severity === 'red' && (
                <div className="alert-banner">
                    <span>⚠</span>
                    <span>Kinetic Anomaly Detected — High thermal radiation loss</span>
                </div>
            )}

            {machine.acousticAnomaly && machine.severity !== 'red' && (
                <div className="alert-banner" style={{ borderColor: 'rgba(234,179,8,0.3)', color: '#eab308', background: 'rgba(234,179,8,0.08)' }}>
                    <span>🔊</span>
                    <span>Acoustic anomaly — High frequency detected ({fmt(machine.hz_peak / 1000, 1)} kHz)</span>
                </div>
            )}

            <div className="machine-metrics">
                <div className="metric">
                    <span className="metric-label">Surface Temp</span>
                    <span className="metric-value" style={{ color: machine.severity === 'red' ? '#ef4444' : machine.severity === 'yellow' ? '#eab308' : '#22c55e' }}>
                        {fmt(machine.temp_surface)}°C
                    </span>
                </div>
                <div className="metric">
                    <span className="metric-label">Acoustic Peak</span>
                    <span className="metric-value">{fmt(machine.hz_peak / 1000, 1)} kHz</span>
                </div>
                <div className="metric">
                    <span className="metric-label">Power Loss</span>
                    <span className="metric-value" style={{ fontWeight: 700 }}>{fmt(machine.power_loss_w)} W</span>
                </div>
                <div className="metric">
                    <span className="metric-label">kWh / hr</span>
                    <span className="metric-value">{fmt(machine.kwh_loss, 3)}</span>
                </div>
            </div>

            <div className="power-bar-wrap">
                <div className="power-bar-label">
                    <span>Energy Loss</span>
                    <span>{fmt(pct)}%</span>
                </div>
                <div className="power-bar-track">
                    <div className="power-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
            </div>
        </div>
    )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
    const [machines, setMachines] = useState([])
    const [drones, setDrones] = useState([])
    const [connected, setConnected] = useState(false)
    const [tickCount, setTickCount] = useState(0)
    const socketRef = useRef(null)
    const time = useCurrentTime()

    useEffect(() => {
        const socket = io(BACKEND_URL, { transports: ['websocket'] })
        socketRef.current = socket

        socket.on('connect', () => setConnected(true))
        socket.on('disconnect', () => setConnected(false))

        socket.on('telemetry', (data) => {
            const analyzed = data.machines.map(analyzeMachine)
            setMachines(analyzed)
            setDrones(data.drones)
            setTickCount((c) => c + 1)
        })

        return () => socket.disconnect()
    }, [])

    // ── Aggregated stats ──────────────────────────────────────────────────────
    const totalPowerLoss = machines.reduce((sum, m) => sum + m.power_loss_w, 0)
    const totalKwh = machines.reduce((sum, m) => sum + m.kwh_loss, 0)
    const criticalCount = machines.filter((m) => m.severity === 'red').length
    const anomalyCount = machines.filter((m) => m.acousticAnomaly).length

    return (
        <div className="app">
            {/* ── Header ── */}
            <header className="header">
                <div className="header-brand">
                    <div className="brand-icon">⚡</div>
                    <div>
                        <div className="brand-name">AeroPulse</div>
                        <div className="brand-tagline">Mobile Sensing as a Service · Digital Twin</div>
                    </div>
                </div>
                <div className="header-status">
                    <div className="status-dot" style={{ background: connected ? '#22c55e' : '#ef4444', boxShadow: connected ? '0 0 8px #22c55e' : '0 0 8px #ef4444' }} />
                    {connected ? 'Live Stream Active' : 'Connecting…'}
                </div>
                <div className="header-time">{time}</div>
            </header>

            {/* ── Main ── */}
            <div className="main">
                {/* ── Sidebar ── */}
                <aside className="sidebar">
                    {/* Stats */}
                    <div>
                        <div className="sidebar-section-title">Factory Overview</div>
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-label">Total Loss</div>
                                <div className="stat-value" style={{ color: criticalCount > 0 ? '#ef4444' : '#f1f5f9' }}>
                                    {fmt(totalPowerLoss)}<span className="stat-unit"> W</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">kWh / hr</div>
                                <div className="stat-value">{fmt(totalKwh, 3)}<span className="stat-unit"> kWh</span></div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Critical</div>
                                <div className="stat-value" style={{ color: criticalCount > 0 ? '#ef4444' : '#22c55e' }}>
                                    {criticalCount}
                                </div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-label">Drones</div>
                                <div className="stat-value" style={{ color: '#60a5fa' }}>{drones.length}</div>
                            </div>
                        </div>
                    </div>

                    {/* Machine Cards */}
                    <div>
                        <div className="sidebar-section-title">Machine Status</div>
                        {machines.length === 0 ? (
                            <div className="loader" style={{ height: 200 }}>
                                <div className="spinner" />
                                <span>Waiting for telemetry…</span>
                            </div>
                        ) : (
                            machines.map((m) => <MachineCard key={m.id} machine={m} />)
                        )}
                    </div>
                </aside>

                {/* ── 3D Viewport ── */}
                <section className="viewport">
                    <div className="viewport-header">
                        <span className="viewport-title">👁 Ghost Grid · 3D Factory Digital Twin</span>
                        <div className="legend">
                            <div className="legend-item"><div className="legend-dot" style={{ background: '#22c55e' }} /> Normal</div>
                            <div className="legend-item"><div className="legend-dot" style={{ background: '#eab308' }} /> Moderate</div>
                            <div className="legend-item"><div className="legend-dot" style={{ background: '#ef4444' }} /> Critical</div>
                            <div className="legend-item"><div className="legend-dot" style={{ background: '#60a5fa' }} /> Drone</div>
                        </div>
                    </div>
                    <div className="canvas-wrap">
                        <Scene3D machines={machines} drones={drones} />
                        {/* Drone position overlay */}
                        <div className="drone-overlay">
                            {drones.map((d) => (
                                <div key={d.id} className="drone-pill">
                                    {d.id} · ({fmt(d.x, 1)}, {fmt(d.y, 1)}, {fmt(d.z, 1)})
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}

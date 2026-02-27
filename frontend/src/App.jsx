import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = 'http://localhost:3001'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n, d = 2) { return Number(n || 0).toFixed(d) }

function useTime() {
    const [t, setT] = useState(new Date())
    useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
    return t.toLocaleTimeString('en-IN', { hour12: false })
}

const MODE_LABELS = {
    idle: { label: 'IDLE', color: '#64748b' },
    cutting: { label: 'CUTTING', color: '#22c55e' },
    rapid: { label: 'RAPID MOVE', color: '#3b82f6' },
    tool_change: { label: 'TOOL CHANGE', color: '#a855f7' },
}

// ─── Mini Sparkline SVG ───────────────────────────────────────────────────────
function Sparkline({ data, color, max }) {
    if (!data || data.length < 2) return null
    const w = 200, h = 40, pad = 2
    const points = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2)
        const y = h - pad - ((v / max) * (h - pad * 2))
        return `${x},${y}`
    }).join(' ')

    return (
        <svg width={w} height={h} style={{ display: 'block' }}>
            <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
            <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </svg>
    )
}

// ─── Component Power Row ──────────────────────────────────────────────────────
function ComponentRow({ label, claimed, actual }) {
    const pct = claimed > 0 ? Math.min(100, (actual / claimed) * 100) : 0
    const color = pct > 90 ? '#ef4444' : pct > 60 ? '#eab308' : '#22c55e'
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: '#94a3b8' }}>{label}</span>
                <span>
                    <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(actual)} kW</span>
                    <span style={{ color: '#475569', fontSize: 10 }}> / {fmt(claimed)} kW</span>
                </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    )
}

// ─── Claimed vs Actual Gauge ──────────────────────────────────────────────────
function PowerGauge({ label, value, max, color, unit = 'kW' }) {
    const pct = Math.min(100, (value / max) * 100)
    const r = 45, cx = 60, cy = 60
    const circumference = 2 * Math.PI * r
    const dash = (pct / 100) * circumference * 0.75
    const offset = circumference * 0.125

    return (
        <div style={{ textAlign: 'center' }}>
            <svg width={120} height={100} viewBox="0 0 120 110">
                {/* Track */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}
                    strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
                    strokeDashoffset={-offset} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
                {/* Fill */}
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset} strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                {/* Value */}
                <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="15" fontWeight="700" fontFamily="JetBrains Mono, monospace">
                    {fmt(value, 1)}
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">
                    {unit}
                </text>
            </svg>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: -8 }}>{label}</div>
        </div>
    )
}

// ─── Machine Detail Panel ─────────────────────────────────────────────────────
function MachinePanel({ machine }) {
    const modeInfo = MODE_LABELS[machine.mode] || { label: machine.mode, color: '#64748b' }
    const isOver = machine.actual_total_kw > machine.claimed_total_kw
    const deviationColor = isOver ? '#ef4444' : '#22c55e'
    const devSign = machine.deviation_kw > 0 ? '+' : ''
    const effColor = machine.efficiency_pct > 80 ? '#ef4444' : machine.efficiency_pct > 50 ? '#eab308' : '#22c55e'

    return (
        <div className="machine-panel">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{machine.name}</div>
                    <div style={{ fontSize: 11, color: '#475569' }}>{machine.make} · {machine.model} · {machine.location}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ background: modeInfo.color + '22', color: modeInfo.color, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: 1 }}>
                        {modeInfo.label}
                    </span>
                    <span style={{ fontSize: 9, color: '#475569' }}>{machine.id}</span>
                </div>
            </div>

            {/* Gauges Row */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 0' }}>
                <PowerGauge label="CLAIMED" value={machine.claimed_total_kw} max={machine.claimed_total_kw * 1.2} color="#3b82f6" />
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, color: '#475569' }}>DEVIATION</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: deviationColor }}>
                        {devSign}{fmt(machine.deviation_kw, 2)}
                    </div>
                    <div style={{ fontSize: 9, color: '#475569' }}>kW</div>
                    <div style={{ fontSize: 10, color: effColor, fontWeight: 600 }}>Load: {fmt(machine.efficiency_pct, 1)}%</div>
                </div>
                <PowerGauge label="ACTUAL" value={machine.actual_total_kw} max={machine.claimed_total_kw * 1.2} color={effColor} />
            </div>

            {/* Sparkline */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#475569', marginBottom: 4, letterSpacing: 1 }}>POWER HISTORY (LAST 30s)</div>
                <Sparkline data={machine.history} color="#3b82f6" max={machine.claimed_total_kw * 1.2} />
            </div>

            {/* Component Breakdown */}
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>COMPONENT BREAKDOWN (ACTUAL vs CLAIMED)</div>
            <ComponentRow label="⚙ Spindle Motor" claimed={machine.claimed.spindle_kw} actual={machine.actual?.spindle_kw} />
            <ComponentRow label="↔ X-Axis Servo" claimed={machine.claimed.x_axis_kw} actual={machine.actual?.x_axis_kw} />
            <ComponentRow label="↕ Y-Axis Servo" claimed={machine.claimed.y_axis_kw} actual={machine.actual?.y_axis_kw} />
            <ComponentRow label="↗ Z-Axis Servo" claimed={machine.claimed.z_axis_kw} actual={machine.actual?.z_axis_kw} />
            <ComponentRow label="💧 Coolant Pump" claimed={machine.claimed.coolant_kw} actual={machine.actual?.coolant_kw} />
            <ComponentRow label="🔧 ATC (Tool Changer)" claimed={machine.claimed.atc_kw} actual={machine.actual?.atc_kw} />
            <ComponentRow label="💡 Aux / Control" claimed={machine.claimed.aux_kw} actual={machine.actual?.aux_kw} />
        </div>
    )
}

// ─── Sidebar Machine Card ─────────────────────────────────────────────────────
function SidebarCard({ machine, selected, onClick }) {
    const pct = Math.min(100, (machine.actual_total_kw / machine.claimed_total_kw) * 100)
    const severity = pct > 90 ? 'red' : pct > 55 ? 'yellow' : 'green'
    const color = { red: '#ef4444', yellow: '#eab308', green: '#22c55e' }[severity]
    const modeInfo = MODE_LABELS[machine.mode] || { label: machine.mode, color: '#64748b' }

    return (
        <div className={`machine-card ${severity} ${selected ? 'selected' : ''}`} onClick={onClick}
            style={{ cursor: 'pointer', outline: selected ? `2px solid ${color}` : 'none', outlineOffset: 1 }}>
            <div className="machine-header">
                <div>
                    <div className="machine-name">{machine.name}</div>
                    <div className="machine-id">{machine.id}</div>
                </div>
                <div className={`severity-badge ${severity}`}>
                    {pct > 90 ? 'OVER LOAD' : pct > 55 ? 'ACTIVE' : 'LOW'}
                </div>
            </div>
            <div className="machine-metrics">
                <div className="metric">
                    <span className="metric-label">Actual</span>
                    <span className="metric-value" style={{ color }}>{fmt(machine.actual_total_kw, 1)} kW</span>
                </div>
                <div className="metric">
                    <span className="metric-label">Claimed</span>
                    <span className="metric-value">{fmt(machine.claimed_total_kw, 1)} kW</span>
                </div>
            </div>
            <div className="power-bar-wrap" style={{ marginTop: 8 }}>
                <div className="power-bar-label">
                    <span style={{ color: modeInfo.color, fontSize: 9, fontWeight: 700 }}>● {modeInfo.label}</span>
                    <span>{fmt(pct, 1)}% load</span>
                </div>
                <div className="power-bar-track">
                    <div className="power-bar-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
            </div>
        </div>
    )
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────
function SummaryBar({ machines }) {
    const totalActual = machines.reduce((s, m) => s + m.actual_total_kw, 0)
    const totalClaimed = machines.reduce((s, m) => s + m.claimed_total_kw, 0)
    const costPerHour = totalActual * 7.5  // ₹7.5 per unit (avg India industrial tariff)
    const overage = ((totalActual - totalClaimed) / totalClaimed * 100)

    return (
        <div className="summary-bar">
            <div className="summary-item">
                <div className="summary-label">Total Actual Load</div>
                <div className="summary-value" style={{ color: '#3b82f6' }}>{fmt(totalActual, 2)} <span className="stat-unit">kW</span></div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Total Claimed (Nameplate)</div>
                <div className="summary-value">{fmt(totalClaimed, 2)} <span className="stat-unit">kW</span></div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Load vs Nameplate</div>
                <div className="summary-value" style={{ color: overage > 0 ? '#ef4444' : '#22c55e' }}>
                    {overage > 0 ? '+' : ''}{fmt(overage, 1)}<span className="stat-unit">%</span>
                </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Est. Cost / hr</div>
                <div className="summary-value" style={{ color: '#eab308' }}>₹{fmt(costPerHour, 1)}</div>
            </div>
        </div>
    )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
    const [machines, setMachines] = useState([])
    const [connected, setConnected] = useState(false)
    const [selected, setSelected] = useState(0)
    const time = useTime()

    useEffect(() => {
        const socket = io(BACKEND_URL, { transports: ['websocket'] })
        socket.on('connect', () => setConnected(true))
        socket.on('disconnect', () => setConnected(false))
        socket.on('telemetry', (data) => setMachines(data.machines))
        return () => socket.disconnect()
    }, [])

    const selectedMachine = machines[selected]

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <div className="header-brand">
                    <div className="brand-icon">⚡</div>
                    <div>
                        <div className="brand-name">AeroPulse – VMC Energy Monitor</div>
                        <div className="brand-tagline">Claimed vs Actual Power · Real-time CNC Energy Intelligence</div>
                    </div>
                </div>
                <div className="header-status">
                    <div className="status-dot" style={{ background: connected ? '#22c55e' : '#ef4444', boxShadow: `0 0 8px ${connected ? '#22c55e' : '#ef4444'}` }} />
                    {connected ? 'Live Stream Active' : 'Connecting…'}
                </div>
                <div className="header-time">{time}</div>
            </header>

            {/* Summary Bar */}
            {machines.length > 0 && <SummaryBar machines={machines} />}

            {/* Main */}
            <div className="main" style={{ gridTemplateColumns: '280px 1fr' }}>
                {/* Sidebar */}
                <aside className="sidebar">
                    <div className="sidebar-section-title">VMC Machines</div>
                    {machines.length === 0 ? (
                        <div className="loader" style={{ height: 200 }}>
                            <div className="spinner" />
                            <span>Waiting for telemetry…</span>
                        </div>
                    ) : (
                        machines.map((m, i) => (
                            <SidebarCard key={m.id} machine={m} selected={selected === i} onClick={() => setSelected(i)} />
                        ))
                    )}
                </aside>

                {/* Detail Panel */}
                <section className="viewport" style={{ overflowY: 'auto', padding: 20 }}>
                    {!selectedMachine ? (
                        <div className="loader"><div className="spinner" /><span>Connecting to machine telemetry…</span></div>
                    ) : (
                        <MachinePanel machine={selectedMachine} />
                    )}
                </section>
            </div>
        </div>
    )
}

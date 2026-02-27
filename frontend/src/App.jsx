import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = 'http://localhost:3001'

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

const IE_COLORS = { IE1: '#ef4444', IE2: '#eab308', IE3: '#3b82f6', IE4: '#22c55e', IE5: '#a855f7' }
const IE_LABELS = { IE1: 'Standard', IE2: 'High Eff.', IE3: 'Premium', IE4: 'Super Prem.', IE5: 'Ultra Prem.' }

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color, max }) {
    if (!data || data.length < 2) return null
    const w = 200, h = 36, pad = 2
    const points = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2)
        const y = h - pad - ((v / (max || 1)) * (h - pad * 2))
        return `${x},${y}`
    }).join(' ')
    return (
        <svg width={w} height={h} style={{ display: 'block', width: '100%' }}>
            <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// ─── Arc Gauge ────────────────────────────────────────────────────────────────
function PowerGauge({ label, value, max, color }) {
    const r = 42, cx = 56, cy = 56
    const circ = 2 * Math.PI * r
    const pct = Math.min(100, (value / (max || 1)) * 100)
    const dash = (pct / 100) * circ * 0.75
    const offset = circ * 0.125
    return (
        <div style={{ textAlign: 'center' }}>
            <svg width={112} height={96} viewBox="0 0 112 100">
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7}
                    strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={-offset}
                    strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7}
                    strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
                    strokeLinecap="round" transform={`rotate(135 ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="13" fontWeight="700" fontFamily="JetBrains Mono,monospace">
                    {fmt(value, 1)}
                </text>
                <text x={cx} y={cy + 11} textAnchor="middle" fill="#64748b" fontSize="9">kW</text>
            </svg>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: -6 }}>{label}</div>
        </div>
    )
}

// ─── Component Breakdown Row ──────────────────────────────────────────────────
function ComponentRow({ label, claimed, actual, ieClass, hasVfd }) {
    const pct = claimed > 0 ? Math.min(100, (actual / claimed) * 100) : 0
    const barColor = pct > 95 ? '#ef4444' : pct > 65 ? '#eab308' : '#22c55e'
    const ieColor = IE_COLORS[ieClass] || '#64748b'
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#94a3b8' }}>{label}</span>
                    <span style={{ fontSize: 9, background: ieColor + '22', color: ieColor, padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{ieClass}</span>
                    {hasVfd && <span style={{ fontSize: 9, background: '#3b82f622', color: '#3b82f6', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>VFD</span>}
                </div>
                <span>
                    <span style={{ color: barColor, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(actual)} kW</span>
                    <span style={{ color: '#475569', fontSize: 10 }}> / {fmt(claimed)} kW</span>
                </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    )
}

// ─── Savings Scenario Card ────────────────────────────────────────────────────
function ScenarioCard({ scenario, key_, isActive }) {
    const paybackYrs = scenario.saving_rs_year > 0
        ? (scenario.est_cost_rs / scenario.saving_rs_year).toFixed(1)
        : '∞'
    const highlight = isActive
    return (
        <div style={{
            background: highlight ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${highlight ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 10, padding: '12px', flex: '1 1 140px', minWidth: 140,
        }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: highlight ? '#60a5fa' : '#94a3b8', marginBottom: 6 }}>{scenario.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#22c55e' }}>
                -{fmt(scenario.saving_kw, 2)} <span style={{ fontSize: 11, fontWeight: 400, color: '#64748b' }}>kW</span>
            </div>
            <div style={{ fontSize: 11, color: '#eab308', marginTop: 2 }}>saves {scenario.saving_pct}%</div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                    <span>Annual saving</span>
                    <span style={{ color: '#22c55e' }}>₹{(scenario.saving_rs_year / 1000).toFixed(0)}K</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                    <span>Install cost</span>
                    <span>₹{(scenario.est_cost_rs / 1000).toFixed(0)}K</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                    <span>Payback</span>
                    <span style={{ color: parseFloat(paybackYrs) < 2 ? '#22c55e' : parseFloat(paybackYrs) < 4 ? '#eab308' : '#ef4444', fontWeight: 700 }}>
                        {paybackYrs} yrs
                    </span>
                </div>
            </div>
        </div>
    )
}

// ─── Sidebar Card ─────────────────────────────────────────────────────────────
function SidebarCard({ machine, selected, onClick }) {
    const pct = Math.min(100, (machine.actual_total_kw / machine.claimed_total_kw) * 100)
    const severity = pct > 90 ? 'red' : pct > 50 ? 'yellow' : 'green'
    const color = { red: '#ef4444', yellow: '#eab308', green: '#22c55e' }[severity]
    const modeInfo = MODE_LABELS[machine.mode] || { label: machine.mode, color: '#64748b' }

    // Best recommended upgrade
    const sc = machine.savings?.scenarios
    const bestKey = sc ? Object.keys(sc).reduce((a, k) => sc[k].saving_pct > sc[a].saving_pct ? k : a, 'ie3') : null
    const best = sc ? sc[bestKey] : null

    return (
        <div className={`machine-card ${severity} ${selected ? 'selected' : ''}`}
            onClick={onClick} style={{ cursor: 'pointer', outline: selected ? `2px solid ${color}` : 'none', outlineOffset: 1 }}>
            <div className="machine-header">
                <div>
                    <div className="machine-name">{machine.name}</div>
                    <div className="machine-id">{machine.id} · {machine.year}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <div className={`severity-badge ${severity}`}>{pct > 90 ? 'HIGH LOAD' : pct > 50 ? 'ACTIVE' : 'LOW'}</div>
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
                    <span>{fmt(pct, 1)}%</span>
                </div>
                <div className="power-bar-track">
                    <div className="power-bar-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
            </div>
            {best && (
                <div style={{ marginTop: 8, fontSize: 9, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚡</span>
                    <span>Best upgrade: <b>{best.label}</b> saves {best.saving_pct}% (₹{(best.saving_rs_year / 1000).toFixed(0)}K/yr)</span>
                </div>
            )}
        </div>
    )
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────
function SummaryBar({ machines }) {
    const totalActual = machines.reduce((s, m) => s + m.actual_total_kw, 0)
    const totalClaimed = machines.reduce((s, m) => s + m.claimed_total_kw, 0)
    const costPerHour = totalActual * 7.5
    const totalSavingKw = machines.reduce((s, m) => s + (m.savings?.scenarios?.full_upgrade?.saving_kw || 0), 0)
    const overage = (totalActual / totalClaimed) * 100

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
                <div className="summary-label">Load Factor</div>
                <div className="summary-value" style={{ color: overage > 85 ? '#ef4444' : '#22c55e' }}>
                    {fmt(overage, 1)}<span className="stat-unit">%</span>
                </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Est. Cost / hr</div>
                <div className="summary-value" style={{ color: '#eab308' }}>₹{fmt(costPerHour, 1)}</div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Potential Saving (IE5+VFD)</div>
                <div className="summary-value" style={{ color: '#22c55e' }}>-{fmt(totalSavingKw, 2)} <span className="stat-unit">kW</span></div>
            </div>
        </div>
    )
}

// ─── Machine Detail Panel ─────────────────────────────────────────────────────
function MachinePanel({ machine }) {
    const modeInfo = MODE_LABELS[machine.mode] || { label: machine.mode, color: '#64748b' }
    const isOver = machine.actual_total_kw > machine.claimed_total_kw
    const devColor = isOver ? '#ef4444' : '#22c55e'
    const effColor = machine.efficiency_pct > 80 ? '#f97316' : machine.efficiency_pct > 50 ? '#eab308' : '#22c55e'
    const devSign = machine.deviation_kw > 0 ? '+' : ''

    const sc = machine.savings?.scenarios || {}

    const COMPS = [
        { key: 'spindle_kw', label: '⚙ Spindle Motor', ieKey: 'spindle', vfdKey: 'spindle' },
        { key: 'x_axis_kw', label: '↔ X-Axis Servo', ieKey: 'x_axis', vfdKey: null },
        { key: 'y_axis_kw', label: '↕ Y-Axis Servo', ieKey: 'y_axis', vfdKey: null },
        { key: 'z_axis_kw', label: '↗ Z-Axis Servo', ieKey: 'z_axis', vfdKey: null },
        { key: 'coolant_kw', label: '💧 Coolant Pump', ieKey: 'coolant', vfdKey: 'coolant' },
        { key: 'atc_kw', label: '🔧 ATC Tool Changer', ieKey: 'atc', vfdKey: 'atc' },
        { key: 'aux_kw', label: '💡 Aux / Control', ieKey: 'aux', vfdKey: 'aux' },
    ]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Machine Header Card */}
            <div className="machine-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{machine.name}</div>
                        <div style={{ fontSize: 11, color: '#475569' }}>{machine.make} · {machine.model} · Installed {machine.year} · {machine.location}</div>
                    </div>
                    <span style={{ background: modeInfo.color + '22', color: modeInfo.color, fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 20, letterSpacing: 1 }}>
                        {modeInfo.label}
                    </span>
                </div>

                {/* Gauges */}
                <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 0', marginBottom: 14 }}>
                    <PowerGauge label="CLAIMED" value={machine.claimed_total_kw} max={machine.claimed_total_kw * 1.2} color="#3b82f6" />
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
                        <div style={{ fontSize: 10, color: '#475569' }}>DEVIATION</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: devColor }}>{devSign}{fmt(machine.deviation_kw, 2)}</div>
                        <div style={{ fontSize: 9, color: '#475569' }}>kW</div>
                        <div style={{ fontSize: 10, color: effColor, fontWeight: 600 }}>Load: {fmt(machine.efficiency_pct, 1)}%</div>
                    </div>
                    <PowerGauge label="ACTUAL" value={machine.actual_total_kw} max={machine.claimed_total_kw * 1.2} color={effColor} />
                </div>

                {/* Sparkline */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 4 }}>POWER TREND (LAST 30s)</div>
                    <Sparkline data={machine.history} color="#3b82f6" max={machine.claimed_total_kw * 1.2} />
                </div>

                {/* Component Breakdown */}
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>COMPONENT BREAKDOWN — ACTUAL vs CLAIMED
                    <span style={{ marginLeft: 8, color: '#64748b', fontSize: 9 }}>(IE class & VFD shown per component)</span>
                </div>
                {COMPS.map(({ key, label, ieKey, vfdKey }) => (
                    <ComponentRow
                        key={key}
                        label={label}
                        claimed={machine.claimed[key]}
                        actual={machine.actual[key]}
                        ieClass={machine.currentMotorClass[ieKey]}
                        hasVfd={vfdKey && machine.hasVFD[vfdKey]}
                    />
                ))}
            </div>

            {/* Optimizer Panel */}
            <div className="machine-panel">
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>⚡ Efficiency Upgrade Optimizer</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                        Compare energy & cost savings for VFD and IE3/IE4/IE5 motor upgrades. Based on ₹7.5/kWh tariff · 6000 hrs/yr operation.
                    </div>
                </div>

                {/* Current status */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {Object.entries(machine.currentMotorClass).map(([comp, cls]) => (
                        <div key={comp} style={{
                            background: 'rgba(255,255,255,0.03)', border: `1px solid ${IE_COLORS[cls]}44`,
                            borderRadius: 8, padding: '6px 10px', fontSize: 10
                        }}>
                            <div style={{ color: '#64748b', marginBottom: 1, fontSize: 9 }}>{comp.replace('_', ' ').toUpperCase()}</div>
                            <span style={{ color: IE_COLORS[cls], fontWeight: 700 }}>{cls}</span>
                            <span style={{ color: '#64748b', fontSize: 9 }}> {IE_LABELS[cls]}</span>
                            {machine.hasVFD[comp] && <span style={{ marginLeft: 4, fontSize: 8, color: '#3b82f6', fontWeight: 700 }}>+VFD</span>}
                        </div>
                    ))}
                </div>

                {/* Scenario Cards */}
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>UPGRADE SCENARIOS</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {Object.entries(sc).map(([key, scenario]) => (
                        <ScenarioCard key={key} key_={key} scenario={scenario}
                            isActive={key === 'full_upgrade'} />
                    ))}
                </div>
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
        socket.on('telemetry', (d) => setMachines(d.machines))
        return () => socket.disconnect()
    }, [])

    const selectedMachine = machines[selected]

    return (
        <div className="app">
            <header className="header">
                <div className="header-brand">
                    <div className="brand-icon">⚡</div>
                    <div>
                        <div className="brand-name">AeroPulse – VMC Energy Monitor</div>
                        <div className="brand-tagline">Real-time Power · IE Motor Efficiency · VFD Optimization</div>
                    </div>
                </div>
                <div className="header-status">
                    <div className="status-dot" style={{ background: connected ? '#22c55e' : '#ef4444', boxShadow: `0 0 8px ${connected ? '#22c55e' : '#ef4444'}` }} />
                    {connected ? 'Live Stream Active' : 'Connecting…'}
                </div>
                <div className="header-time">{time}</div>
            </header>

            {machines.length > 0 && <SummaryBar machines={machines} />}

            <div className="main" style={{ gridTemplateColumns: '280px 1fr' }}>
                <aside className="sidebar">
                    <div className="sidebar-section-title">VMC Machines</div>
                    {machines.length === 0 ? (
                        <div className="loader" style={{ height: 200 }}><div className="spinner" /><span>Connecting…</span></div>
                    ) : (
                        machines.map((m, i) => (
                            <SidebarCard key={m.id} machine={m} selected={selected === i} onClick={() => setSelected(i)} />
                        ))
                    )}
                </aside>

                <section className="viewport" style={{ overflowY: 'auto', padding: 20 }}>
                    {!selectedMachine ? (
                        <div className="loader"><div className="spinner" /><span>Waiting for telemetry…</span></div>
                    ) : (
                        <MachinePanel machine={selectedMachine} />
                    )}
                </section>
            </div>
        </div>
    )
}

import { useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = 'http://localhost:3001'

function fmt(n, d = 2) { return Number(n || 0).toFixed(d) }
function useTime() {
    const [t, setT] = useState(new Date())
    useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
    return t
}

const MODE_LABELS = {
    idle: { label: 'IDLE', color: '#64748b' },
    cutting: { label: 'CUTTING', color: '#22c55e' },
    rapid: { label: 'RAPID MOVE', color: '#3b82f6' },
    tool_change: { label: 'TOOL CHANGE', color: '#a855f7' },
}
const IE_COLORS = { IE1: '#ef4444', IE2: '#eab308', IE3: '#3b82f6', IE4: '#22c55e', IE5: '#a855f7' }
const PHASE_COLORS = { L1: '#ef4444', L2: '#eab308', L3: '#22c55e' }

// ─── Sparkline ────────────────────────────────────────────────────────────────
// Each instance gets a unique gradient ID to avoid SVG defs ID collision
let _sparkId = 0
function Sparkline({ data, color, max }) {
    const [gid] = useState(() => `sg_${_sparkId++}`)
    if (!data || data.length < 2) return null
    const w = 300, h = 50, pad = 2
    const pts = data.map((v, i) => {
        const x = pad + (i / (data.length - 1)) * (w - pad * 2)
        const y = h - pad - ((v / (max || 1)) * (h - pad * 2))
        return `${x},${y}`
    }).join(' ')
    return (
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
            <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient></defs>
            <polygon fill={`url(#${gid})`} points={`${pad},${h} ${pts} ${w - pad},${h}`} />
            <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// ─── Digital LCD Number ───────────────────────────────────────────────────────
function LCDValue({ value, unit, label, color = '#22c55e', size = 28 }) {
    return (
        <div style={{ textAlign: 'center', padding: '8px 12px' }}>
            <div style={{
                fontSize: size, fontWeight: 900, fontFamily: 'var(--font-mono)',
                color, letterSpacing: -1, lineHeight: 1, textShadow: `0 0 20px ${color}55`
            }}>
                {value}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{unit}</div>
            {label && <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 }}>{label}</div>}
        </div>
    )
}

// ─── Phase Current Bar ────────────────────────────────────────────────────────
function PhaseBar({ phase, current, voltage, rated }) {
    const pct = Math.min(100, (current / (rated || 50)) * 100)
    const color = PHASE_COLORS[phase]
    const warning = pct > 85
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: color + '22', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color }}>{phase}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color, fontSize: 15, fontWeight: 800 }}>{fmt(current, 1)} A</span>
                    {warning && <span style={{ fontSize: 9, background: '#ef444422', color: '#ef4444', padding: '1px 5px', borderRadius: 8, fontWeight: 700 }}>HIGH</span>}
                </div>
                <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmt(voltage, 1)} V</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${pct}%`, background: warning ? '#ef4444' : color,
                    borderRadius: 3, transition: 'width 0.4s ease',
                    boxShadow: warning ? `0 0 8px #ef4444` : `0 0 6px ${color}88`
                }} />
            </div>
        </div>
    )
}

// ─── CT Clamp Device Panel ────────────────────────────────────────────────────
function CTMeterPanel({ machine }) {
    const ct = machine.ct_meter
    if (!ct) return null

    const pfColor = ct.power_factor > 0.9 ? '#22c55e' : ct.power_factor > 0.8 ? '#eab308' : '#ef4444'
    const thdColor = ct.thd_pct < 5 ? '#22c55e' : ct.thd_pct < 8 ? '#eab308' : '#ef4444'
    const modeInfo = MODE_LABELS[machine.mode] || { label: machine.mode, color: '#64748b' }

    function fmtUptime(ms) {
        const totalSec = Math.floor(ms / 1000)
        const h = Math.floor(totalSec / 3600)
        const m = Math.floor((totalSec % 3600) / 60)
        const s = totalSec % 60
        return `${h}h ${m}m ${s}s`
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* CT Device Header */}
            <div className="machine-panel" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f97316,#eab308)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                        }}>🔌</div>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{ct.ct_spec.brand} {ct.ct_spec.model}</div>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{ct.ct_spec.type} · Ratio {ct.ct_spec.ratio} · {ct.ct_spec.accuracy} · Jaw {ct.ct_spec.jaw_size}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{ background: modeInfo.color + '22', color: modeInfo.color, fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>
                            ● {modeInfo.label}
                        </span>
                        <span style={{ fontSize: 9, color: '#475569' }}>{machine.id} · {machine.year}</span>
                    </div>
                </div>

                {/* LIVE indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'pulse-dot 1s infinite' }} />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>LIVE MEASUREMENT · 415V 3-Phase 50Hz</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#475569' }}>Uptime: {fmtUptime(machine.uptime_ms)}</span>
                </div>

                {/* Big power display */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'rgba(0,0,0,0.3)', borderRadius: 12, marginBottom: 14 }}>
                    <LCDValue value={fmt(ct.power_kw, 2)} unit="kW" label="Real Power" color="#3b82f6" />
                    <LCDValue value={fmt(ct.apparent_kva, 2)} unit="kVA" label="Apparent Power" color="#a855f7" />
                    <LCDValue value={fmt(ct.reactive_kvar, 2)} unit="kVAR" label="Reactive Power" color="#f97316" />
                    <LCDValue value={fmt(ct.power_factor, 3)} unit="PF" label="Power Factor" color={pfColor} />
                </div>

                {/* Phase readings */}
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 10 }}>
                    3-PHASE CT CLAMP READINGS (L1 / L2 / L3)
                </div>
                <PhaseBar phase="L1" current={ct.phase_current.L1} voltage={ct.phase_voltage.L1} rated={machine.rated_current_A} />
                <PhaseBar phase="L2" current={ct.phase_current.L2} voltage={ct.phase_voltage.L2} rated={machine.rated_current_A} />
                <PhaseBar phase="L3" current={ct.phase_current.L3} voltage={ct.phase_voltage.L3} rated={machine.rated_current_A} />

                {/* Frequency + THD */}
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    {[
                        { label: 'Frequency', val: `${fmt(ct.frequency_hz, 3)} Hz`, color: '#60a5fa' },
                        { label: 'THD', val: `${fmt(ct.thd_pct, 2)} %`, color: thdColor },
                        { label: 'Current Imbalance', val: `${fmt(Math.abs(ct.phase_current.L1 - ct.phase_current.L3), 2)} A`, color: '#f97316' },
                    ].map(item => (
                        <div key={item.label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3, letterSpacing: 0.8 }}>{item.label}</div>
                            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.color }}>{item.val}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 24/7 Energy Accumulator */}
            <div className="machine-panel" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🕐 24/7 Energy Accumulator</div>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>Running total since machine was switched on this session</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(0,0,0,0.3)', borderRadius: 12, marginBottom: 14 }}>
                    <LCDValue value={fmt(machine.kwh_total, 4)} unit="kWh" label="Total Energy" color="#22c55e" size={22} />
                    <LCDValue value={`₹ ${fmt(machine.cost_total, 2)}`} unit="INR" label="Total Cost" color="#eab308" size={18} />
                    <LCDValue value={fmt(machine.actual_total_kw, 2)} unit="kW" label="Current Draw" color="#3b82f6" size={22} />
                </div>

                {/* Power trend */}
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 6 }}>POWER TREND — LAST 60s</div>
                <Sparkline data={machine.history} color="#3b82f6" max={machine.claimed_total_kw * 1.3} />

                {/* Component actual */}
                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, margin: '14px 0 10px' }}>COMPONENT BREAKDOWN (ACTUAL kW)</div>
                {[
                    { label: '⚙ Spindle', key: 'spindle_kw', ie: machine.currentMotorClass.spindle },
                    { label: '↔ X-Axis', key: 'x_axis_kw', ie: machine.currentMotorClass.x_axis },
                    { label: '↕ Y-Axis', key: 'y_axis_kw', ie: machine.currentMotorClass.y_axis },
                    { label: '↗ Z-Axis', key: 'z_axis_kw', ie: machine.currentMotorClass.z_axis },
                    { label: '💧 Coolant', key: 'coolant_kw', ie: machine.currentMotorClass.coolant },
                    { label: '🔧 ATC', key: 'atc_kw', ie: machine.currentMotorClass.atc },
                    { label: '💡 Aux', key: 'aux_kw', ie: machine.currentMotorClass.aux },
                ].map(({ label, key, ie }) => {
                    const actual = machine.actual[key] || 0
                    const claimed = machine.claimed[key] || 0
                    const pct = claimed > 0 ? Math.min(100, (actual / claimed) * 100) : 0
                    const color = pct > 90 ? '#ef4444' : pct > 60 ? '#eab308' : '#22c55e'
                    return (
                        <div key={key} style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ color: '#94a3b8' }}>{label}</span>
                                    <span style={{ fontSize: 8, background: IE_COLORS[ie] + '22', color: IE_COLORS[ie], padding: '1px 4px', borderRadius: 6, fontWeight: 700 }}>{ie}</span>
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>
                                    {fmt(actual, 3)} kW <span style={{ color: '#475569', fontSize: 9 }}>/ {fmt(claimed, 2)} kW</span>
                                </span>
                            </div>
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.5s ease', borderRadius: 2 }} />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Upgrade Optimizer */}
            <div className="machine-panel" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⚡ VFD + IE Motor Upgrade Optimizer</div>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>Compare energy savings for each upgrade scenario. Based on ₹7.5/kWh · 6000 hrs/yr.</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {machine.savings && Object.entries(machine.savings.scenarios).map(([key, sc]) => {
                        const payback = sc.saving_rs_year > 0 ? (sc.est_cost_rs / sc.saving_rs_year).toFixed(1) : '∞'
                        const isTop = key === 'full_upgrade'
                        return (
                            <div key={key} style={{
                                flex: '1 1 130px', minWidth: 130,
                                background: isTop ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isTop ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.07)'}`,
                                borderRadius: 10, padding: 12
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: isTop ? '#60a5fa' : '#94a3b8', marginBottom: 6 }}>{sc.label}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#22c55e' }}>-{fmt(sc.saving_kw, 2)} <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>kW</span></div>
                                <div style={{ fontSize: 11, color: '#eab308' }}>{sc.saving_pct}% saving</div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {[
                                        { l: 'Annual Save', v: `₹${(sc.saving_rs_year / 1000).toFixed(0)}K`, c: '#22c55e' },
                                        { l: 'Install Cost', v: `₹${(sc.est_cost_rs / 1000).toFixed(0)}K`, c: '#94a3b8' },
                                        { l: 'Payback', v: `${payback} yrs`, c: parseFloat(payback) < 2 ? '#22c55e' : parseFloat(payback) < 4 ? '#eab308' : '#ef4444' },
                                    ].map(r => (
                                        <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
                                            <span>{r.l}</span><span style={{ color: r.c, fontWeight: 600 }}>{r.v}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ─── Sidebar Card ─────────────────────────────────────────────────────────────
function SidebarCard({ machine, selected, onClick }) {
    const ct = machine.ct_meter
    const pct = Math.min(100, (machine.actual_total_kw / machine.claimed_total_kw) * 100)
    const severity = pct > 90 ? 'red' : pct > 50 ? 'yellow' : 'green'
    const color = { red: '#ef4444', yellow: '#eab308', green: '#22c55e' }[severity]
    const modeInfo = MODE_LABELS[machine.mode] || { label: machine.mode, color: '#64748b' }

    return (
        <div className={`machine-card ${severity}`} onClick={onClick}
            style={{ cursor: 'pointer', outline: selected ? `2px solid ${color}` : 'none', outlineOffset: 1 }}>
            <div className="machine-header">
                <div>
                    <div className="machine-name">{machine.name}</div>
                    <div className="machine-id">{machine.id} · {machine.year}</div>
                </div>
                <div className={`severity-badge ${severity}`}>{pct > 90 ? 'HIGH' : pct > 50 ? 'ACTIVE' : 'IDLE'}</div>
            </div>
            <div className="machine-metrics">
                <div className="metric"><span className="metric-label">kW (Actual)</span>
                    <span className="metric-value" style={{ color }}>{fmt(machine.actual_total_kw, 1)}</span></div>
                <div className="metric"><span className="metric-label">Avg. Current</span>
                    <span className="metric-value">{ct ? fmt((ct.phase_current.L1 + ct.phase_current.L2 + ct.phase_current.L3) / 3, 1) : '--'} A</span></div>
                <div className="metric"><span className="metric-label">Power Factor</span>
                    <span className="metric-value">{ct ? fmt(ct.power_factor, 2) : '--'}</span></div>
                <div className="metric"><span className="metric-label">kWh Total</span>
                    <span className="metric-value" style={{ color: '#22c55e' }}>{fmt(machine.kwh_total, 3)}</span></div>
            </div>
            <div className="power-bar-wrap" style={{ marginTop: 8 }}>
                <div className="power-bar-label">
                    <span style={{ color: modeInfo.color, fontSize: 9, fontWeight: 700 }}>● {modeInfo.label}</span>
                    <span style={{ color: '#eab308', fontSize: 9 }}>₹{fmt(machine.cost_total, 1)}</span>
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
    const tAct = machines.reduce((s, m) => s + m.actual_total_kw, 0)
    const tClaim = machines.reduce((s, m) => s + m.claimed_total_kw, 0)
    const tKwh = machines.reduce((s, m) => s + m.kwh_total, 0)
    const tCost = machines.reduce((s, m) => s + m.cost_total, 0)
    const avgPF = machines.reduce((s, m) => s + (m.ct_meter?.power_factor || 0), 0) / machines.length
    return (
        <div className="summary-bar">
            <div className="summary-item">
                <div className="summary-label">Total Actual Load</div>
                <div className="summary-value" style={{ color: '#3b82f6' }}>{fmt(tAct, 2)} <span className="stat-unit">kW</span></div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Total Claimed</div>
                <div className="summary-value">{fmt(tClaim, 2)} <span className="stat-unit">kW</span></div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Load Factor</div>
                <div className="summary-value" style={{ color: '#22c55e' }}>{fmt(tAct / tClaim * 100, 1)}<span className="stat-unit">%</span></div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Avg. Power Factor</div>
                <div className="summary-value" style={{ color: avgPF > 0.9 ? '#22c55e' : avgPF > 0.8 ? '#eab308' : '#ef4444' }}>{fmt(avgPF, 3)}</div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Total Energy (Session)</div>
                <div className="summary-value" style={{ color: '#22c55e' }}>{fmt(tKwh, 3)} <span className="stat-unit">kWh</span></div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
                <div className="summary-label">Session Cost</div>
                <div className="summary-value" style={{ color: '#eab308' }}>₹{fmt(tCost, 2)}</div>
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
        const s = io(BACKEND_URL, { transports: ['websocket'] })
        s.on('connect', () => setConnected(true))
        s.on('disconnect', () => setConnected(false))
        s.on('telemetry', (d) => setMachines(d.machines))
        return () => s.disconnect()
    }, [])

    const sm = machines[selected]

    return (
        <div className="app">
            <header className="header">
                <div className="header-brand">
                    <div className="brand-icon">⚡</div>
                    <div>
                        <div className="brand-name">AeroPulse – VMC Energy Monitor</div>
                        <div className="brand-tagline">CT Clamp · Real-time 3-Phase Power · VFD + IE Optimizer · 24/7 kWh Accumulator</div>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div className="header-status">
                        <div className="status-dot" style={{ background: connected ? '#22c55e' : '#ef4444', boxShadow: `0 0 8px ${connected ? '#22c55e' : '#ef4444'}` }} />
                        {connected ? 'Live CT Meter Active' : 'Connecting…'}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="header-time">{time.toLocaleTimeString('en-IN', { hour12: false })}</div>
                    <div style={{ fontSize: 9, color: '#475569' }}>{time.toLocaleDateString('en-IN')}</div>
                </div>
            </header>

            {machines.length > 0 && <SummaryBar machines={machines} />}

            <div className="main" style={{ gridTemplateColumns: '270px 1fr' }}>
                <aside className="sidebar">
                    <div className="sidebar-section-title">VMC Machines — CT Meters</div>
                    {machines.length === 0
                        ? <div className="loader" style={{ height: 180 }}><div className="spinner" /><span>Connecting CT meters…</span></div>
                        : machines.map((m, i) => <SidebarCard key={m.id} machine={m} selected={selected === i} onClick={() => setSelected(i)} />)
                    }
                </aside>

                <section className="viewport" style={{ overflowY: 'auto', padding: '16px 20px' }}>
                    {!sm
                        ? <div className="loader"><div className="spinner" /><span>Waiting for CT readings…</span></div>
                        : <CTMeterPanel machine={sm} />
                    }
                </section>
            </div>
        </div>
    )
}

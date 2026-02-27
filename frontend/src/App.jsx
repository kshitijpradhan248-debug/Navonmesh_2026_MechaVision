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

// ─── Multi-Line Chart ─────────────────────────────────────────────────────────
let _chartId = 0
function MultiLineChart({ series, height = 140, title }) {
    const [cid] = useState(() => `mc_${_chartId++}`)
    const W = 600, H = height, padL = 40, padR = 12, padT = 12, padB = 28
    const chartW = W - padL - padR, chartH = H - padT - padB
    const ticks = 5
    const normalized = series.map(s => {
        const data = s.data || []
        const max = Math.max(...data, s.max || 1)
        const pts = data.map((v, i) => {
            const x = padL + (i / Math.max(data.length - 1, 1)) * chartW
            const y = padT + chartH - ((v / (max || 1)) * chartH)
            return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')
        return { ...s, pts, max, data }
    })
    const primary = normalized[0] || { max: 1, data: [] }
    return (
        <div>
            {title && <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 6 }}>{title}</div>}
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
                <defs>
                    {normalized.map(s => (
                        <linearGradient key={s.key + cid} id={s.key + cid} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                        </linearGradient>
                    ))}
                </defs>
                {Array.from({ length: ticks + 1 }, (_, i) => {
                    const y = padT + (i / ticks) * chartH
                    const val = primary.max - (i / ticks) * primary.max
                    return (
                        <g key={i}>
                            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <text x={padL - 5} y={y + 4} textAnchor="end" fontSize="8" fill="#475569">{val.toFixed(1)}</text>
                        </g>
                    )
                })}
                {[0, 15, 30, 45, 59].map(i => (
                    <text key={i} x={padL + (i / 59) * chartW} y={H - 4} textAnchor="middle" fontSize="8" fill="#334155">-{59 - i}s</text>
                ))}
                <rect x={padL} y={padT} width={chartW} height={chartH} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" rx="2" />
                {normalized.map(s => {
                    if (!s.pts || s.data.length < 2) return null
                    const lastPt = s.pts.split(' ').slice(-1)[0].split(',')
                    return (
                        <g key={s.key}>
                            <polygon fill={`url(#${s.key + cid})`}
                                points={`${padL},${padT + chartH} ${s.pts} ${W - padR},${padT + chartH}`} />
                            <polyline fill="none" stroke={s.color} strokeWidth="1.8" points={s.pts}
                                strokeLinecap="round" strokeLinejoin="round" />
                            {lastPt.length === 2 && (
                                <circle cx={+lastPt[0]} cy={+lastPt[1]} r="3"
                                    fill={s.color} stroke="#111827" strokeWidth="1.5" />
                            )}
                        </g>
                    )
                })}
            </svg>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                {series.map(s => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                        <div style={{ width: 20, height: 2, background: s.color, borderRadius: 1 }} />
                        <span style={{ color: '#64748b' }}>{s.label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: s.color, fontWeight: 700 }}>
                            {s.data?.length > 0 ? s.data[s.data.length - 1]?.toFixed(s.decimals ?? 2) : '--'}
                        </span>
                        <span style={{ color: '#334155' }}>{s.unit}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Component Bar Chart ──────────────────────────────────────────────────────
function ComponentBarChart({ machine }) {
    const COMPS = [
        { key: 'spindle_kw', label: '⚙ Spindle', ie: machine.currentMotorClass?.spindle },
        { key: 'x_axis_kw', label: '↔ X-Axis', ie: machine.currentMotorClass?.x_axis },
        { key: 'y_axis_kw', label: '↕ Y-Axis', ie: machine.currentMotorClass?.y_axis },
        { key: 'z_axis_kw', label: '↗ Z-Axis', ie: machine.currentMotorClass?.z_axis },
        { key: 'coolant_kw', label: '💧 Coolant', ie: machine.currentMotorClass?.coolant },
        { key: 'atc_kw', label: '🔧 ATC', ie: machine.currentMotorClass?.atc },
        { key: 'aux_kw', label: '💡 Aux', ie: machine.currentMotorClass?.aux },
    ]
    const IE_COL = { IE1: '#ef4444', IE2: '#eab308', IE3: '#3b82f6', IE4: '#22c55e', IE5: '#a855f7' }
    const maxKw = Math.max(...COMPS.map(c => machine.claimed?.[c.key] || 0), 0.1)
    return (
        <div>
            <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 10 }}>
                COMPONENT BREAKDOWN — ACTUAL vs CLAIMED (kW)
            </div>
            {COMPS.map(c => {
                const actual = machine.actual?.[c.key] || 0
                const claimed = machine.claimed?.[c.key] || 0
                const pctA = Math.min(100, (actual / maxKw) * 100)
                const pctC = Math.min(100, (claimed / maxKw) * 100)
                const load = claimed > 0 ? (actual / claimed) * 100 : 0
                const col = load > 90 ? '#ef4444' : load > 50 ? '#3b82f6' : '#22c55e'
                const ieCol = IE_COL[c.ie] || '#64748b'
                return (
                    <div key={c.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ color: '#94a3b8' }}>{c.label}</span>
                                {c.ie && <span style={{ fontSize: 8, background: ieCol + '22', color: ieCol, padding: '0 4px', borderRadius: 6, fontWeight: 700 }}>{c.ie}</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                                <span style={{ color: col, fontWeight: 700 }}>{fmt(actual, 2)}</span>
                                <span style={{ color: '#334155' }}> / {fmt(claimed, 2)} kW</span>
                                <span style={{ color: '#475569', marginLeft: 5 }}>({fmt(load, 0)}%)</span>
                            </div>
                        </div>
                        <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                                position: 'absolute', left: 0, top: 0, height: '100%',
                                width: `${pctC}%`, background: 'rgba(255,255,255,0.08)', borderRadius: 4
                            }} />
                            <div style={{
                                position: 'absolute', left: 0, top: 0, height: '100%',
                                width: `${pctA}%`, background: col, borderRadius: 4,
                                transition: 'width 0.4s ease', boxShadow: `0 0 5px ${col}88`
                            }} />
                        </div>
                    </div>
                )
            })}
        </div>
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
            <div style={{ height: 6, background: '#EEF2FF', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                    height: '100%', width: `${pct}%`, background: warning ? '#ef4444' : color,
                    borderRadius: 3, transition: 'width 0.4s ease',
                    boxShadow: warning ? `0 0 8px #ef4444` : `0 0 6px ${color}88`
                }} />
            </div>
        </div>
    )
}

// ─── Machine Setup Panel ──────────────────────────────────────────────────────
function MachineSetupPanel({ machine, catalog, socket, slot }) {
    const [open, setOpen] = useState(false)
    const [catId, setCatId] = useState('')
    const [custom, setCustom] = useState({})
    const [applied, setApplied] = useState(false)
    const [inputMode, setInputMode] = useState('auto')  // 'auto' | 'manual'

    const selected = catalog.find(c => c.id === catId)

    const COMP_LABELS = [
        { key: 'spindle_kw', label: '⚙ Spindle Motor' },
        { key: 'x_axis_kw', label: '↔ X-Axis Servo' },
        { key: 'y_axis_kw', label: '↕ Y-Axis Servo' },
        { key: 'z_axis_kw', label: '↗ Z-Axis Servo' },
        { key: 'coolant_kw', label: '💧 Coolant Pump' },
        { key: 'atc_kw', label: '🔧 ATC Motor' },
        { key: 'aux_kw', label: '💡 Aux / Control' },
    ]

    function handleApply() {
        if (!catId) return
        const components = {}
        if (inputMode === 'manual') {
            COMP_LABELS.forEach(({ key }) => {
                if (custom[key] !== undefined && custom[key] !== '') components[key] = parseFloat(custom[key])
            })
        }
        socket.emit('configure_machine', {
            slot,
            catalog_id: catId,
            custom: inputMode === 'manual' ? {
                ...(custom.rated_current_A ? { rated_current_A: parseFloat(custom.rated_current_A) } : {}),
                ...(Object.keys(components).length ? { components } : {}),
            } : {}
        })
        setApplied(true)
        setTimeout(() => setApplied(false), 3000)
    }

    const indian = catalog.filter(c => c.origin === 'Indian')
    const imported = catalog.filter(c => !['Indian', '—'].includes(c.origin))
    const custom_m = catalog.filter(c => c.origin === '—')

    return (
        <div className="machine-panel" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>🏭 Machine Configurator</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                        Select from catalog or enter custom specifications
                    </div>
                </div>
                <button onClick={() => setOpen(o => !o)} style={{
                    background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff',
                    border: 'none', borderRadius: 20, padding: '5px 16px', fontSize: 11,
                    fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 10px rgba(99,102,241,0.35)'
                }}>
                    {open ? '▲ Close' : '⚙ Configure'}
                </button>
            </div>

            {/* Current machine chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 10, color: '#6366F1', fontWeight: 700 }}>NOW RUNNING:</span>
                <span style={{ background: '#EEF2FF', border: '1.5px solid #C7D2FE', borderRadius: 20, padding: '2px 12px', fontSize: 10, fontWeight: 700, color: '#4338CA' }}>
                    {machine.make} {machine.model}
                </span>
                <span style={{ fontSize: 10, color: '#64748b' }}>· {machine.rated_current_A}A rated · {machine.claimed?.total_kw?.toFixed?.(1)} kW nameplate</span>
            </div>

            {open && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ height: 1, background: '#E0E7FF' }} />

                    {/* ── Step 1: Catalog Dropdown ── */}
                    <div>
                        <div style={{ fontSize: 9, color: '#6366F1', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                            STEP 1 — SELECT MACHINE FROM CATALOG
                        </div>
                        <select value={catId} onChange={e => { setCatId(e.target.value); setCustom({}) }} style={{
                            width: '100%', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #C7D2FE',
                            background: '#F5F3FF', fontSize: 12, fontWeight: 600, color: '#1E293B',
                            outline: 'none', cursor: 'pointer', appearance: 'auto'
                        }}>
                            <option value="">— Choose a machine —</option>
                            <optgroup label="🇮🇳 Indian Made (Popular in Maharashtra / India)">
                                {indian.map(c => <option key={c.id} value={c.id}>{c.make} {c.model} ({c.type}) · {c.city}</option>)}
                            </optgroup>
                            <optgroup label="🌐 Imported (Tier-1 / Premium)">
                                {imported.map(c => <option key={c.id} value={c.id}>{c.make} {c.model} ({c.type}) · {c.origin}</option>)}
                            </optgroup>
                            <optgroup label="✏ Custom">
                                {custom_m.map(c => <option key={c.id} value={c.id}>{c.make} — {c.model}</option>)}
                            </optgroup>
                        </select>

                        {/* Selected machine info card */}
                        {selected && (
                            <div style={{ marginTop: 10, background: 'linear-gradient(135deg,#F5F3FF,#EEF2FF)', border: '1.5px solid #C7D2FE', borderRadius: 12, padding: '10px 14px' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#4338CA', marginBottom: 4 }}>
                                    {selected.make} {selected.model} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>· {selected.type} · {selected.city}</span>
                                </div>
                                <div style={{ fontSize: 10, color: '#6366F1', marginBottom: 8 }}>
                                    📍 {selected.popular}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                                    {[
                                        { l: 'Rated Current', v: `${selected.rated_current_A}A` },
                                        { l: 'Spindle', v: `${selected.claimed.spindle_kw}kW` },
                                        { l: 'Total kW', v: `${selected.claimed.total_kw?.toFixed?.(1)}kW` },
                                        { l: 'Spindle RPM', v: `${(selected.spindle_rpm || 0).toLocaleString()} rpm` },
                                        { l: 'X Travel', v: `${selected.x_travel}mm` },
                                        { l: 'Y Travel', v: `${selected.y_travel}mm` },
                                        { l: 'Z Travel', v: `${selected.z_travel}mm` },
                                        { l: 'Origin', v: selected.origin },
                                    ].map(r => (
                                        <div key={r.l} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '6px 8px' }}>
                                            <div style={{ fontSize: 8, color: '#64748b' }}>{r.l}</div>
                                            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#4338CA' }}>{r.v}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Step 2: Input Mode ── */}
                    {selected && (
                        <div>
                            <div style={{ height: 1, background: '#E0E7FF', marginBottom: 14 }} />
                            <div style={{ fontSize: 9, color: '#10B981', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
                                STEP 2 — INPUT MODE
                            </div>

                            {/* Auto / Manual toggle */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                                <button onClick={() => { setInputMode('auto'); setCustom({}) }} style={{
                                    flex: 1, padding: '8px 0', borderRadius: 10, border: '2px solid',
                                    borderColor: inputMode === 'auto' ? '#10B981' : '#E0E7FF',
                                    background: inputMode === 'auto' ? 'linear-gradient(135deg,#D1FAE5,#ECFDF5)' : '#FAFAFA',
                                    color: inputMode === 'auto' ? '#065F46' : '#94A3B8',
                                    fontWeight: 800, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s'
                                }}>
                                    ✅ Auto — Use Catalog Specs
                                </button>
                                <button onClick={() => setInputMode('manual')} style={{
                                    flex: 1, padding: '8px 0', borderRadius: 10, border: '2px solid',
                                    borderColor: inputMode === 'manual' ? '#6366F1' : '#E0E7FF',
                                    background: inputMode === 'manual' ? 'linear-gradient(135deg,#EEF2FF,#F5F3FF)' : '#FAFAFA',
                                    color: inputMode === 'manual' ? '#4338CA' : '#94A3B8',
                                    fontWeight: 800, fontSize: 12, cursor: 'pointer', transition: 'all 0.2s'
                                }}>
                                    ✏ Manual — Enter My Values
                                </button>
                            </div>

                            {inputMode === 'auto' && (
                                <div style={{ background: '#F0FDF4', border: '1.5px solid #A7F3D0', borderRadius: 10, padding: '10px 14px', fontSize: 10, color: '#065F46' }}>
                                    <strong>Auto mode:</strong> The simulation will use <strong>{selected.make} {selected.model}</strong> catalog nameplate specs exactly as published by the manufacturer — no manual overrides required.
                                </div>
                            )}

                            {inputMode === 'manual' && (
                                <div>
                                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 10 }}>
                                        Enter your field-measured values below. Leave blank to keep the catalog benchmark for that component.
                                    </div>

                                    {/* Rated Current override */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: 10, padding: '8px 12px' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', flex: 1 }}>⚡ Your Observed Rated Current (A)</span>
                                        <input
                                            type="number" step="0.1" min="0" max="200"
                                            placeholder={`Catalog: ${selected.rated_current_A}A`}
                                            value={custom.rated_current_A || ''}
                                            onChange={e => setCustom(c => ({ ...c, rated_current_A: e.target.value }))}
                                            style={{ width: 100, padding: '4px 8px', borderRadius: 8, border: '1.5px solid #FCD34D', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, textAlign: 'right', outline: 'none', background: 'white' }}
                                        />
                                        <span style={{ fontSize: 10, color: '#92400E' }}>A</span>
                                    </div>

                                    {/* Component kW overrides */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {COMP_LABELS.map(({ key, label }) => (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 10, color: '#475569', flex: 1 }}>{label}</span>
                                                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#64748b', width: 60, textAlign: 'right' }}>
                                                    Catalog: {selected.claimed[key]?.toFixed?.(2) ?? '—'}kW
                                                </div>
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    placeholder="Your val"
                                                    value={custom[key] || ''}
                                                    onChange={e => setCustom(c => ({ ...c, [key]: e.target.value }))}
                                                    style={{ width: 80, padding: '4px 8px', borderRadius: 8, border: `1.5px solid ${custom[key] ? '#A5B4FC' : '#E0E7FF'}`, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, textAlign: 'right', outline: 'none', background: custom[key] ? '#EEF2FF' : 'white' }}
                                                />
                                                <span style={{ fontSize: 10, color: '#64748b' }}>kW</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Apply Button */}
                            {catId && (
                                <button onClick={handleApply} style={{
                                    width: '100%', padding: '10px',
                                    background: applied ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                                    color: '#fff', border: 'none', borderRadius: 12, fontSize: 13,
                                    fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5,
                                    boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                                    transition: 'all 0.3s'
                                }}>
                                    {applied ? '✅ Configuration Applied!' : `🚀 Apply — ${selected?.make || ''} ${selected?.model || ''}`}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', background: 'linear-gradient(135deg,#EEF2FF,#F0FDF9)', borderRadius: 12, marginBottom: 14, border: '1.5px solid #E0E7FF' }}>
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
                        <div key={item.label} style={{ flex: 1, background: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'linear-gradient(135deg,#F0FDF9,#EEF2FF)', borderRadius: 12, marginBottom: 14, border: '1.5px solid #D1FAE5' }}>
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
                            <div style={{ height: 4, background: '#EEF2FF', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 0.5s ease', borderRadius: 2 }} />
                            </div>
                        </div>
                    )
                })}
            </div>
            {/* ── Detailed Analytics Charts ─────────────────────────────── */}
            <div className="machine-panel" style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>📊 Detailed Analytics — Last 60 Seconds</div>

                {/* Chart 1: Power + PF + THD Multi-line */}
                <div style={{ marginBottom: 20 }}>
                    <MultiLineChart
                        title="POWER TREND · POWER FACTOR (×20) · THD (%)"
                        height={140}
                        series={[
                            {
                                key: 'kw', label: 'Real Power', unit: 'kW', color: '#3b82f6', decimals: 2,
                                data: machine.history || [], max: machine.claimed_total_kw * 1.2
                            },
                            {
                                key: 'pf', label: 'PF ×20', unit: '', color: '#22c55e', decimals: 3,
                                data: (machine.history_pf || []).map(v => v * 20), max: 20
                            },
                            {
                                key: 'thd', label: 'THD', unit: '%', color: '#f97316', decimals: 2,
                                data: machine.history_thd || [], max: 10
                            },
                        ]}
                    />
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#E0E7FF', margin: '0 0 18px' }} />

                {/* Chart 2: 3-Phase Current History */}
                <div style={{ marginBottom: 20 }}>
                    <MultiLineChart
                        title="3-PHASE CURRENT HISTORY (A) — L1 · L2 · L3"
                        height={120}
                        series={[
                            {
                                key: 'L1', label: 'L1', unit: 'A', color: '#ef4444', decimals: 1,
                                data: machine.history_L1 || [], max: machine.rated_current_A * 1.2
                            },
                            {
                                key: 'L2', label: 'L2', unit: 'A', color: '#eab308', decimals: 1,
                                data: machine.history_L2 || [], max: machine.rated_current_A * 1.2
                            },
                            {
                                key: 'L3', label: 'L3', unit: 'A', color: '#22c55e', decimals: 1,
                                data: machine.history_L3 || [], max: machine.rated_current_A * 1.2
                            },
                        ]}
                    />
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#E0E7FF', margin: '0 0 18px' }} />

                {/* Chart 3: Component bar breakdown */}
                <ComponentBarChart machine={machine} />
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
                                background: isTop ? '#EFF6FF' : '#FAFAFA',
                                border: `1.5px solid ${isTop ? '#BFDBFE' : '#E5E7EB'}`,
                                borderRadius: 10, padding: 12
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: isTop ? '#2563EB' : '#6B7280', marginBottom: 6 }}>{sc.label}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#22c55e' }}>-{fmt(sc.saving_kw, 2)} <span style={{ fontSize: 9, color: '#64748b', fontWeight: 400 }}>kW</span></div>
                                <div style={{ fontSize: 11, color: '#eab308' }}>{sc.saving_pct}% saving</div>
                                <div style={{ borderTop: '1.5px solid #E5E7EB', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            {/* ── Maintenance Tracker ──────────────────────────────────── */}
            {machine.maintenance && (() => {
                const mt = machine.maintenance
                const hColor = mt.health_label === 'GOOD' ? '#22c55e'
                    : mt.health_label === 'NEEDS ATTENTION' ? '#eab308' : '#ef4444'
                const sColor = s => ({ OVERDUE: '#ef4444', DUE_SOON: '#eab308', MONITOR: '#f97316', OK: '#22c55e' })[s] || '#64748b'
                return (
                    <div className="machine-panel" style={{ padding: '14px 18px' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>🔩 Maintenance Tracker</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                    7 checks · Running hrs · Spindle hrs · Coolant hrs · Tool cycles
                                </div>
                            </div>
                            {/* Health Dial */}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: '50%',
                                    background: `conic-gradient(${hColor} ${mt.health * 3.6}deg, #E0E7FF 0deg)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: `0 0 14px ${hColor}44`
                                }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: '50%', background: '#FFFFFF',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-mono)', color: hColor, lineHeight: 1 }}>{mt.health}</div>
                                        <div style={{ fontSize: 7, color: '#64748b' }}>HEALTH</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 8, fontWeight: 700, color: hColor, marginTop: 4, letterSpacing: 0.8 }}>{mt.health_label}</div>
                            </div>
                        </div>

                        {/* 4 Live Counters */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                            {[
                                { label: '🏭 Running', val: mt.counters.running_hours, unit: 'hrs' },
                                { label: '⚙ Spindle', val: mt.counters.spindle_hours, unit: 'hrs' },
                                { label: '💧 Coolant', val: mt.counters.coolant_hours, unit: 'hrs' },
                                { label: '🔧 Tool Chg', val: mt.counters.tool_changes, unit: 'cycles' },
                            ].map(c => (
                                <div key={c.label} style={{
                                    background: 'linear-gradient(135deg,#F5F3FF,#EEF2FF)', border: '1.5px solid #E0E7FF',
                                    borderRadius: 8, padding: '8px 10px', textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{c.label}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: '#1E293B' }}>
                                        {typeof c.val === 'number' && !Number.isInteger(c.val) ? c.val.toFixed(0) : c.val}
                                    </div>
                                    <div style={{ fontSize: 9, color: '#475569' }}>{c.unit}</div>
                                </div>
                            ))}
                        </div>

                        {/* Task Progress List */}
                        <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>MAINTENANCE SCHEDULE</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                            {mt.tasks.map(t => {
                                const col = sColor(t.status)
                                return (
                                    <div key={t.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 800, background: col + '22', color: col,
                                                    padding: '1px 6px', borderRadius: 10, border: `1px solid ${col}44`
                                                }}>
                                                    {t.status.replace('_', ' ')}
                                                </span>
                                                <span style={{ fontSize: 10, color: '#94a3b8' }}>{t.name}</span>
                                            </div>
                                            <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#475569' }}>
                                                {t.current_val} / {t.limit} {t.unit}
                                            </div>
                                        </div>
                                        <div style={{ height: 6, background: '#EEF2FF', borderRadius: 3, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%', borderRadius: 3,
                                                width: `${t.pct_used}%`,
                                                background: t.pct_used >= 90
                                                    ? `linear-gradient(90deg, ${col}, ${col}cc)`
                                                    : col,
                                                transition: 'width 0.5s ease',
                                                boxShadow: t.status !== 'OK' ? `0 0 6px ${col}88` : 'none'
                                            }} />
                                        </div>
                                        {t.status !== 'OK' && (
                                            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                                                {t.status === 'OVERDUE'
                                                    ? `⚠ Overdue by ${Math.abs(t.due_in)} ${t.unit} — ${t.energy_waste_pct}% energy waste`
                                                    : `Due in ${t.due_in} ${t.unit}`}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Energy Waste Card */}
                        {mt.total_energy_waste_pct > 0 && (
                            <div style={{
                                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                                borderLeft: '3px solid #ef4444', borderRadius: 8, padding: '10px 14px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>
                                        ⚡ Maintenance-Induced Energy Waste
                                    </div>
                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                                        Friction, overcurrent & inefficiency from deferred maintenance
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 800, color: '#ef4444' }}>
                                        +{mt.total_energy_waste_pct}%
                                    </div>
                                    <div style={{ fontSize: 9, color: '#64748b' }}>
                                        ≈ ₹{Math.round(mt.annual_waste_rs / 1000)}K/yr wasted
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })()}

            {/* ── Power Quality Health Card ─────────────────────────────── */}

            {machine.pqa && (() => {
                const p = machine.pqa
                const healthColor = p.healthLabel === 'HEALTHY' ? '#22c55e'
                    : p.healthLabel === 'MONITOR' ? '#eab308'
                        : '#ef4444'
                const riskColor = (r) => ({
                    LOW: '#22c55e', GOOD: '#22c55e', MODERATE: '#eab308', HIGH: '#ef4444'
                })[r] || '#64748b'
                const riskBadge = (r) => (
                    <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 12,
                        background: riskColor(r) + '22', color: riskColor(r),
                        border: `1px solid ${riskColor(r)}44`
                    }}>{r}</span>
                )
                return (
                    <div className="machine-panel" style={{ padding: '14px 18px' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>⚡ Power Quality Health Card</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                    5 checks active · Voltage · Imbalance · PF · THD · Overcurrent
                                </div>
                            </div>
                            {/* Health Score Dial */}
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: '50%',
                                    background: `conic-gradient(${healthColor} ${p.healthScore * 3.6}deg, #E0E7FF 0deg)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: `0 0 14px ${healthColor}44`
                                }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: '50%',
                                        background: '#FFFFFF',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-mono)', color: healthColor, lineHeight: 1 }}>{p.healthScore}</div>
                                        <div style={{ fontSize: 7, color: '#64748b' }}>HEALTH</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: healthColor, marginTop: 4, letterSpacing: 1 }}>{p.healthLabel}</div>
                            </div>
                        </div>

                        {/* 5 Risk Indicators Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
                            {[
                                { label: 'Voltage', sub: `${p.voltDev_pct > 0 ? '+' : ''}${fmt(p.voltDev_pct, 1)}%`, risk: p.voltageRisk, icon: '⚡' },
                                { label: 'Imbalance', sub: `${fmt(p.imbalance_pct, 1)}%`, risk: p.phaseImbalanceRisk, icon: '⚖' },
                                { label: 'Power Factor', sub: fmt(machine.ct_meter?.power_factor, 3), risk: p.pfRisk, icon: '🔋' },
                                { label: 'THD', sub: `${fmt(machine.ct_meter?.thd_pct, 2)}%`, risk: p.harmonicRisk, icon: '〰' },
                                { label: 'Current', sub: `${fmt(p.currentPct, 1)}%`, risk: p.overcurrentRisk, icon: '📊' },
                            ].map(item => (
                                <div key={item.label} style={{
                                    background: riskColor(item.risk) + '0d',
                                    border: `1px solid ${riskColor(item.risk)}33`,
                                    borderRadius: 8, padding: '8px 6px', textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: 14 }}>{item.icon}</div>
                                    <div style={{ fontSize: 9, color: '#64748b', margin: '3px 0 2px' }}>{item.label}</div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: riskColor(item.risk) }}>{item.sub}</div>
                                    <div style={{ marginTop: 4 }}>{riskBadge(item.risk)}</div>
                                </div>
                            ))}
                        </div>

                        {/* Engineering Recommendations */}
                        {p.recommendations.length > 0 && (
                            <>
                                <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>ENGINEERING RECOMMENDATIONS</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                    {p.recommendations.map((r, i) => (
                                        <div key={i} style={{
                                            display: 'flex', gap: 10, alignItems: 'flex-start',
                                            background: '#EFF6FF', border: '1.5px solid #BFDBFE',
                                            borderLeft: '3px solid #3b82f6', borderRadius: 8, padding: '8px 12px'
                                        }}>
                                            <span style={{ fontSize: 14, flexShrink: 0 }}>🔧</span>
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 2 }}>{r.action}</div>
                                                <div style={{ fontSize: 10, color: '#475569' }}>{r.reason}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* ROI Upgrade Table */}
                        <div style={{ fontSize: 9, color: '#475569', letterSpacing: 1, marginBottom: 8 }}>POWER QUALITY UPGRADE ROI</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {p.roiUpgrades.map(u => {
                                const color = u.applicable ? (u.payback_yrs && u.payback_yrs < 2 ? '#22c55e' : '#eab308') : '#334155'
                                return (
                                    <div key={u.name} style={{
                                        flex: '1 1 160px', minWidth: 160,
                                        background: u.applicable ? '#FAFAFA' : '#F9FAFB',
                                        border: `1.5px solid ${u.applicable ? '#E0E7FF' : '#F3F4F6'}`,
                                        borderRadius: 10, padding: 12,
                                        opacity: u.applicable ? 1 : 0.4
                                    }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: u.applicable ? '#1E293B' : '#9CA3AF' }}>{u.name}</div>
                                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>{u.benefit}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            {[
                                                { l: 'Install Cost', v: u.cost_range },
                                                { l: 'Annual Benefit', v: u.annual_benefit_rs > 0 ? `₹${(u.annual_benefit_rs / 1000).toFixed(1)}K` : 'N/A' },
                                                { l: 'Payback', v: u.payback_yrs ? `${u.payback_yrs} yrs` : 'N/A' },
                                            ].map(r => (
                                                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                                                    <span style={{ color: '#64748b' }}>{r.l}</span>
                                                    <span style={{ fontWeight: 700, color: r.l === 'Payback' ? color : '#94a3b8' }}>{r.v}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {!u.applicable && <div style={{ fontSize: 9, color: '#22c55e', marginTop: 6, textAlign: 'center' }}>✓ Not required</div>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}

            {/* ── Phase 2: Anomaly Detection Panel ─────────────────────────── */}

            {machine.anomalies && (
                <div className="machine-panel" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>🚨 Anomaly Detection</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {machine.anomalies.critical > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#ef444422', color: '#ef4444', padding: '2px 10px', borderRadius: 20, border: '1px solid #ef444440' }}>
                                    {machine.anomalies.critical} CRITICAL
                                </span>
                            )}
                            {machine.anomalies.warnings > 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#eab30822', color: '#eab308', padding: '2px 10px', borderRadius: 20, border: '1px solid #eab30840' }}>
                                    {machine.anomalies.warnings} WARNING
                                </span>
                            )}
                            {machine.anomalies.count === 0 && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#22c55e22', color: '#22c55e', padding: '2px 10px', borderRadius: 20 }}>
                                    ✓ ALL CLEAR
                                </span>
                            )}
                        </div>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>
                        5 PDR rules active · Load: {machine.anomalies.load_pct}% · Phase imbalance: {machine.anomalies.imbalance_pct}%
                    </div>
                    {machine.anomalies.count === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#22c55e', fontSize: 13 }}>
                            ✅ No anomalies detected — machine operating normally
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {machine.anomalies.items.map((a) => {
                                const isCrit = a.severity === 'CRITICAL'
                                const color = isCrit ? '#ef4444' : '#eab308'
                                return (
                                    <div key={a.code} style={{
                                        background: `${color}0d`,
                                        border: `1px solid ${color}33`,
                                        borderLeft: `3px solid ${color}`,
                                        borderRadius: 8, padding: '10px 14px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, fontWeight: 800, color, background: `${color}22`, padding: '1px 7px', borderRadius: 20 }}>
                                                {a.severity}
                                            </span>
                                            <span style={{ fontSize: 12, fontWeight: 700 }}>{a.title}</span>
                                            <span style={{ marginLeft: 'auto', fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)' }}>{a.code}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>{a.message}</div>
                                        <div style={{ display: 'flex', gap: 16, fontSize: 10 }}>
                                            <span style={{ color: '#64748b' }}>⚠ {a.impact}</span>
                                            <span style={{ color: '#3b82f6' }}>→ {a.fix}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Phase 2: CO₂ Tracker ─────────────────────────────────────── */}
            {machine.co2 && (
                <div className="machine-panel" style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🌿 CO₂ Emission Tracker</div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>
                        Indian grid factor: {machine.co2.factor} kg CO₂ / kWh (CEA 2023)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'linear-gradient(135deg,#ECFDF5,#F0FDF4)', borderRadius: 12, marginBottom: 14, border: '1.5px solid #A7F3D0' }}>
                        <LCDValue value={fmt(machine.co2.kg_total, 4)} unit="kg CO₂" label="Total Emitted" color="#ef4444" size={20} />
                        <LCDValue value={fmt(machine.kwh_total, 4)} unit="kWh" label="Energy Used" color="#22c55e" size={20} />
                        <LCDValue value={fmt(machine.co2.trees_equiv, 4)} unit="trees/yr" label="Tree Equiv." color="#4ade80" size={20} />
                    </div>
                    <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#94a3b8' }}>
                        🌱 Upgrading to <strong style={{ color: '#22c55e' }}>IE5 + VFD</strong> could reduce emissions by up to <strong style={{ color: '#4ade80' }}>
                            {machine.savings ? fmt(Math.min(30, machine.savings.scenarios.full_upgrade?.saving_pct || 0), 1) : '0'}%
                        </strong> — saving approximately <strong style={{ color: '#4ade80' }}>
                            {machine.savings ? fmt((machine.co2.kg_total * (machine.savings.scenarios.full_upgrade?.saving_pct || 0) / 100), 4) : '0'} kg CO₂
                        </strong> so far this session.
                    </div>
                </div>
            )}

            {/* ── Phase 2: DISCOM Penalty Estimator ───────────────────────── */}
            {machine.discom && (
                <div className="machine-panel" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>🏛️ DISCOM Reactive Energy Penalty</div>
                        <span style={{
                            fontSize: 10, fontWeight: 800, padding: '2px 12px', borderRadius: 20,
                            background: machine.discom.status === 'OK' ? '#22c55e22' : machine.discom.status === 'RISK' ? '#eab30822' : '#ef444422',
                            color: machine.discom.status === 'OK' ? '#22c55e' : machine.discom.status === 'RISK' ? '#eab308' : '#ef4444',
                            border: `1px solid ${machine.discom.status === 'OK' ? '#22c55e40' : machine.discom.status === 'RISK' ? '#eab30840' : '#ef444440'}`
                        }}>
                            {machine.discom.status}
                        </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 14 }}>
                        Based on MSEDCL/BESCOM tariff schedule · Penalty threshold: PF &lt; {machine.discom.threshold} · Optimal: PF ≥ {machine.discom.optimal}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'linear-gradient(135deg,#FEF3C7,#FFF7ED)', borderRadius: 12, marginBottom: 14, border: '1.5px solid #FCD34D' }}>
                        <LCDValue
                            value={fmt(machine.discom.pf, 3)}
                            unit="Power Factor"
                            label="Current PF"
                            color={machine.discom.status === 'OK' ? '#22c55e' : machine.discom.status === 'RISK' ? '#eab308' : '#ef4444'}
                            size={22}
                        />
                        <LCDValue value={`${fmt(machine.discom.surcharge_pct, 2)}%`} unit="Surcharge" label="PF Penalty Rate" color="#f97316" size={20} />
                        <LCDValue value={`₹${fmt(machine.discom.annual_penalty_rs, 0)}`} unit="/ year" label="Proj. Annual Penalty" color="#ef4444" size={18} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Session Energy Cost', val: `₹${fmt(machine.cost_total, 2)}` },
                            { label: 'Session Penalty', val: `₹${fmt(machine.discom.penalty_rs, 2)}` },
                            { label: 'Fix: Capacitor Bank', val: '₹15K–₹40K instal.' },
                            { label: 'Fix: VFD PF Correction', val: 'Built-in on most VFDs' },
                        ].map(r => (
                            <div key={r.label} style={{
                                flex: '1 1 150px', background: '#FAFAFA',
                                border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '8px 12px'
                            }}>
                                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>{r.label}</div>
                                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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
    const [catalog, setCatalog] = useState([])
    const socketRef = useRef(null)
    const time = useTime()

    useEffect(() => {
        const s = io(BACKEND_URL, { transports: ['websocket'] })
        socketRef.current = s
        s.on('connect', () => setConnected(true))
        s.on('disconnect', () => setConnected(false))
        s.on('telemetry', (d) => setMachines(d.machines))
        s.on('catalog', (c) => setCatalog(c))
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
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>{time.toLocaleDateString('en-IN')}</div>
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
                        : <>
                            {catalog.length > 0 && (
                                <MachineSetupPanel
                                    machine={sm}
                                    catalog={catalog}
                                    socket={socketRef.current}
                                    slot={selected}
                                />
                            )}
                            <CTMeterPanel machine={sm} />
                        </>
                    }
                </section>
            </div>
        </div>
    )
}

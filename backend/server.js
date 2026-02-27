const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─── Indian Industrial Power System ──────────────────────────────────────────
const SYSTEM = {
    V_LINE: 415,   // Line-to-line voltage (V) — standard Indian 3-phase
    V_PHASE: 240,   // Line-to-neutral voltage (V)
    FREQ_HZ: 50,    // Frequency (India standard)
    COST_PER_KWH: 7.5, // ₹/kWh (avg industrial tariff India)
};

// CT Clamp Specifications (Hioki CT6280 style — common in India)
const CT_SPEC = {
    model: "CT-100/5A",
    brand: "Hioki",
    ratio: "100A : 5A",
    accuracy: "Class 1 (±1%)",
    burden: "5 VA",
    frequency: "50/60 Hz",
    jaw_size: "55mm",
    type: "Split-core CT Clamp",
};

// ─── Motor Efficiency (IEC 60034-30) ─────────────────────────────────────────
const IE_EFF = { IE1: 0.870, IE2: 0.905, IE3: 0.930, IE4: 0.955, IE5: 0.975 };
const VFD_SAV = { spindle: 0.10, x_axis: 0.05, y_axis: 0.05, z_axis: 0.05, coolant: 0.40, atc: 0.08, aux: 0.12 };

// ─── VMC Machine Profiles ─────────────────────────────────────────────────────
const VMC_MACHINES = [
    {
        id: "VMC-01", name: "BFW VMC 400", make: "Bharat Fritz Werner",
        model: "VMC 400", location: "Shop Floor A", year: 2018,
        currentMotorClass: { spindle: "IE2", x_axis: "IE2", y_axis: "IE2", z_axis: "IE2", coolant: "IE1", atc: "IE2", aux: "IE1" },
        hasVFD: { spindle: false, coolant: false, aux: false },
        rated_current_A: 28.0,  // Full-load rated current (A) at 415V 3-phase
        claimed: { spindle_kw: 7.5, x_axis_kw: 1.5, y_axis_kw: 1.5, z_axis_kw: 1.5, coolant_kw: 0.37, atc_kw: 0.25, aux_kw: 0.5, total_kw: 13.12 },
        idle_kw: 2.8,
    },
    {
        id: "VMC-02", name: "Jyoti VMC 430", make: "Jyoti CNC Automation",
        model: "VMC 430", location: "Shop Floor A", year: 2020,
        currentMotorClass: { spindle: "IE3", x_axis: "IE2", y_axis: "IE2", z_axis: "IE2", coolant: "IE2", atc: "IE2", aux: "IE2" },
        hasVFD: { spindle: true, coolant: false, aux: false },
        rated_current_A: 40.0,
        claimed: { spindle_kw: 11.0, x_axis_kw: 2.0, y_axis_kw: 2.0, z_axis_kw: 2.0, coolant_kw: 0.37, atc_kw: 0.37, aux_kw: 0.75, total_kw: 18.49 },
        idle_kw: 3.5,
    },
    {
        id: "VMC-03", name: "MTAB AX 500", make: "MTAB Engineers",
        model: "AX 500", location: "Shop Floor B", year: 2016,
        currentMotorClass: { spindle: "IE2", x_axis: "IE1", y_axis: "IE1", z_axis: "IE2", coolant: "IE1", atc: "IE1", aux: "IE1" },
        hasVFD: { spindle: false, coolant: false, aux: false },
        rated_current_A: 18.0,
        claimed: { spindle_kw: 5.5, x_axis_kw: 1.2, y_axis_kw: 1.2, z_axis_kw: 1.2, coolant_kw: 0.18, atc_kw: 0.18, aux_kw: 0.4, total_kw: 9.88 },
        idle_kw: 2.1,
    },
];

// ─── Mode profiles ────────────────────────────────────────────────────────────
const MODE_PROFILES = {
    idle: { spindle: 0.0, x_axis: 0.0, y_axis: 0.0, z_axis: 0.0, coolant: 0.0, atc: 0.0, aux: 1.0 },
    cutting: { spindle: 0.85, x_axis: 0.7, y_axis: 0.6, z_axis: 0.5, coolant: 1.0, atc: 0.0, aux: 1.0 },
    rapid: { spindle: 0.3, x_axis: 1.0, y_axis: 1.0, z_axis: 0.8, coolant: 0.3, atc: 0.0, aux: 1.0 },
    tool_change: { spindle: 0.0, x_axis: 0.1, y_axis: 0.1, z_axis: 0.2, coolant: 0.0, atc: 1.0, aux: 1.0 },
};
const MODE_SEQ = ["idle", "rapid", "cutting", "cutting", "cutting", "rapid", "tool_change", "cutting", "idle"];
const COMP_KEYS = ["spindle", "x_axis", "y_axis", "z_axis", "coolant", "atc", "aux"];
const KW_KEYS = ["spindle_kw", "x_axis_kw", "y_axis_kw", "z_axis_kw", "coolant_kw", "atc_kw", "aux_kw"];

function jitter(v, p = 0.035) { return Math.max(0, v * (1 + (Math.random() - 0.5) * 2 * p)); }
function applyLoss(kw, cls) { return kw / (IE_EFF[cls] || 0.90); }
function applyVFD(kw, comp) { return kw * (1 - (VFD_SAV[comp] || 0)); }

// ─── State (energy accumulator persists across ticks) ────────────────────────
const machineState = VMC_MACHINES.map((m, i) => ({
    ...m,
    mode: "idle", modeTick: 0, modeDuration: 4 + Math.floor(Math.random() * 10),
    modeIdx: [0, 3, 6][i],
    history: [],
    kwh_total: 0,        // Accumulated energy (kWh) since startup
    cost_total: 0,        // Accumulated cost (₹) since startup
    startTime: Date.now(),
}));

// ─── CT Clamp: Derive 3-phase currents from power ─────────────────────────────
// For balanced 3-phase: P = √3 × V_L × I_L × PF
// So: I_L = P / (√3 × V_L × PF)
// CT clamp adds ±1% measurement noise (accuracy class 1)
function calcCTReadings(totalKw) {
    const PF = jitter(0.855, 0.04);           // Typical VMC power factor 0.82-0.92
    const V_L = jitter(SYSTEM.V_LINE, 0.02);  // ±2% voltage variation
    const SQRT3 = 1.7321;

    const I_line = totalKw > 0
        ? (totalKw * 1000) / (SQRT3 * V_L * PF)
        : 0;

    // Per-phase CT clamp readings (balanced load + small imbalance noise)
    const ctNoise = () => 1 + (Math.random() - 0.5) * 0.02; // ±1% accuracy class
    const I_L1 = jitter(I_line * ctNoise(), 0.01);
    const I_L2 = jitter(I_line * ctNoise(), 0.01);
    const I_L3 = jitter(I_line * ctNoise(), 0.01);

    const I_avg = (I_L1 + I_L2 + I_L3) / 3;

    // Voltages per phase (with small imbalance)
    const V_L1 = jitter(V_L, 0.01);
    const V_L2 = jitter(V_L, 0.01);
    const V_L3 = jitter(V_L, 0.01);

    // Recalculate powers from CT readings
    const P_real = SQRT3 * ((V_L1 + V_L2 + V_L3) / 3) * I_avg * PF / 1000; // kW
    const S_app = SQRT3 * ((V_L1 + V_L2 + V_L3) / 3) * I_avg / 1000;       // kVA
    const Q_react = Math.sqrt(Math.max(0, S_app ** 2 - P_real ** 2));        // kVAR
    const THD = jitter(4.2, 0.15);   // % Total Harmonic Distortion (typical VFD environment)
    const FREQ = jitter(49.98, 0.005); // Hz

    return {
        ct_spec: CT_SPEC,
        phase_voltage: { L1: +V_L1.toFixed(1), L2: +V_L2.toFixed(1), L3: +V_L3.toFixed(1) },
        phase_current: { L1: +I_L1.toFixed(2), L2: +I_L2.toFixed(2), L3: +I_L3.toFixed(2) },
        power_factor: +PF.toFixed(3),
        power_kw: +P_real.toFixed(3),
        apparent_kva: +S_app.toFixed(3),
        reactive_kvar: +Q_react.toFixed(3),
        thd_pct: +THD.toFixed(2),
        frequency_hz: +FREQ.toFixed(3),
    };
}

// ─── Savings calculator ───────────────────────────────────────────────────────
function calcSavings(m, mechLoads) {
    const HRS = 6000;
    let current = 0, ie3 = 0, ie4 = 0, ie5 = 0, vfd = 0, full = 0;
    COMP_KEYS.forEach((k, i) => {
        const mech = mechLoads[i];
        const cls = m.currentMotorClass[k];
        const hasV = m.hasVFD[k] || false;
        let cur = applyLoss(mech, cls); if (hasV) cur = applyVFD(cur, k); current += cur;
        ie3 += applyLoss(mech, "IE3");
        ie4 += applyLoss(mech, "IE4");
        ie5 += applyLoss(mech, "IE5");
        vfd += applyVFD(applyLoss(mech, cls), k);
        full += applyVFD(applyLoss(mech, "IE5"), k);
    });
    const s = (newT) => {
        const sk = Math.max(0, current - newT);
        return { saving_kw: +sk.toFixed(3), saving_pct: +(current > 0 ? sk / current * 100 : 0).toFixed(1), saving_rs_year: +(sk * HRS * SYSTEM.COST_PER_KWH).toFixed(0) };
    };
    return {
        current_total_kw: +current.toFixed(3), scenarios: {
            ie3: { label: "IE3 Motors", ...s(ie3), est_cost_rs: 80000 },
            ie4: { label: "IE4 Motors", ...s(ie4), est_cost_rs: 150000 },
            ie5: { label: "IE5 Motors", ...s(ie5), est_cost_rs: 250000 },
            vfd_only: { label: "VFD Add-on", ...s(vfd), est_cost_rs: 60000 },
            full_upgrade: { label: "IE5 + VFD", ...s(full), est_cost_rs: 350000 },
        }
    };
}

// ─── Phase 2: Anomaly Detection Engine (PDR Tier 2A) ─────────────────────────
// 5 detection rules from Product Development Roadmap
function detectAnomalies(ct, actualKw, ratedCurrentA, claimedKw) {
    const anomalies = [];
    const I_avg = (ct.phase_current.L1 + ct.phase_current.L2 + ct.phase_current.L3) / 3;
    const I_max = Math.max(ct.phase_current.L1, ct.phase_current.L2, ct.phase_current.L3);
    const I_min = Math.min(ct.phase_current.L1, ct.phase_current.L2, ct.phase_current.L3);
    const imbalance_pct = I_avg > 0 ? ((I_max - I_min) / I_avg) * 100 : 0;
    const load_pct = claimedKw > 0 ? (actualKw / claimedKw) * 100 : 0;

    // Rule 1 – Power Factor penalty risk (DISCOM penalty below 0.85)
    if (ct.power_factor < 0.85) {
        anomalies.push({
            code: "PF_LOW",
            severity: ct.power_factor < 0.75 ? "CRITICAL" : "WARNING",
            title: "Low Power Factor",
            message: `PF = ${ct.power_factor.toFixed(3)} — below 0.85 DISCOM threshold. Reactive energy surcharge applies.`,
            impact: "Financial — DISCOM penalty on electricity bill",
            fix: "Install capacitor bank / VFD with PF correction",
        });
    }

    // Rule 2 – Total Harmonic Distortion (IEEE 519 limit: <5% for industrial)
    if (ct.thd_pct > 5) {
        anomalies.push({
            code: "THD_HIGH",
            severity: ct.thd_pct > 8 ? "CRITICAL" : "WARNING",
            title: "High Harmonic Distortion",
            message: `THD = ${ct.thd_pct.toFixed(2)}% — exceeds IEEE 519 limit of 5%. Risk of transformer heating.`,
            impact: "Power quality — equipment damage, excess heat",
            fix: "Install harmonic filter / Active front-end VFD",
        });
    }

    // Rule 3 – Motor oversizing (load below 40% of rated)
    if (load_pct < 40 && actualKw > 0.5) {
        anomalies.push({
            code: "OVERSIZE",
            severity: "WARNING",
            title: "Motor Oversizing Detected",
            message: `Machine running at ${load_pct.toFixed(1)}% of nameplate — motor likely oversized for this task.`,
            impact: "Efficiency — motor runs in low-efficiency zone below 40% load",
            fix: "Right-size motor or use VFD to reduce operating speed",
        });
    }

    // Rule 4 – Phase current imbalance (>10% = NEMA MG1 derating required)
    if (imbalance_pct > 10) {
        anomalies.push({
            code: "IMBALANCE",
            severity: "WARNING",
            title: "Phase Current Imbalance",
            message: `Phase imbalance = ${imbalance_pct.toFixed(1)}% — exceeds 10% NEMA MG1 threshold.`,
            impact: "Mechanical — motor stress, vibration, reduced bearing life",
            fix: "Check supply symmetry, re-balance 3-phase loads",
        });
    }

    // Rule 5 – High current with low PF → bearing/winding stress
    if (I_avg > ratedCurrentA * 0.85 && ct.power_factor < 0.80) {
        anomalies.push({
            code: "BEARING_RISK",
            severity: "CRITICAL",
            title: "Bearing Wear Risk",
            message: `High current (${I_avg.toFixed(1)}A) combined with low PF (${ct.power_factor.toFixed(3)}) indicates probable winding or bearing stress.`,
            impact: "Predictive — early bearing/winding failure signal",
            fix: "Schedule inspection. Check lubrication, bearing clearance.",
        });
    }

    return {
        count: anomalies.length,
        critical: anomalies.filter(a => a.severity === "CRITICAL").length,
        warnings: anomalies.filter(a => a.severity === "WARNING").length,
        items: anomalies,
        imbalance_pct: +imbalance_pct.toFixed(2),
        load_pct: +load_pct.toFixed(1),
    };
}

// ─── Phase 2: CO₂ Tracker (PDR Tier 1E) ──────────────────────────────────────
// Indian grid emission factor: 0.82 kg CO₂ per kWh (CEA 2023)
const CO2_KG_PER_KWH = 0.82;

function calcCO2(kwhTotal) {
    const kg = kwhTotal * CO2_KG_PER_KWH;
    const trees = kg / 21.77; // 1 tree absorbs ~21.77 kg CO₂/year average
    return {
        kg_total: +kg.toFixed(4),
        trees_equiv: +trees.toFixed(4),
        factor: CO2_KG_PER_KWH,
    };
}

// ─── Phase 2: DISCOM Reactive Energy Penalty Estimator ───────────────────────
// Indian DISCOMs charge reactive energy surcharge when PF < 0.85
// Typical penalty: 0.5–1% surcharge per 0.01 PF below 0.90 (MSEDCL / BESCOM rates)
// Also: kVARh billing above 0.04 × kWh threshold on HT connections
function calcDISCOMPenalty(ct, kwhSession) {
    const PF = ct.power_factor;
    const kVARh = ct.reactive_kvar * (1 / 3600); // kVARh per tick

    // Surcharge: 1% of energy bill per 0.01 PF below 0.90
    let surcharge_pct = 0;
    if (PF < 0.90) {
        surcharge_pct = Math.min(15, ((0.90 - PF) / 0.01) * 1.0); // cap at 15%
    }
    const base_cost = kwhSession * SYSTEM.COST_PER_KWH;
    const penalty_rs = base_cost * (surcharge_pct / 100);
    const annual_penalty = penalty_rs * (6000 / (kwhSession || 1)); // project to annual

    return {
        pf: +PF.toFixed(3),
        surcharge_pct: +surcharge_pct.toFixed(2),
        penalty_rs: +penalty_rs.toFixed(2),
        annual_penalty_rs: +(kwhSession > 0 ? Math.min(annual_penalty, 999999) : 0).toFixed(0),
        status: PF >= 0.90 ? "OK" : PF >= 0.85 ? "RISK" : "PENALTY",
        threshold: 0.85,
        optimal: 0.95,
    };
}

// ─── Simulation tick ──────────────────────────────────────────────────────────
const TICK_SEC = 1; // 1 second tick

function simulateTick() {
    const payload = machineState.map((m) => {
        // Advance mode
        m.modeTick++;
        if (m.modeTick >= m.modeDuration) {
            m.modeIdx = (m.modeIdx + 1) % MODE_SEQ.length;
            m.mode = MODE_SEQ[m.modeIdx];
            m.modeTick = 0;
            m.modeDuration = 3 + Math.floor(Math.random() * 12);
        }

        const profile = MODE_PROFILES[m.mode];
        const c = m.claimed;

        // Mechanical loads
        const mechLoads = COMP_KEYS.map((k, i) => jitter(c[KW_KEYS[i]] * profile[k]));

        // Actual electrical draw (with motor efficiency + VFD)
        const actual = {};
        COMP_KEYS.forEach((k, i) => {
            let e = applyLoss(mechLoads[i], m.currentMotorClass[k]);
            if (m.hasVFD[k]) e = applyVFD(e, k);
            actual[k + "_kw"] = +e.toFixed(3);
        });

        const actual_total_kw = +Object.values(actual).reduce((s, v) => s + v, 0).toFixed(3);
        const claimed_total_kw = c.total_kw;

        // CT Clamp readings derived from actual power
        const ct = calcCTReadings(actual_total_kw);

        // Energy accumulation (kWh = kW × hours)
        const dKwh = actual_total_kw * (TICK_SEC / 3600);
        m.kwh_total += dKwh;
        m.cost_total += dKwh * SYSTEM.COST_PER_KWH;

        const savings = calcSavings(m, mechLoads);
        const anomalies = detectAnomalies(ct, actual_total_kw, m.rated_current_A, claimed_total_kw);
        const co2 = calcCO2(m.kwh_total);
        const discom = calcDISCOMPenalty(ct, m.kwh_total);

        m.history.push(actual_total_kw);
        if (m.history.length > 60) m.history.shift();

        const uptimeMs = Date.now() - m.startTime;

        return {
            id: m.id, name: m.name, make: m.make, model: m.model,
            location: m.location, year: m.year, mode: m.mode,
            claimed_total_kw, actual_total_kw,
            efficiency_pct: +(actual_total_kw / claimed_total_kw * 100).toFixed(1),
            deviation_kw: +(actual_total_kw - claimed_total_kw).toFixed(3),
            rated_current_A: m.rated_current_A,
            claimed: c, actual,
            currentMotorClass: m.currentMotorClass,
            hasVFD: m.hasVFD,
            ct_meter: ct,                           // Live CT clamp readings
            kwh_total: +m.kwh_total.toFixed(4),      // 24/7 energy accumulator
            cost_total: +m.cost_total.toFixed(2),    // 24/7 cost accumulator
            uptime_ms: uptimeMs,
            savings,
            anomalies,                               // ← Phase 2: anomaly alerts
            co2,                                     // ← Phase 2: CO₂ tracker
            discom,                                  // ← Phase 2: DISCOM penalty
            history: [...m.history],
        };
    });

    io.emit("telemetry", { timestamp: new Date().toISOString(), machines: payload });
}

setInterval(simulateTick, TICK_SEC * 1000);

app.get("/", (_, res) => res.json({ status: "AeroPulse CT-Meter Backend Online", system: SYSTEM, ct_spec: CT_SPEC }));
app.get("/machines", (_, res) => res.json(VMC_MACHINES));

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`✅ AeroPulse CT-Meter Backend → http://localhost:${PORT}`);
    console.log(`📡 CT Clamp: ${CT_SPEC.brand} ${CT_SPEC.model} (${CT_SPEC.ratio}) | ${CT_SPEC.accuracy}`);
    console.log(`⚡ System: ${SYSTEM.V_LINE}V L-L | ${SYSTEM.FREQ_HZ} Hz | ₹${SYSTEM.COST_PER_KWH}/kWh`);
    VMC_MACHINES.forEach(m => console.log(`   → ${m.id}: ${m.name} | Rated ${m.rated_current_A}A`));
});

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─── Motor Efficiency Standards (IEC 60034-30) ────────────────────────────────
// Higher IE class = higher efficiency = less energy wasted as heat
const IE_EFFICIENCY = {
    IE1: 0.870, // Standard (legacy, being phased out in India)
    IE2: 0.905, // High Efficiency (most common in Indian factories today)
    IE3: 0.930, // Premium Efficiency (BEE 5-star rated)
    IE4: 0.955, // Super Premium (newer VMCs in India)
    IE5: 0.975, // Ultra Premium (cutting edge, rare in India)
};

// VFD savings: variable torque loads (coolant, fans) can save 30-50% at partial speed
// Fixed torque loads (spindle cutting) save 5-15% via soft-start and better voltage control
const VFD_SAVINGS = {
    spindle: 0.10, // 10% savings — VFD allows precise speed control
    x_axis: 0.05, // 5%  — servo drives already have internal control
    y_axis: 0.05,
    z_axis: 0.05,
    coolant: 0.40, // 40% — pump is variable torque, huge savings at partial flow
    atc: 0.08, // 8%  — smoother engagement, reduced peak draw
    aux: 0.12, // 12% — lighting + fans benefit from VFD
};

// ─── VMC Machine Profiles ─────────────────────────────────────────────────────
const VMC_MACHINES = [
    {
        id: "VMC-01",
        name: "BFW VMC 400",
        make: "Bharat Fritz Werner",
        model: "VMC 400",
        location: "Shop Floor A",
        year: 2018,
        // Current installed motor classes (legacy IE2 — typical for 2018 era Indian VMC)
        currentMotorClass: {
            spindle: "IE2", x_axis: "IE2", y_axis: "IE2",
            z_axis: "IE2", coolant: "IE1", atc: "IE2", aux: "IE1",
        },
        hasVFD: { spindle: false, coolant: false, aux: false },
        claimed: {
            spindle_kw: 7.5, x_axis_kw: 1.5, y_axis_kw: 1.5,
            z_axis_kw: 1.5, coolant_kw: 0.37, atc_kw: 0.25, aux_kw: 0.5,
            total_kw: 13.12,
        },
        idle_kw: 2.8,
    },
    {
        id: "VMC-02",
        name: "Jyoti VMC 430",
        make: "Jyoti CNC Automation",
        model: "VMC 430",
        location: "Shop Floor A",
        year: 2020,
        currentMotorClass: {
            spindle: "IE3", x_axis: "IE2", y_axis: "IE2",
            z_axis: "IE2", coolant: "IE2", atc: "IE2", aux: "IE2",
        },
        hasVFD: { spindle: true, coolant: false, aux: false },
        claimed: {
            spindle_kw: 11.0, x_axis_kw: 2.0, y_axis_kw: 2.0,
            z_axis_kw: 2.0, coolant_kw: 0.37, atc_kw: 0.37, aux_kw: 0.75,
            total_kw: 18.49,
        },
        idle_kw: 3.5,
    },
    {
        id: "VMC-03",
        name: "MTAB AX 500",
        make: "MTAB Engineers",
        model: "AX 500",
        location: "Shop Floor B",
        year: 2016,
        currentMotorClass: {
            spindle: "IE2", x_axis: "IE1", y_axis: "IE1",
            z_axis: "IE2", coolant: "IE1", atc: "IE1", aux: "IE1",
        },
        hasVFD: { spindle: false, coolant: false, aux: false },
        claimed: {
            spindle_kw: 5.5, x_axis_kw: 1.2, y_axis_kw: 1.2,
            z_axis_kw: 1.2, coolant_kw: 0.18, atc_kw: 0.18, aux_kw: 0.4,
            total_kw: 9.88,
        },
        idle_kw: 2.1,
    },
];

// ─── Physics: Apply efficiency losses ────────────────────────────────────────
// Actual drawn power = Mechanical load needed / motor efficiency
// Lower efficiency → more electrical power drawn for same mechanical output
function applyMotorLoss(mechanicalKw, ieClass) {
    const eff = IE_EFFICIENCY[ieClass] || 0.90;
    return mechanicalKw / eff; // electrical input = mechanical output ÷ efficiency
}

function applyVFDSaving(electricalKw, component) {
    const saving = VFD_SAVINGS[component] || 0;
    return electricalKw * (1 - saving);
}

// ─── Calculate potential savings if upgraded ──────────────────────────────────
function calcSavings(machine, mechanicalLoads) {
    const components = ["spindle", "x_axis", "y_axis", "z_axis", "coolant", "atc", "aux"];
    const kwKeys = ["spindle_kw", "x_axis_kw", "y_axis_kw", "z_axis_kw", "coolant_kw", "atc_kw", "aux_kw"];

    const COST_PER_KWH = 7.5; // ₹ per kWh (avg Indian industrial tariff)
    const HRS_PER_YEAR = 6000; // typical 2-shift factory

    let currentTotal = 0;
    let ie3Total = 0, ie4Total = 0, ie5Total = 0, vfdTotal = 0, fullUpgradeTotal = 0;

    components.forEach((comp, i) => {
        const mechKw = mechanicalLoads[i];
        const currentClass = machine.currentMotorClass[comp];
        const hasVfd = machine.hasVFD[comp] || false;

        // Current actual electrical draw
        let current = applyMotorLoss(mechKw, currentClass);
        if (hasVfd) current = applyVFDSaving(current, comp);
        currentTotal += current;

        // IE3 upgrade (no VFD)
        ie3Total += applyMotorLoss(mechKw, "IE3");
        // IE4 upgrade
        ie4Total += applyMotorLoss(mechKw, "IE4");
        // IE5 upgrade
        ie5Total += applyMotorLoss(mechKw, "IE5");
        // VFD only (current IE class + VFD)
        vfdTotal += applyVFDSaving(applyMotorLoss(mechKw, currentClass), comp);
        // Full upgrade: IE5 + VFD
        fullUpgradeTotal += applyVFDSaving(applyMotorLoss(mechKw, "IE5"), comp);
    });

    function scenarioReturn(newTotal) {
        const savKw = Math.max(0, currentTotal - newTotal);
        const savKwhYear = savKw * HRS_PER_YEAR;
        const savRsYear = savKwhYear * COST_PER_KWH;
        const savPct = currentTotal > 0 ? (savKw / currentTotal) * 100 : 0;
        return { saving_kw: +savKw.toFixed(3), saving_pct: +savPct.toFixed(1), saving_rs_year: +savRsYear.toFixed(0) };
    }

    return {
        current_total_kw: +currentTotal.toFixed(3),
        scenarios: {
            ie3: { label: "IE3 Motors", ...scenarioReturn(ie3Total), est_cost_rs: 80000 },
            ie4: { label: "IE4 Motors", ...scenarioReturn(ie4Total), est_cost_rs: 150000 },
            ie5: { label: "IE5 Motors", ...scenarioReturn(ie5Total), est_cost_rs: 250000 },
            vfd_only: { label: "VFD Add-on", ...scenarioReturn(vfdTotal), est_cost_rs: 60000 },
            full_upgrade: { label: "IE5 + VFD", ...scenarioReturn(fullUpgradeTotal), est_cost_rs: 350000 },
        },
    };
}

// ─── Machining mode profiles ──────────────────────────────────────────────────
const MODES = ["idle", "cutting", "rapid", "tool_change"];
const MODE_PROFILES = {
    idle: { spindle: 0.0, x_axis: 0.0, y_axis: 0.0, z_axis: 0.0, coolant: 0.0, atc: 0.0, aux: 1.0 },
    cutting: { spindle: 0.85, x_axis: 0.7, y_axis: 0.6, z_axis: 0.5, coolant: 1.0, atc: 0.0, aux: 1.0 },
    rapid: { spindle: 0.3, x_axis: 1.0, y_axis: 1.0, z_axis: 0.8, coolant: 0.3, atc: 0.0, aux: 1.0 },
    tool_change: { spindle: 0.0, x_axis: 0.1, y_axis: 0.1, z_axis: 0.2, coolant: 0.0, atc: 1.0, aux: 1.0 },
};
const MODE_SEQ = ["idle", "rapid", "cutting", "cutting", "cutting", "rapid", "tool_change", "cutting", "idle"];
const COMP_KEYS = ["spindle", "x_axis", "y_axis", "z_axis", "coolant", "atc", "aux"];
const KW_KEYS = ["spindle_kw", "x_axis_kw", "y_axis_kw", "z_axis_kw", "coolant_kw", "atc_kw", "aux_kw"];

function jitter(v, p = 0.04) { return v * (1 + (Math.random() - 0.5) * 2 * p); }

const machineState = VMC_MACHINES.map((m, i) => ({
    ...m,
    mode: "idle",
    modeTick: 0,
    modeDuration: 4 + Math.floor(Math.random() * 10),
    modeIdx: [0, 3, 6][i],
    history: [],
}));

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

        // Mechanical loads per component (what the machine actually NEEDS)
        const mechLoads = COMP_KEYS.map((k, i) => jitter(c[KW_KEYS[i]] * profile[k]));

        // Actual electrical consumption = mechanical ÷ motor efficiency, with VFD correction
        const actual = {};
        COMP_KEYS.forEach((k, i) => {
            let elec = applyMotorLoss(mechLoads[i], m.currentMotorClass[k]);
            if (m.hasVFD[k]) elec = applyVFDSaving(elec, k);
            actual[k + "_kw"] = +elec.toFixed(3);
        });

        const actual_total_kw = Object.values(actual).reduce((s, v) => s + v, 0);
        const claimed_total_kw = c.total_kw;
        const efficiency_pct = (actual_total_kw / claimed_total_kw * 100);
        const deviation_kw = actual_total_kw - claimed_total_kw;

        // Savings analysis
        const savings = calcSavings(m, mechLoads);

        m.history.push(+actual_total_kw.toFixed(3));
        if (m.history.length > 30) m.history.shift();

        return {
            id: m.id, name: m.name, make: m.make, model: m.model,
            location: m.location, year: m.year, mode: m.mode,
            claimed_total_kw: +claimed_total_kw.toFixed(3),
            actual_total_kw: +actual_total_kw.toFixed(3),
            efficiency_pct: +efficiency_pct.toFixed(1),
            deviation_kw: +deviation_kw.toFixed(3),
            claimed: c,
            actual,
            currentMotorClass: m.currentMotorClass,
            hasVFD: m.hasVFD,
            savings,
            history: [...m.history],
        };
    });

    io.emit("telemetry", { timestamp: new Date().toISOString(), machines: payload });
}

setInterval(simulateTick, 1000);

app.get("/", (_, res) => res.json({ status: "AeroPulse VMC Telemetry Online" }));
app.get("/machines", (_, res) => res.json(VMC_MACHINES));

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`✅ AeroPulse VMC Backend running on http://localhost:${PORT}`);
    VMC_MACHINES.forEach(m => {
        const avgClass = Object.values(m.currentMotorClass).reduce((a, c) => a + IE_EFFICIENCY[c], 0) / Object.values(m.currentMotorClass).length;
        console.log(`   → ${m.id}: ${m.name} | Avg Motor Eff: ${(avgClass * 100).toFixed(1)}% | VFDs: ${Object.values(m.hasVFD).filter(Boolean).length}`);
    });
});

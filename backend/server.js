const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─── VMC Machine Profiles (Nameplate / Claimed Power Data) ───────────────────
// Real VMC specs widely used in Indian manufacturing
const VMC_MACHINES = [
    {
        id: "VMC-01",
        name: "BFW VMC 400",
        make: "Bharat Fritz Werner",
        model: "VMC 400",
        location: "Shop Floor A",
        claimed: {
            spindle_kw: 7.5,   // Spindle motor nameplate
            x_axis_kw: 1.5,   // X-axis servo
            y_axis_kw: 1.5,   // Y-axis servo
            z_axis_kw: 1.5,   // Z-axis servo
            coolant_kw: 0.37,  // Coolant pump
            atc_kw: 0.25,  // Automatic tool changer
            aux_kw: 0.5,   // Lighting, fans, control panel
            total_kw: 13.12, // Sum of all claimed
        },
        idle_kw: 2.8,           // Baseline standby power when idle
    },
    {
        id: "VMC-02",
        name: "Jyoti VMC 430",
        make: "Jyoti CNC Automation",
        model: "VMC 430",
        location: "Shop Floor A",
        claimed: {
            spindle_kw: 11.0,
            x_axis_kw: 2.0,
            y_axis_kw: 2.0,
            z_axis_kw: 2.0,
            coolant_kw: 0.37,
            atc_kw: 0.37,
            aux_kw: 0.75,
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
        claimed: {
            spindle_kw: 5.5,
            x_axis_kw: 1.2,
            y_axis_kw: 1.2,
            z_axis_kw: 1.2,
            coolant_kw: 0.18,
            atc_kw: 0.18,
            aux_kw: 0.4,
            total_kw: 9.88,
        },
        idle_kw: 2.1,
    },
];

// ─── Simulation State ─────────────────────────────────────────────────────────
// Each machine has a "mode": idle | cutting | rapid | tool_change
const MODES = ["idle", "cutting", "rapid", "tool_change"];

const machineState = VMC_MACHINES.map((m) => ({
    ...m,
    mode: "idle",
    modeTick: 0,
    modeDuration: 5 + Math.floor(Math.random() * 10),
    // Component load factors (what fraction of claimed power is actually drawn)
    actualFactors: {
        spindle: 0.0,
        x_axis: 0.0,
        y_axis: 0.0,
        z_axis: 0.0,
        coolant: 0.0,
        atc: 0.0,
        aux: 1.0,  // Always on
    },
    history: [],   // Track last 60 readings
}));

function jitter(val, pct = 0.05) {
    return val * (1 + (Math.random() - 0.5) * 2 * pct);
}

// Mode → load factor profiles
const MODE_PROFILES = {
    idle: {
        spindle: 0.0, x_axis: 0.0, y_axis: 0.0,
        z_axis: 0.0, coolant: 0.0, atc: 0.0, aux: 1.0,
    },
    cutting: {
        spindle: 0.85, x_axis: 0.7, y_axis: 0.6,
        z_axis: 0.5, coolant: 1.0, atc: 0.0, aux: 1.0,
    },
    rapid: {
        spindle: 0.3, x_axis: 1.0, y_axis: 1.0,
        z_axis: 0.8, coolant: 0.3, atc: 0.0, aux: 1.0,
    },
    tool_change: {
        spindle: 0.0, x_axis: 0.1, y_axis: 0.1,
        z_axis: 0.2, coolant: 0.0, atc: 1.0, aux: 1.0,
    },
};

// Mode sequence for realistic machining cycle
const MODE_SEQUENCE = ["idle", "rapid", "cutting", "cutting", "cutting", "rapid", "tool_change", "cutting", "idle"];
let modeIndex = [0, 3, 6]; // Different starting points per machine

function simulateTick() {
    const payload = machineState.map((m, i) => {
        // Advance mode on tick
        m.modeTick++;
        if (m.modeTick >= m.modeDuration) {
            modeIndex[i] = (modeIndex[i] + 1) % MODE_SEQUENCE.length;
            m.mode = MODE_SEQUENCE[modeIndex[i]];
            m.modeTick = 0;
            m.modeDuration = 3 + Math.floor(Math.random() * 12);
        }

        const profile = MODE_PROFILES[m.mode];
        const c = m.claimed;

        // Calculate actual power per component (with jitter)
        const actual = {
            spindle_kw: jitter(c.spindle_kw * profile.spindle),
            x_axis_kw: jitter(c.x_axis_kw * profile.x_axis),
            y_axis_kw: jitter(c.y_axis_kw * profile.y_axis),
            z_axis_kw: jitter(c.z_axis_kw * profile.z_axis),
            coolant_kw: jitter(c.coolant_kw * profile.coolant),
            atc_kw: jitter(c.atc_kw * profile.atc),
            aux_kw: jitter(c.aux_kw * profile.aux),
        };

        const actual_total_kw = Object.values(actual).reduce((s, v) => s + v, 0);
        const claimed_total_kw = c.total_kw;
        const efficiency_pct = ((actual_total_kw / claimed_total_kw) * 100).toFixed(1);
        const deviation_kw = (actual_total_kw - claimed_total_kw).toFixed(3);

        // Track history (keep last 30)
        m.history.push(parseFloat(actual_total_kw.toFixed(3)));
        if (m.history.length > 30) m.history.shift();

        return {
            id: m.id,
            name: m.name,
            make: m.make,
            model: m.model,
            location: m.location,
            mode: m.mode,
            claimed_total_kw: parseFloat(claimed_total_kw.toFixed(3)),
            actual_total_kw: parseFloat(actual_total_kw.toFixed(3)),
            efficiency_pct: parseFloat(efficiency_pct),
            deviation_kw: parseFloat(deviation_kw),
            claimed: c,
            actual,
            history: [...m.history],
        };
    });

    io.emit("telemetry", {
        timestamp: new Date().toISOString(),
        machines: payload,
    });
}

setInterval(simulateTick, 1000);

app.get("/", (_, res) => res.json({ status: "AeroPulse VMC Telemetry Broker Online" }));
app.get("/machines", (_, res) => res.json(VMC_MACHINES));

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`✅ AeroPulse VMC Backend running on http://localhost:${PORT}`);
    console.log(`📡 Streaming telemetry for ${VMC_MACHINES.length} VMC machines...`);
    VMC_MACHINES.forEach((m) => console.log(`   → ${m.id}: ${m.name} (Claimed: ${m.claimed.total_kw} kW)`));
});

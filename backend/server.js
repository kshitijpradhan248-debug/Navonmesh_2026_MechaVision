const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// ─── Constants ───────────────────────────────────────────────────────────────
const AMBIENT_TEMP_C = 25;
const NUM_DRONES = 3;
const NUM_MACHINES = 5;

// Machine locations in 3D space (fixed positions on factory floor)
const MACHINES = [
    { id: "M1", name: "CNC Lathe", x: -8, y: 0, z: -5 },
    { id: "M2", name: "Hydraulic Press", x: -3, y: 0, z: 5 },
    { id: "M3", name: "Conveyor Belt", x: 3, y: 0, z: -5 },
    { id: "M4", name: "Welding Station", x: 8, y: 0, z: 5 },
    { id: "M5", name: "Air Compressor", x: 0, y: 0, z: 0 },
];

// Drone state
const drones = Array.from({ length: NUM_DRONES }, (_, i) => ({
    id: `D${i + 1}`,
    x: Math.random() * 20 - 10,
    y: Math.random() * 2 + 0.5,
    z: Math.random() * 16 - 8,
    vx: (Math.random() - 0.5) * 0.4,
    vy: 0,
    vz: (Math.random() - 0.5) * 0.4,
}));

// ─── Helper: Random Variation ─────────────────────────────────────────────────
function randomDelta(range) {
    return (Math.random() - 0.5) * 2 * range;
}

// Machine simulation state
const machineTemps = MACHINES.map(() => 30 + Math.random() * 20);
const machineHz = MACHINES.map(() => 2000 + Math.random() * 5000);

// ─── Simulation Loop ──────────────────────────────────────────────────────────
function simulateTick() {
    // Update machine temperatures — occasionally spike
    MACHINES.forEach((_, i) => {
        machineTemps[i] += randomDelta(2);
        // Random anomaly spike
        if (Math.random() < 0.05) machineTemps[i] += 20 + Math.random() * 30;
        machineTemps[i] = Math.max(25, Math.min(120, machineTemps[i]));

        machineHz[i] += randomDelta(500);
        machineHz[i] = Math.max(500, Math.min(15000, machineHz[i]));
    });

    // Update drone positions (bounce inside factory bounds)
    drones.forEach((drone) => {
        drone.x += drone.vx;
        drone.y += drone.vy;
        drone.z += drone.vz;

        if (drone.x > 12 || drone.x < -12) drone.vx *= -1;
        if (drone.z > 9 || drone.z < -9) drone.vz *= -1;
        drone.y = Math.max(0.5, Math.min(3, drone.y));
    });

    // Build telemetry payload
    const machines = MACHINES.map((m, i) => ({
        id: m.id,
        name: m.name,
        position: { x: m.x, y: m.y, z: m.z },
        temp_surface: parseFloat(machineTemps[i].toFixed(2)),
        temp_ambient: AMBIENT_TEMP_C,
        hz_peak: parseFloat(machineHz[i].toFixed(1)),
    }));

    const payload = {
        timestamp: new Date().toISOString(),
        drones: drones.map((d) => ({
            id: d.id,
            x: parseFloat(d.x.toFixed(2)),
            y: parseFloat(d.y.toFixed(2)),
            z: parseFloat(d.z.toFixed(2)),
        })),
        machines,
    };

    io.emit("telemetry", payload);
}

// Emit every 1 second
setInterval(simulateTick, 1000);

// ─── REST health check ────────────────────────────────────────────────────────
app.get("/", (_, res) => res.json({ status: "AeroPulse Telemetry Broker Online" }));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`✅ AeroPulse Backend running on http://localhost:${PORT}`);
    console.log(`📡 Streaming telemetry for ${NUM_MACHINES} machines via WebSocket...`);
});

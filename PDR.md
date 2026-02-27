# 🚀 AeroPulse – VMC Energy Intelligence Platform
**Product Development Roadmap (PDR)**
Navonmesh 2026 | Kshitij Pradhan

---

## 1️⃣ Executive Summary

AeroPulse is a real-time industrial energy intelligence platform for CNC/VMC machines that:

- Measures simulated real 3-phase electrical behavior
- Compares nameplate vs actual consumption
- Detects inefficiencies using rule-based anomaly detection
- Recommends IE motor + VFD upgrades
- Calculates ROI and payback periods
- Tracks 24/7 kWh, ₹ cost, and CO₂ emissions

> It transforms traditional energy audits into **continuous energy intelligence**.

---

## 2️⃣ Problem Definition

### Industrial Reality

Manufacturing plants face:

- 15–30% hidden electrical waste
- Oversized motors running underloaded
- Poor power factor penalties from DISCOMs
- High harmonic distortion from legacy drives
- No continuous audit system

Compliance pressure from **Bureau of Energy Efficiency (BEE)** is increasing across Indian industry.

**Manual audits are:**

| Issue | Impact |
|---|---|
| Infrequent | Waste goes undetected for months |
| Expensive | ₹50K–₹2L per audit engagement |
| Disruptive | Require production shutdown |
| Non-predictive | No forward-looking intelligence |

---

## 3️⃣ Product Vision

### From Energy Monitoring → To Energy Intelligence

| Traditional | AeroPulse |
|---|---|
| Annual audit | Continuous real-time stream |
| Manual clamp meter | Simulated CT clamp (scalable to real) |
| Spreadsheet analysis | Live financial optimizer |
| No upgrade path | IE + VFD ROI calculator |

AeroPulse provides:
- ✔ Live 3-phase electrical simulation
- ✔ Physics-accurate motor efficiency modeling (IEC 60034-30)
- ✔ Real-time CT clamp power measurement
- ✔ Financial optimization layer
- ✔ Upgrade recommendation engine

---

## 4️⃣ System Architecture

```
┌───────────────────────────────────────────────────────┐
│              FRONTEND (React + Vite)                  │
│  CT Meter Panel · Summary Bar · Optimizer · Sidebar   │
└────────────────────┬──────────────────────────────────┘
                     │  WebSocket (Socket.io, 1s tick)
┌────────────────────▼──────────────────────────────────┐
│              BACKEND (Node.js + Express)               │
│  VMC Profiles · Mode FSM · Physics · CT · Optimizer   │
└───────────────────────────────────────────────────────┘
```

### 🔷 Tier 1 – Simulation & Electrical Physics Engine

#### A. VMC Profile Engine
Three real Indian OEM machines modeled with nameplate data:

| Machine | Make | Rated kW | Motor Class | VFDs |
|---|---|---|---|---|
| BFW VMC 400 (2018) | Bharat Fritz Werner | 13.12 kW | IE2 | 0 |
| Jyoti VMC 430 (2020) | Jyoti CNC Automation | 18.49 kW | IE3 spindle | 1 |
| MTAB AX 500 (2016) | MTAB Engineers | 9.88 kW | IE1/IE2 | 0 |

#### B. Machining Mode State Machine
Finite state machine cycling through operational states:

```
IDLE → RAPID MOVE → CUTTING → TOOL CHANGE → CUTTING → IDLE
```

Each state dynamically sets load factor per component (spindle, X/Y/Z axes, coolant, ATC, aux).

#### C. Motor Efficiency Physics (IEC 60034-30)

$$P_{elec} = \frac{P_{mech}}{\eta}$$

| Class | η (Efficiency) | Status in India |
|---|---|---|
| IE1 | 87.0% | Legacy, phased out |
| IE2 | 90.5% | Most common today |
| IE3 | 93.0% | BEE 5-star rated |
| IE4 | 95.5% | Newer VMCs |
| IE5 | 97.5% | Ultra premium |

VFD savings layered on top per component (10–40% depending on load type).

#### D. CT Clamp Electrical Derivation
Simulated device: **Hioki CT-100/5A** (100A:5A ratio, Class 1 accuracy, 55mm jaw)

$$I_{line} = \frac{P}{\sqrt{3} \cdot V_L \cdot PF}$$

Outputs per machine per tick:

| Parameter | Unit |
|---|---|
| Phase currents L1 / L2 / L3 | Amperes |
| Phase voltages L1 / L2 / L3 | Volts |
| Real Power | kW |
| Apparent Power | kVA |
| Reactive Power | kVAR |
| Power Factor | — |
| THD | % |
| Frequency | Hz |
| Phase Imbalance | A |

#### E. 24/7 Energy Accumulator

$$\Delta kWh = kW_{actual} \times \frac{1\text{ sec}}{3600}$$

- Cost: ₹7.5 / kWh (avg Indian industrial tariff)
- CO₂: 0.82 kg per kWh (Indian grid emission factor, CEA 2023)

#### F. Upgrade Optimizer Engine (per machine, per tick)

| Scenario | Typical Saving | Install Cost |
|---|---|---|
| IE3 Motors | 3–6% | ₹80K |
| IE4 Motors | 5–10% | ₹1.5L |
| IE5 Motors | 7–13% | ₹2.5L |
| VFD Add-on | 10–25% | ₹60K |
| IE5 + VFD | 15–30% | ₹3.5L |

Outputs: kW saved · % reduction · ₹ annual saving · Payback period (years)

---

### 🔷 Tier 2 – Intelligence Layer

#### A. Anomaly Detection Rules

| Condition | Trigger | Risk |
|---|---|---|
| PF < 0.85 | DISCOM penalty zone | Financial |
| THD > 5% | Harmonic distortion | Power quality |
| Load < 40% rated | Motor oversizing | Efficiency |
| Phase imbalance > 10% | Motor stress | Mechanical |
| High I + Low PF | Possible bearing wear | Predictive |

#### B. Waste Classification

Energy losses classified as:
- **Thermal loss** — IR losses in windings
- **Reactive loss** — Poor PF, avoidable with capacitor banks
- **Harmonic loss** — THD from non-linear loads
- **Underload inefficiency** — Motor operating far below rated capacity

---

### 🔷 Tier 3 – Frontend Intelligence Dashboard

**Stack:** React 18 + Vite 5 + Socket.io client + SVG charts

| Panel | Contents |
|---|---|
| **Summary Bar** | Total kW · Total kWh · Avg PF · ₹ cost · Potential saving |
| **Sidebar Cards** | Per-machine: mode · kW · current · PF · kWh · ₹ |
| **CT Meter Panel** | kW / kVA / kVAR / PF · 3-phase bars · THD · frequency · imbalance · 60s sparkline · uptime |
| **Component Breakdown** | Spindle / X/Y/Z / Coolant / ATC / Aux — actual vs claimed with IE badge |
| **Upgrade Optimizer** | 5-scenario comparison with payback years |

---

## 5️⃣ Data Flow

```
Machine Load (mode FSM)
    ↓
Motor Efficiency Model (IEC 60034-30)
    ↓
CT Clamp Electrical Derivation (3-phase physics)
    ↓
Energy Accumulator (kWh / ₹ / CO₂)
    ↓
Upgrade Optimizer (ROI engine)
    ↓
WebSocket Emit (1s tick, Socket.io)
    ↓
React Frontend Render (live UI update)
```

---

## 6️⃣ Current Gaps

| Gap | Impact | Priority |
|---|---|---|
| Persistent database (MongoDB) | No historical analytics or trend reports | High |
| Anomaly alert notifications | Detected but not visually surfaced | High |
| CO₂ visual tracker | Missing from current UI | Medium |
| PDF/CSV export | No compliance-ready output | Medium |
| ML-based anomaly detection | Currently rule-based only | Low |
| 3D factory digital twin | Reduced visual innovation | Low |

---

## 7️⃣ Development Roadmap

### ✅ Phase 1 – Core (Completed)
- VMC machine profiles with real nameplate data
- Machining mode state machine
- IE motor efficiency physics
- CT Clamp 3-phase simulation
- VFD + IE upgrade optimizer with ROI
- 24/7 kWh + ₹ accumulator
- React dashboard with all panels

### 🔄 Phase 2 – Intelligence Expansion
- Anomaly alerts panel (PF penalty, THD, imbalance, oversize warnings)
- CO₂ emissions visual in summary bar
- DISCOM penalty estimator (reactive energy surcharge)

### 📦 Phase 3 – Persistence & Reporting
- MongoDB storage for all telemetry
- 24h / 7d historical charts
- PDF compliance report export

### 🤖 Phase 4 – Advanced AI
- Predictive maintenance scoring
- ML clustering for abnormal consumption patterns
- Plant-wide multi-zone dashboard

---

## 8️⃣ Competitive Positioning

| Feature | Schneider / Siemens | AeroPulse |
|---|---|---|
| Target | Enterprise, large plant | CNC/VMC focused, SME-ready |
| Deployment | Expensive, long integration | Lightweight, browser-based |
| Upgrade guidance | Generic | Per-machine IE + VFD ROI |
| Cost | ₹10L+ | Open-source prototype |

**AeroPulse's key differentiator:** VMC-specific upgrade ROI intelligence in a lightweight real-time platform.

---

## 9️⃣ Innovation Strength

This project uniquely combines:

| Domain | Contribution |
|---|---|
| Electrical Engineering | IEC 60034-30 IE efficiency modeling |
| Industrial Physics | 3-phase CT clamp derivation formula |
| Financial Modeling | Payback & ROI engine per upgrade scenario |
| Real-time Systems | WebSocket streaming at 1-second resolution |
| Product Design | Unified intelligence dashboard for SME factories |

> This is beyond a standard hackathon dashboard — it is a **physics-grounded, financially aware, industry-aligned energy platform**.

---

## 🔟 Technical Maturity Score

| Area | Status | Notes |
|---|---|---|
| Electrical modeling | ✅ Strong | IEC 60034-30 compliant |
| Realism | ✅ Strong | Real OEM machines, real tariffs |
| UI/UX | ✅ Strong | Live CT meter, sparklines, optimizer |
| Intelligence layer | 🟡 Moderate | Rules-based, ML not yet added |
| Scalability | 🟡 Moderate | No DB persistence yet |
| Commercial readiness | 🟡 Moderate | Needs export + alerts |

---

## 🏁 Final Assessment

AeroPulse is a **technically grounded, financially aware, industry-aligned energy intelligence platform**.

With Phase 2–3 additions (anomaly alerts, CO₂ tracker, DB storage), this becomes a **near-commercial industrial SaaS product** targeting Indian SME manufacturing facilities.

---

*Built for Navonmesh 2026 · AeroPulse by Kshitij Pradhan*

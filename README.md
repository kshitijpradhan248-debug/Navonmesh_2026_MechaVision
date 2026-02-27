# ColorPilot Edge Dashboard

**System: Autonomous Energy Orchestration via Chromatic Entropy Mapping**

## 1. Vision Statement
ColorPilot transforms the "invisible" problem of manufacturing energy waste into a real-time, color-coded orchestration system. By combining Acoustic Entropy edge sensing with a decentralized packet-bidding protocol, ColorPilot allows factories to autonomously balance power loads.

## 2. The Problem: "The Grey Factory"
**Inefficient Energy Utilization in Manufacturing Operations**: Manufacturing industries are among the largest consumers of electricity and thermal energy. However, many facilities lack real-time visibility into energy consumption patterns across machines, production lines, and operational cycles. 

Legacy factories operate with a lack of data visibility where:
- **Standby Power** accounts for 30% of costs but remains unmeasured.
- **Peak Demand** spikes trigger massive utility penalties.
- **Mechanical Friction** (energy lost as heat/sound) is silent until total machine failure.

## 3. The ColorPilot Solution
We replace standard monitoring with **Chromatic Intelligence** and **Edge Autonomy**.

### A. The "Thermal-Acoustic" Spectrum
Instead of invasive wiring, non-intrusive MEMS sensors monitor a machine’s harmonic signature via Edge AI.
- **Green Pulse**: Optimal state; minimum entropy.
- **Yellow Shift**: Friction detected (kinetic energy bleeding into sound).
- **Red Alert**: High-Entropy waste; autonomous throttling engaged.

### B. Packetized Power Orchestration
Machines do not just draw power; they "bid" for it using a Token Bucket algorithm. If total factory load nears a peak threshold, non-essential machines are micro-delayed by milliseconds to "shave" the peak demand.

## 4. Technical Architecture
Our rapid prototype was orchestrated using Google Antigravity, allowing autonomous AI agents to build and verify our full-stack solution in record time.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Edge Nodes (Simulated)** | Node.js / MQTT | Generates real-time acoustic & amperage data. |
| **Control Logic** | Node Token-Bucket Script | Decentralized bidding & peak-load buffering. |
| **Frontend Twin** | Next.js + Tailwind (shadcn/ui) | The visual "ColorPilot" dashboard. |
| **DevOps** | Google Antigravity | Autonomous code generation and browser validation. |

## 5. Mathematical Optimization
The ColorPilot Efficiency Index (&chi;) is calculated by the ratio of "Work-Producing" energy to "Entropy-Generating" energy:

&chi; = E_work / (E_total + (S_entropy * k))

Where:
- **E_work** = Useful mechanical output.
- **S_entropy** = Measured Acoustic waste.
- **k** = The "Color Scaling" factor for real-time UI alerts.

---

## Agent Configuration (`agent.yaml`)
If you are setting up a structured multi-agent workspace in Antigravity, create a file named `agent.yaml` in your root directory and use this configuration:

```yaml
name: ColorPilot-Orchestrator
description: "Master agent for building the ColorPilot Energy Swarm project."
model: "gemini-3.1-pro"

sub_agents:
  - name: BackendIoT
    role: "Simulate edge node data and MQTT broker logic."
    tools: ["terminal", "code_editor"]
  
  - name: FrontendUI
    role: "Build the React/Tailwind dashboard for the Chromatic Twin."
    tools: ["code_editor", "browser"]
    
  - name: QATester
    role: "Verify that the Chromatic Twin changes from Green to Red when entropy spikes."
    tools: ["browser"]
```

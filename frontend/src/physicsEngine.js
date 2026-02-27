/**
 * AeroPulse Physics Engine (Tier 2)
 * Implements the Stefan–Boltzmann Law for radiative power loss calculation.
 *
 * Formula: P_loss = ε * σ * A * (T_surf^4 - T_ambient^4)
 * Where temperatures must be in Kelvin.
 */

const STEFAN_BOLTZMANN = 5.67e-8; // W/m²K⁴
const EMISSIVITY = 0.85;    // Typical industrial metal surface
const SURFACE_AREA_M2 = 1.5;     // Estimated machine surface area (m²)

// Severity thresholds (Watts)
const THRESHOLD_GREEN = 500;
const THRESHOLD_YELLOW = 1500;

/**
 * Convert Celsius to Kelvin.
 */
export function celsiusToKelvin(celsius) {
    return celsius + 273.15;
}

/**
 * Calculate radiative power loss using the Stefan–Boltzmann Law.
 * @param {number} tempSurfaceC  - Surface temperature in °C
 * @param {number} tempAmbientC  - Ambient temperature in °C
 * @returns {number} Power loss in Watts
 */
export function calcPowerLoss(tempSurfaceC, tempAmbientC) {
    const T_surf = celsiusToKelvin(tempSurfaceC);
    const T_ambient = celsiusToKelvin(tempAmbientC);
    const pLoss = EMISSIVITY * STEFAN_BOLTZMANN * SURFACE_AREA_M2 * (T_surf ** 4 - T_ambient ** 4);
    return Math.max(0, pLoss);
}

/**
 * Convert instantaneous Watts to kWh per hour.
 */
export function wattsToKwh(watts) {
    return watts / 1000;
}

/**
 * Classify the severity based on power loss.
 * @returns {'green'|'yellow'|'red'}
 */
export function getSeverity(powerLossWatts) {
    if (powerLossWatts < THRESHOLD_GREEN) return 'green';
    if (powerLossWatts < THRESHOLD_YELLOW) return 'yellow';
    return 'red';
}

/**
 * Full analysis for a single machine telemetry record.
 */
export function analyzeMachine(machine) {
    const pLoss = calcPowerLoss(machine.temp_surface, machine.temp_ambient);
    const kwhLoss = wattsToKwh(pLoss);
    const severity = getSeverity(pLoss);

    // Acoustic anomaly: frequencies above 10 kHz indicate abnormal friction/leaks
    const acousticAnomaly = machine.hz_peak > 10000;

    return {
        ...machine,
        power_loss_w: parseFloat(pLoss.toFixed(2)),
        kwh_loss: parseFloat(kwhLoss.toFixed(4)),
        severity,
        acousticAnomaly,
    };
}

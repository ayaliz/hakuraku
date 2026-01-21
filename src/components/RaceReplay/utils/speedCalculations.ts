import { RaceSimulateHorseResultData_RunningStyle } from "../../../data/race_data_pb";

export type SpeedCalculationParams = {
    courseDistance: number;
    currentDistance: number;
    speedStat: number;
    wisdomStat: number;
    strategy: number;
    distanceProficiency: number; // 1-8
    mood: number; // 1-5
    isOonige: boolean;
    inLastSpurt: boolean;
    slope: number; // 10000 = 100%
    powerStat: number;
};

export type TargetSpeedResult = {
    min: number;
    max: number;
    base: number;
};

// Coefficients
const STRATEGY_PHASE_COEFFS: Record<number, number[]> = {
    // [Early, Mid, Late]
    [RaceSimulateHorseResultData_RunningStyle.NIGE]: [1.0, 0.98, 0.962],
    [RaceSimulateHorseResultData_RunningStyle.SENKO]: [0.978, 0.991, 0.975],
    [RaceSimulateHorseResultData_RunningStyle.SASHI]: [0.938, 0.998, 0.994],
    [RaceSimulateHorseResultData_RunningStyle.OIKOMI]: [0.931, 1.0, 1.0],
};
const OONIGE_COEFFS = [1.063, 0.962, 0.95];

export function getDistanceCategory(distance: number): number {
    if (distance <= 1400) return 1;
    if (distance <= 1800) return 2;
    if (distance <= 2400) return 3;
    return 4;
}

const DISTANCE_PROFICIENCY_MODIFIER: Record<number, number> = {
    8: 1.05, // S
    7: 1.0,  // A
    6: 0.9,  // B
    5: 0.8,  // C
    4: 0.6,  // D
    3: 0.4,  // E
    2: 0.2,  // F
    1: 0.1,  // G
};

const MOOD_MODIFIER: Record<number, number> = {
    5: 1.04, // Great
    4: 1.02, // Good
    3: 1.0,  // Normal
    2: 0.98, // Bad
    1: 0.96, // Awful
};

export function adjustStat(stat: number, mood: number): number {
    let val = stat;
    if (val > 1200) {
        val = 1200 + (val - 1200) / 2;
    }
    const moodMod = MOOD_MODIFIER[mood] || 1.0;
    return val * moodMod;
    // Green skills tbd
}

export function calculateTargetSpeed(params: SpeedCalculationParams): TargetSpeedResult {
    const {
        courseDistance,
        currentDistance,
        speedStat,
        wisdomStat,
        powerStat,
        strategy,
        distanceProficiency,
        mood,
        isOonige,
        inLastSpurt,
        slope,
    } = params;

    const adjustedSpeed = adjustStat(speedStat, mood);
    const adjustedWisdom = adjustStat(wisdomStat, mood);
    const adjustedPower = adjustStat(powerStat, mood);

    const baseSpeed = 20.0 - (courseDistance - 2000) / 1000;

    let phase = 0; // 0: Early, 1: Mid, 2: Late
    if (currentDistance >= courseDistance * 2 / 3) {
        phase = 2;
    } else if (currentDistance >= courseDistance * 0.2) {
        phase = 1;
    }

    let strategyCoeffs = STRATEGY_PHASE_COEFFS[strategy] || STRATEGY_PHASE_COEFFS[RaceSimulateHorseResultData_RunningStyle.NIGE];
    if (isOonige) {
        strategyCoeffs = OONIGE_COEFFS;
    }

    const phaseCoeff = strategyCoeffs[phase];

    let baseTargetSpeed = baseSpeed * phaseCoeff;

    if (phase === 2) {
        const distMod = DISTANCE_PROFICIENCY_MODIFIER[distanceProficiency] || 1.0;
        baseTargetSpeed += Math.sqrt(500 * adjustedSpeed) * distMod * 0.002;
    }

    if (slope > 0) {
        const slopePer = slope / 10000;
        const penalty = (slopePer * 200) / adjustedPower; // m/s
        baseTargetSpeed -= penalty;
    }

    // Randomness
    // Does not affect speed during last spurt.
    if (inLastSpurt) {
        return {
            min: baseTargetSpeed,
            max: baseTargetSpeed,
            base: baseTargetSpeed,
        };
    }

    const logVal = Math.log10(adjustedWisdom * 0.1);
    const maxPct = (adjustedWisdom / 5500) * logVal;
    const minPct = maxPct - 0.65;

    const maxSpeed = baseTargetSpeed + baseSpeed * (maxPct / 100);
    const minSpeed = baseTargetSpeed + baseSpeed * (minPct / 100);

    return {
        min: minSpeed,
        max: maxSpeed,
        base: baseTargetSpeed,
    };
}

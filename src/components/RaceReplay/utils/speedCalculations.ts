import raceTrackData from "../../../data/tracks/racetracks.json";
import { RaceSimulateHorseResultData_RunningStyle } from "../../../data/race_data_pb";

export type SpeedCalculationParams = {
    courseDistance: number;
    courseId?: number;
    currentDistance: number;
    speedStat: number;
    wisdomStat: number;
    powerStat: number;
    gutsStat?: number;
    staminaStat?: number;
    strategy: number;
    distanceProficiency: number;
    mood: number;
    isOonige: boolean;
    inLastSpurt: boolean;
    slope: number;
    greenSkillBonuses?: { speed?: number; stamina?: number; power?: number; guts?: number; wisdom?: number };
    activeSpeedBuff?: number;
    isSpotStruggle?: boolean;
    isDueling?: boolean;
    isRushed?: boolean;
    rushedType?: number;
    activeSpeedDebuff?: number;
    isPaceUp?: boolean;
    isPaceDown?: boolean;
    isSpeedUp?: boolean;
    isOvertake?: boolean;
    isDownhillMode?: boolean;
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
// ... (rest of imports and types)

// ... (existing constants)

export function adjustStat(stat: number, mood: number, bonus: number = 0): number {
    let val = stat;
    if (val > 1200) {
        val = 1200 + (val - 1200) / 2;
    }
    const moodMod = MOOD_MODIFIER[mood] || 1.0;
    return val * moodMod + bonus;
}

export function getTrackStatThresholdModifier(courseId: number, stats: { speed: number, stamina: number, power: number, guts: number, wisdom: number }, mood: number): number {
    if (!courseId) return 1.0;
    const trackInfo = raceTrackData.pageProps.racetrackFilterData.find((t: any) => t.id === courseId);
    if (!trackInfo || !trackInfo.statThresholds || trackInfo.statThresholds.length === 0) return 1.0;

    const moodMod = MOOD_MODIFIER[mood] || 1.0;
    let totalMod = 0;
    let count = 0;

    trackInfo.statThresholds.forEach((statName: string) => {
        const statVal = (stats as any)[statName] ?? 0;
        const adjusted = statVal * moodMod;

        // Threshold check
        let mod = 1.0;
        if (adjusted > 900) mod = 1.2;
        else if (adjusted > 600) mod = 1.15;
        else if (adjusted > 300) mod = 1.1;
        else mod = 1.05;

        totalMod += mod;
        count++;
    });

    if (count === 0) return 1.0;
    return totalMod / count;
}

export function getDistanceCategory(distance: number): number {
    if (distance <= 1400) return 1;
    if (distance <= 1800) return 2;
    if (distance <= 2400) return 3;
    return 4;
}


export function calculateTargetSpeed(params: SpeedCalculationParams): TargetSpeedResult {
    const {
        courseDistance,
        courseId,
        currentDistance,
        speedStat,
        wisdomStat,
        powerStat,
        gutsStat = 0,
        staminaStat = 0,
        strategy,
        distanceProficiency,
        mood,
        isOonige,
        inLastSpurt,
        slope,
        greenSkillBonuses,
        activeSpeedBuff,
        isSpotStruggle,
        isDueling,
        isRushed,
        rushedType,
        activeSpeedDebuff,
        isPaceUp,
        isPaceDown,
        isSpeedUp,
        isOvertake,
        isDownhillMode,
    } = params;

    const trackSpeedMultiplier = getTrackStatThresholdModifier(courseId || 0, { speed: speedStat, stamina: staminaStat, power: powerStat, guts: gutsStat, wisdom: wisdomStat }, mood);

    const adjustedSpeed = adjustStat(speedStat, mood, greenSkillBonuses?.speed) * trackSpeedMultiplier;
    const adjustedWisdom = adjustStat(wisdomStat, mood, greenSkillBonuses?.wisdom);
    const adjustedPower = adjustStat(powerStat, mood, greenSkillBonuses?.power);
    const adjustedGuts = adjustStat(gutsStat, mood, greenSkillBonuses?.guts);

    const baseSpeed = 20.0 - (courseDistance - 2000) / 1000;

    let phase = 0; // 0: Early, 1: Mid, 2: Late/Last
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

    const distMod = DISTANCE_PROFICIENCY_MODIFIER[distanceProficiency] || 1.0;
    const speedTerm = Math.sqrt(500 * adjustedSpeed) * distMod * 0.002;

    if (phase === 2) {
        baseTargetSpeed += speedTerm;
    }
    if (inLastSpurt) {
        const baseTargetSpeedPhase2 = baseSpeed * strategyCoeffs[2];
        const lateRaceBaseSpeed = baseTargetSpeedPhase2 + speedTerm;
        const gutsTerm = Math.pow(450 * adjustedGuts, 0.597) * 0.0001;

        baseTargetSpeed = (lateRaceBaseSpeed + 0.01 * baseSpeed) * 1.05 + speedTerm + gutsTerm;
    }
    if (slope > 0) {
        const slopePer = slope / 10000;
        const penalty = (slopePer * 200) / adjustedPower; // m/s
        baseTargetSpeed -= penalty;
    }
    // Note: Downhill non-mode logic is usually handled by consuming less HP, not increasing speed, 
    // unless in Downhill Mode which is handled below.

    // Apply Position Keep Modifiers to Base Speed (before skills/downhill)
    let modeMultiplier = 1.0;
    if (isPaceUp || isSpeedUp) {
        modeMultiplier = 1.04;
    } else if (isOvertake) {
        modeMultiplier = 1.05;
    } else if (isPaceDown) {
        modeMultiplier = 0.915;
    }

    // Rushed type 2 is also a base speed multiplier
    if (isRushed && rushedType === 2) {
        modeMultiplier *= 1.04;
    }

    baseTargetSpeed *= modeMultiplier;


    if (isDownhillMode) {
        baseTargetSpeed += 0.3 + Math.abs(slope) / 1000;
    }

    baseTargetSpeed += (activeSpeedBuff || 0);
    baseTargetSpeed -= (activeSpeedDebuff || 0);

    if (isSpotStruggle) {
        baseTargetSpeed += Math.pow(500 * adjustedGuts, 0.6) * 0.0001;
    }
    if (isDueling) {
        baseTargetSpeed += Math.pow(200 * adjustedGuts, 0.708) * 0.0001;
    }

    // If in Last Spurt, no Wit variance (or rather, we are at the max/fixed speed)
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

export function calculateReferenceHpConsumption(speed: number, courseDistance: number) {
    const baseSpeed = 20.0 - (courseDistance - 2000.0) / 1000.0;
    return 20.0 * Math.pow(Math.max(0, speed - baseSpeed + 12.0), 2) / 144.0;
}

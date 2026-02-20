import GameDataLoader from "../../../data/GameDataLoader";
import { RaceSimulateHorseResultData_RunningStyle } from "../../../data/race_data_pb";
import {
    BASE_SPEED_CONSTANT, BASE_SPEED_COURSE_OFFSET, BASE_SPEED_COURSE_SCALE,
    HP_CONSUMPTION_SCALE, HP_CONSUMPTION_SPEED_OFFSET, HP_CONSUMPTION_DIVISOR,
    SLOPE_SCALE, SLOPE_PENALTY_COEFF,
    DOWNHILL_BONUS_BASE, DOWNHILL_BONUS_DIVISOR,
    PACE_UP_MULTIPLIER, OVERTAKE_MULTIPLIER, PACE_DOWN_MULTIPLIER, RUSHED_TYPE2_MULTIPLIER,
    SPOT_STRUGGLE_GUTS_BASE, SPOT_STRUGGLE_GUTS_EXPONENT, SPOT_STRUGGLE_GUTS_SCALE,
    DUELING_GUTS_BASE, DUELING_GUTS_EXPONENT, DUELING_GUTS_SCALE,
} from "./raceConstants";

type SpeedCalculationParams = {
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

type TargetSpeedResult = {
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

// Stat cap: above this, excess is halved before mood modifier
const STAT_CAP = 1200;

// Track stat threshold modifiers
const TRACK_STAT_THRESHOLD_HIGH = 900;
const TRACK_STAT_MODIFIER_HIGH = 1.2;
const TRACK_STAT_THRESHOLD_MID = 600;
const TRACK_STAT_MODIFIER_MID = 1.15;
const TRACK_STAT_THRESHOLD_LOW = 300;
const TRACK_STAT_MODIFIER_LOW = 1.1;
const TRACK_STAT_MODIFIER_BASE = 1.05;

// Speed term in base target speed: Math.sqrt(SPEED_TERM_COEFF * adjustedSpeed) * distMod * SPEED_TERM_SCALE
const SPEED_TERM_COEFF = 500;
const SPEED_TERM_SCALE = 0.002;

// Last spurt guts term: Math.pow(GUTS_TERM_BASE * guts, GUTS_TERM_EXPONENT) * GUTS_TERM_SCALE
const GUTS_TERM_BASE = 450;
const GUTS_TERM_EXPONENT = 0.597;
const GUTS_TERM_SCALE = 0.0001;

// Last spurt speed formula: (lateBase + LAST_SPURT_BASE_RATIO * baseSpeed) * LAST_SPURT_MULTIPLIER + speedTerm + gutsTerm
const LAST_SPURT_MULTIPLIER = 1.05;
const LAST_SPURT_BASE_RATIO = 0.01;

// Wisdom target speed variance
const WISDOM_VARIANCE_DIVISOR = 5500;
const WISDOM_LOG_SCALE = 0.1;
const WISDOM_MIN_PCT_OFFSET = 0.65;


export function adjustStat(stat: number, mood: number, bonus: number = 0): number {
    let val = stat;
    if (val > STAT_CAP) {
        val = STAT_CAP + (val - STAT_CAP) / 2;
    }
    const moodMod = MOOD_MODIFIER[mood] || 1.0;
    return val * moodMod + bonus;
}

function getTrackStatThresholdModifier(courseId: number, stats: { speed: number, stamina: number, power: number, guts: number, wisdom: number }, mood: number): number {
    if (!courseId) return 1.0;
    const trackInfo = GameDataLoader.racetracks.pageProps.racetrackFilterData.find((t: any) => t.id === courseId);
    if (!trackInfo || !trackInfo.statThresholds || trackInfo.statThresholds.length === 0) return 1.0;

    const moodMod = MOOD_MODIFIER[mood] || 1.0;
    let totalMod = 0;
    let count = 0;

    trackInfo.statThresholds.forEach((statName: string) => {
        const statVal = (stats as any)[statName] ?? 0;
        const adjusted = statVal * moodMod;

        let mod = TRACK_STAT_MODIFIER_BASE;
        if (adjusted > TRACK_STAT_THRESHOLD_HIGH) mod = TRACK_STAT_MODIFIER_HIGH;
        else if (adjusted > TRACK_STAT_THRESHOLD_MID) mod = TRACK_STAT_MODIFIER_MID;
        else if (adjusted > TRACK_STAT_THRESHOLD_LOW) mod = TRACK_STAT_MODIFIER_LOW;

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

    const baseSpeed = BASE_SPEED_CONSTANT - (courseDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;

    let phase = 0; // 0: Early, 1: Mid, 2: Late/Last
    if (currentDistance >= courseDistance * 2 / 3) {
        phase = 2;
    } else if (currentDistance >= courseDistance / 6) {
        phase = 1;
    }

    let strategyCoeffs = STRATEGY_PHASE_COEFFS[strategy] || STRATEGY_PHASE_COEFFS[RaceSimulateHorseResultData_RunningStyle.NIGE];
    if (isOonige) {
        strategyCoeffs = OONIGE_COEFFS;
    }

    const phaseCoeff = strategyCoeffs[phase];
    let baseTargetSpeed = baseSpeed * phaseCoeff;

    const distMod = DISTANCE_PROFICIENCY_MODIFIER[distanceProficiency] || 1.0;
    const speedTerm = Math.sqrt(SPEED_TERM_COEFF * adjustedSpeed) * distMod * SPEED_TERM_SCALE;

    if (phase === 2) {
        baseTargetSpeed += speedTerm;
    }
    if (inLastSpurt) {
        const baseTargetSpeedPhase2 = baseSpeed * strategyCoeffs[2];
        const lateRaceBaseSpeed = baseTargetSpeedPhase2 + speedTerm;
        const gutsTerm = Math.pow(GUTS_TERM_BASE * adjustedGuts, GUTS_TERM_EXPONENT) * GUTS_TERM_SCALE;

        baseTargetSpeed = (lateRaceBaseSpeed + LAST_SPURT_BASE_RATIO * baseSpeed) * LAST_SPURT_MULTIPLIER + speedTerm + gutsTerm;
    }
    if (slope > 0) {
        const slopePer = slope / SLOPE_SCALE;
        const penalty = (slopePer * SLOPE_PENALTY_COEFF) / adjustedPower;
        baseTargetSpeed -= penalty;
    }
    // Note: Downhill non-mode logic is usually handled by consuming less HP, not increasing speed,
    // unless in Downhill Mode which is handled below.

    // Apply Position Keep Modifiers to Base Speed (before skills/downhill)
    let modeMultiplier = 1.0;
    if (isPaceUp || isSpeedUp) {
        modeMultiplier = PACE_UP_MULTIPLIER;
    } else if (isOvertake) {
        modeMultiplier = OVERTAKE_MULTIPLIER;
    } else if (isPaceDown) {
        modeMultiplier = PACE_DOWN_MULTIPLIER;
    }

    // Rushed type 2 is also a base speed multiplier
    if (isRushed && rushedType === 2) {
        modeMultiplier *= RUSHED_TYPE2_MULTIPLIER;
    }

    baseTargetSpeed *= modeMultiplier;

    if (isDownhillMode) {
        baseTargetSpeed += DOWNHILL_BONUS_BASE + Math.abs(slope) / DOWNHILL_BONUS_DIVISOR;
    }

    baseTargetSpeed += (activeSpeedBuff || 0);
    baseTargetSpeed -= (activeSpeedDebuff || 0);

    if (isSpotStruggle) {
        baseTargetSpeed += Math.pow(SPOT_STRUGGLE_GUTS_BASE * adjustedGuts, SPOT_STRUGGLE_GUTS_EXPONENT) * SPOT_STRUGGLE_GUTS_SCALE;
    }
    if (isDueling) {
        baseTargetSpeed += Math.pow(DUELING_GUTS_BASE * adjustedGuts, DUELING_GUTS_EXPONENT) * DUELING_GUTS_SCALE;
    }

    // If in Last Spurt, no Wit variance (or rather, we are at the max/fixed speed)
    if (inLastSpurt) {
        return {
            min: baseTargetSpeed,
            max: baseTargetSpeed,
            base: baseTargetSpeed,
        };
    }

    const logVal = Math.log10(adjustedWisdom * WISDOM_LOG_SCALE);
    const maxPct = (adjustedWisdom / WISDOM_VARIANCE_DIVISOR) * logVal;
    const minPct = maxPct - WISDOM_MIN_PCT_OFFSET;

    const maxSpeed = baseTargetSpeed + baseSpeed * (maxPct / 100);
    const minSpeed = baseTargetSpeed + baseSpeed * (minPct / 100);

    return {
        min: minSpeed,
        max: maxSpeed,
        base: baseTargetSpeed,
    };
}

export function calculateReferenceHpConsumption(speed: number, courseDistance: number) {
    const baseSpeed = BASE_SPEED_CONSTANT - (courseDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;
    return HP_CONSUMPTION_SCALE * Math.pow(Math.max(0, speed - baseSpeed + HP_CONSUMPTION_SPEED_OFFSET), 2) / HP_CONSUMPTION_DIVISOR;
}

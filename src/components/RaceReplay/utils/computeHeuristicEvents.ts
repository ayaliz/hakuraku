import { TrainedCharaData } from "../../../data/TrainedCharaData";
import { calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption } from "./speedCalculations";
import { getActiveSpeedModifier, getSkillBaseTime } from "./SkillDataUtils";
import { RaceSimulateHorseResultData_RunningStyle } from "../../../data/race_data_pb";
import {
    SKILL_TIME_SCALE,
    DOWNHILL_BONUS_BASE, DOWNHILL_BONUS_DIVISOR,
    DOWNHILL_HP_RATIO_THRESHOLD, DOWNHILL_HP_RATIO_STRONG, DOWNHILL_HP_RATIO_PACE_DOWN,
    PACE_UP_MULTIPLIER, OVERTAKE_MULTIPLIER, PACE_DOWN_MULTIPLIER,
    TEMPTATION_MODE_RUSH_BOOST,
} from "./raceConstants";

// Event filtering
const MIN_EVENT_DURATION = 0.1;            // Discard events shorter than this (seconds)

// Position keep zone
const POSITION_KEEP_END_RATIO = 10 / 24;  // PK zone ends at this fraction of course distance
const COURSE_FACTOR_BASE_DIST = 1000;     // Reference distance for course factor formula
const COURSE_FACTOR_MULTIPLIER = 0.0008;  // Per-meter scale: courseFactor = 1 + (dist - BASE) * MULTIPLIER

// Mode detection thresholds
const EARLY_RACE_TIME = 2.0;              // Seconds: defines the early-race period
const PACE_TRIGGER_RATIO = 1.02;          // Speed must exceed reference × this to trigger Pace Up
const PACE_TRIGGER_ACCEL = 0.2;           // Acceleration (m/s²) required as secondary pace-up trigger
const SPEED_MATCH_TOLERANCE = 0.3;        // Tolerance (m/s) for matching a theoretical target speed
const DOWNHILL_NORMAL_MATCH_TOL = 0.2;    // Tolerance for preferring normal over downhill target
const PACE_EXIT_DECEL = -0.2;            // Deceleration that cancels a pace-up trigger
const PACE_EXIT_SPEED_RATIO = 1.005;      // Speed must be below reference × this alongside decel for exit
const EARLY_PACE_DOWN_SPEED_RATIO = 1.15; // Early race: pace down if below theoreticalPaceDown × this
const PACE_DOWN_SPEED_THRESHOLD = 0.98;   // Speed below res.min × this → speed-based pace down indicator
const PACE_DOWN_DECEL_THRESHOLD = -0.2;   // Deceleration level indicating pace down (with low speed)
const PACE_DOWN_ACCEL_CEILING = 0.2;      // Max accel to enter pace down by speed alone
const PACE_DOWN_SPEED_SOFT_RATIO = 1.06;  // Upper boundary of pace down territory
const PACE_DOWN_ACCEL_LIMIT = 0.5;        // Max accel for HP-based pace down check
const PACE_DOWN_EXIT_ACCEL = 0.2;         // Acceleration that forces pace down exit
const PACE_DOWN_EXIT_SPEED_RATIO = 1.02;  // Speed ratio for pace down exit alongside acceleration
const LEADER_PROXIMITY_EPSILON = 0.05;    // Distance (m) within which a horse is considered "at the front"

export type HeuristicEvent = {
    time: number;
    duration: number;
    name: string;
};

// Position Keep ranges for each strategy (meters behind leader)
// Based on game formula: courseFactor = 1 + (courseLength - 1000) * 0.0008
type PositionKeepRange = { min: number; max: number };
const POSITION_KEEP_RANGES: Record<number, (courseFactor: number) => PositionKeepRange> = {
    [RaceSimulateHorseResultData_RunningStyle.NIGE]: (_cf) => ({ min: 0, max: 3.0 }), // Front runner
    [RaceSimulateHorseResultData_RunningStyle.SENKO]: (cf) => ({ min: 3.0, max: 5.0 * cf }), // Leader
    [RaceSimulateHorseResultData_RunningStyle.SASHI]: (cf) => ({ min: 6.5 * cf, max: 7.0 * cf }), // Betweener
    [RaceSimulateHorseResultData_RunningStyle.OIKOMI]: (cf) => ({ min: 7.5 * cf, max: 8.0 * cf }), // Chaser
};

type ComputeHeuristicEventsParams = {
    frames: any[];
    goalInX: number;
    trainedCharaByIdx: Record<number, TrainedCharaData>;
    oonigeByIdx: Record<number, boolean>;
    horseInfoByIdx: Record<number, any>;
    trackSlopes: any[];
    passiveStatModifiers: Record<number, any>;
    skillActivations: Record<number, any[]>;
    otherEvents: Record<number, any[]>;
    lastSpurtStartDistances: Record<number, number>;
    detectedCourseId?: number;
};

export function computeHeuristicEvents(params: ComputeHeuristicEventsParams): Record<number, HeuristicEvent[]> {
    const {
        frames,
        goalInX,
        trainedCharaByIdx,
        oonigeByIdx,
        horseInfoByIdx,
        trackSlopes,
        passiveStatModifiers,
        skillActivations,
        otherEvents,
        lastSpurtStartDistances,
        detectedCourseId
    } = params;

    const events: Record<number, HeuristicEvent[]> = {};
    if (!frames || frames.length < 2 || goalInX <= 0) return events;

    const distanceCategory = getDistanceCategory(goalInX);
    const positionKeepEnd = POSITION_KEEP_END_RATIO * goalInX;

    const courseFactor = 1 + (goalInX - COURSE_FACTOR_BASE_DIST) * COURSE_FACTOR_MULTIPLIER;

    const hasFrontRunner = Object.entries(trainedCharaByIdx).some(([idx, chara]) => {
        const i = +idx;
        const info = horseInfoByIdx[i] ?? {};
        const runningStyleStr = info.running_style ?? 0;
        const strategy = +runningStyleStr > 0 ? +runningStyleStr : (chara.rawData?.param?.runningStyle ?? 1);
        return strategy === 1 || oonigeByIdx[i];
    });

    let designatedPacemaker: number = -1;
    if (!hasFrontRunner) {
        const candidates: Array<{ idx: number; strategy: number; gate: number }> = [];
        Object.entries(trainedCharaByIdx).forEach(([idx, chara]) => {
            const i = +idx;
            const info = horseInfoByIdx[i] ?? {};
            const runningStyleStr = info.running_style ?? 0;
            const strategy = +runningStyleStr > 0 ? +runningStyleStr : (chara.rawData?.param?.runningStyle ?? 1);
            const gate = info.gate_no ?? info.gateNo ?? 999;
            candidates.push({ idx: i, strategy, gate });
        });

        candidates.sort((a, b) => {
            if (a.strategy !== b.strategy) return a.strategy - b.strategy;
            return a.gate - b.gate;
        });

        if (candidates.length > 0) {
            designatedPacemaker = candidates[0].idx;
        }
    }

    const activeModes: Record<number, { type: string; startTime: number; lastTime: number }> = {};
    const activeDownhill: Record<number, { startTime: number; lastTime: number }> = {};

    const closeMode = (i: number, time: number) => {
        if (activeModes[i]) {
            const { type, startTime } = activeModes[i];
            const duration = time - startTime;
            if (duration > MIN_EVENT_DURATION) {
                if (!events[i]) events[i] = [];
                events[i].push({ time: startTime, duration, name: type });
            }
            delete activeModes[i];
        }
    };


    const closeDownhill = (i: number, time: number) => {
        if (activeDownhill[i]) {
            const { startTime } = activeDownhill[i];
            const duration = time - startTime;
            if (duration > MIN_EVENT_DURATION) {
                if (!events[i]) events[i] = [];
                events[i].push({ time: startTime, duration, name: "Downhill Mode" });
            }
            delete activeDownhill[i];
        }
    };

    const numHorses = frames[0]?.horseFrame?.length ?? 0;

    for (let f = 0; f < frames.length - 1; f++) {
        const frame = frames[f];
        const nextFrame = frames[f + 1];
        const time = frame.time ?? 0;
        const dt = (nextFrame.time ?? 0) - time;
        if (dt <= 0) continue;

        let leaderDistance = 0;
        if (frame.horseFrame) {
            for (let i = 0; i < frame.horseFrame.length; i++) {
                const d = frame.horseFrame[i]?.distance ?? 0;
                if (d > leaderDistance) leaderDistance = d;
            }
        }

        for (let i = 0; i < numHorses; i++) {
            const h = frame.horseFrame?.[i];
            const hNext = nextFrame.horseFrame?.[i];
            if (!h || !hNext) continue;

            const isPastPK = (h.distance ?? 0) >= positionKeepEnd;
            if (isPastPK) {
                closeMode(i, time);
            }

            const info = horseInfoByIdx[i] ?? {};
            const trainedChara = trainedCharaByIdx[i];
            if (!trainedChara) continue;

            const runningStyleStr = info.running_style ?? 0;
            const strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedChara.rawData?.param?.runningStyle ?? 1);
            const isOonige = oonigeByIdx[i] ?? false;

            const currentDistance = h.distance ?? 0;
            const currentSpeed = (h.speed ?? 0) / 100; // m/s
            const nextSpeed = (hNext.speed ?? 0) / 100;
            const accel = (nextSpeed - currentSpeed) / dt; // m/s^2

            const distanceFromLeader = leaderDistance - currentDistance;

            const hpDiff = (h.hp ?? 0) - (hNext.hp ?? 0);
            const rate = hpDiff / dt;

            const currentSlopeObj = trackSlopes.find((s: any) => currentDistance >= s.start && currentDistance < s.start + s.length);
            const currentSlope = currentSlopeObj?.slope ?? 0;

            const greenStats = passiveStatModifiers?.[i];
            let activeSpeedBuff = 0;
            if (skillActivations && skillActivations[i]) {
                skillActivations[i].forEach(activation => {
                    const skillId = activation.param[1];
                    const baseTime = getSkillBaseTime(skillId);
                    if (baseTime > 0) {
                        const duration = (baseTime / SKILL_TIME_SCALE) * (goalInX / 1000);
                        if (time >= activation.time && time < activation.time + duration) {
                            activeSpeedBuff += getActiveSpeedModifier(skillId);
                        }
                    }
                });
            }

            let isSpotStruggle = false;
            let isDueling = false;
            let isRushed = false;
            let rushedType = 0;
            const tempMode = h.temptationMode ?? 0;
            if (tempMode > 0) {
                isRushed = true;
                if (tempMode === TEMPTATION_MODE_RUSH_BOOST) rushedType = 2;
            }
            if (otherEvents && otherEvents[i]) {
                otherEvents[i].forEach(evt => {
                    if (time >= evt.time && time < evt.time + evt.duration) {
                        const name = evt.name || "";
                        if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) isSpotStruggle = true;
                        if (name.includes("Dueling") || name.includes("Competes (Speed)")) isDueling = true;
                        if (name.includes("Rushed")) {
                            isRushed = true;
                            if (name.includes("Boost")) rushedType = 2;
                        }
                    }
                });
            }

            const lastSpurtDist = lastSpurtStartDistances[i] ?? -1;
            const inLastSpurt = lastSpurtDist > 0 && currentDistance >= lastSpurtDist;

            const speedParams = {
                courseDistance: goalInX,
                courseId: detectedCourseId,
                currentDistance,
                speedStat: trainedChara.speed,
                wisdomStat: trainedChara.wiz,
                powerStat: trainedChara.pow,
                gutsStat: trainedChara.guts,
                staminaStat: trainedChara.stamina,
                strategy,
                distanceProficiency: trainedChara.properDistances[distanceCategory] ?? 1,
                mood: info.motivation ?? 3,
                isOonige,
                inLastSpurt,
                slope: currentSlope,
                greenSkillBonuses: greenStats,
                activeSpeedBuff,
                isSpotStruggle,
                isDueling,
                isRushed,
                rushedType
            };

            const res = calculateTargetSpeed(speedParams);
            let referenceMax = res.max;

            // Uphill Exit Protection
            if (currentSlope > 0) {
                const slopeEnd = currentSlopeObj ? currentSlopeObj.start + currentSlopeObj.length : currentDistance + 100;
                if (slopeEnd - currentDistance < 25) {
                    const nextSlopeObj = trackSlopes.find((s: any) => slopeEnd >= s.start && slopeEnd < s.start + s.length);
                    const nextSlope = nextSlopeObj?.slope ?? 0;
                    const resNext = calculateTargetSpeed({ ...speedParams, slope: nextSlope });
                    referenceMax = Math.max(referenceMax, resNext.max);
                }
            }

            let isDownhillMode = false;
            let downhillSpeedBonus = 0;
            const expected = calculateReferenceHpConsumption(currentSpeed, goalInX);
            const hpConsumptionRatio = expected > 0 && rate > 0 ? rate / expected : 1;

            if (currentSlope < 0) {
                downhillSpeedBonus = DOWNHILL_BONUS_BASE + Math.abs(currentSlope) / DOWNHILL_BONUS_DIVISOR;

                if (expected > 0 && rate > 0 && hpConsumptionRatio < DOWNHILL_HP_RATIO_THRESHOLD) {
                    if (hpConsumptionRatio < DOWNHILL_HP_RATIO_STRONG) {
                        isDownhillMode = true;
                    } else {
                        const baseSpeedNoBuffs = res.base - activeSpeedBuff;

                        const targetDownhill = res.base + downhillSpeedBonus;
                        const targetDownhillPaceUp = (baseSpeedNoBuffs * PACE_UP_MULTIPLIER) + activeSpeedBuff + downhillSpeedBonus;
                        const targetDownhillPaceDown = (baseSpeedNoBuffs * PACE_DOWN_MULTIPLIER) + activeSpeedBuff + downhillSpeedBonus;

                        const candidates = [targetDownhill, targetDownhillPaceUp, targetDownhillPaceDown];

                        const targetNormal = res.base;
                        const targetPaceUp = (baseSpeedNoBuffs * PACE_UP_MULTIPLIER) + activeSpeedBuff;
                        const targetPaceDown = (baseSpeedNoBuffs * PACE_DOWN_MULTIPLIER) + activeSpeedBuff;
                        const nonDownhillCandidates = [targetNormal, targetPaceUp, targetPaceDown];

                        let minDiff = Number.MAX_VALUE;
                        let bestMatchIsDownhill = true;

                        for (const c of candidates) {
                            const diff = Math.abs(currentSpeed - c);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestMatchIsDownhill = true;
                            }
                        }
                        for (const c of nonDownhillCandidates) {
                            const diff = Math.abs(currentSpeed - c);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestMatchIsDownhill = false;
                            }
                        }

                        if (bestMatchIsDownhill) {
                            isDownhillMode = true;
                        } else {
                            if (Math.abs(currentSpeed - targetNormal) < DOWNHILL_NORMAL_MATCH_TOL && Math.abs(currentSpeed - targetDownhill) > DOWNHILL_NORMAL_MATCH_TOL) {
                                isDownhillMode = false;
                            } else {
                                isDownhillMode = true;
                            }
                        }
                    }
                }
            }

            if (isDownhillMode) {
                referenceMax += downhillSpeedBonus;
                res.min += downhillSpeedBonus;
            }

            if (!isPastPK) {
            const isFrontRunner = strategy === 1 || isOonige;

            const posKeepRange = POSITION_KEEP_RANGES[strategy]?.(courseFactor) ?? { min: 0, max: 1000 };

            const canPaceUp = !isFrontRunner && distanceFromLeader > posKeepRange.max;
            const canPaceDown = !isFrontRunner && distanceFromLeader < posKeepRange.min;

            const isEarlyRace = time < EARLY_RACE_TIME;
            const isEarlyRacePaceDown = isEarlyRace && !isFrontRunner && i !== designatedPacemaker;

            let isTriggeredHigh = false;
            let isTriggeredLow = false;

            if (currentSpeed > referenceMax * PACE_TRIGGER_RATIO || (currentSpeed > referenceMax && accel > PACE_TRIGGER_ACCEL)) {
                if (isFrontRunner) {
                    if (isDownhillMode) {
                        const baseSpeedNoBuffs = res.base - activeSpeedBuff - downhillSpeedBonus;
                        const downhillOnlyMax = baseSpeedNoBuffs + activeSpeedBuff + downhillSpeedBonus;

                        const speedUpDownhillMax = (baseSpeedNoBuffs * PACE_UP_MULTIPLIER) + activeSpeedBuff + downhillSpeedBonus;
                        const overtakeDownhillMax = (baseSpeedNoBuffs * OVERTAKE_MULTIPLIER) + activeSpeedBuff + downhillSpeedBonus;

                        if (currentSpeed > downhillOnlyMax * PACE_TRIGGER_RATIO ||
                            Math.abs(currentSpeed - speedUpDownhillMax) < SPEED_MATCH_TOLERANCE ||
                            Math.abs(currentSpeed - overtakeDownhillMax) < SPEED_MATCH_TOLERANCE) {
                            isTriggeredHigh = true;
                        }
                    } else {
                        isTriggeredHigh = true;
                    }
                } else if (canPaceUp) {
                    if (isDownhillMode) {
                        const downhillOnlyMax = res.max + downhillSpeedBonus;

                        // Calculate expected Pace Up + Downhill max speed
                        // Pace Up applies PACE_UP_MULTIPLIER to base speed (before additives)
                        const baseSpeedNoBuffs = res.base - activeSpeedBuff;
                        const downhillPaceUpMax = (baseSpeedNoBuffs * PACE_UP_MULTIPLIER) + activeSpeedBuff + downhillSpeedBonus;

                        // Trigger only if:
                        // 1. Clearly breaking speed limit (> PACE_TRIGGER_RATIO above normal downhill max)
                        // 2. OR closely matching expected Pace Up + Downhill speed AND accelerating
                        if (currentSpeed > downhillOnlyMax * PACE_TRIGGER_RATIO ||
                            (Math.abs(currentSpeed - downhillPaceUpMax) < SPEED_MATCH_TOLERANCE && accel > PACE_TRIGGER_ACCEL)) {
                            isTriggeredHigh = true;
                        }
                    } else {
                        isTriggeredHigh = true;
                    }
                }
            }

            if (accel < PACE_EXIT_DECEL && currentSpeed < referenceMax * PACE_EXIT_SPEED_RATIO) {
                isTriggeredHigh = false;
            }

            const theoreticalPaceDown = (res.base * PACE_DOWN_MULTIPLIER) + (activeSpeedBuff || 0) + (isDownhillMode ? downhillSpeedBonus : 0);

            if (isEarlyRacePaceDown) {
                if (currentSpeed < theoreticalPaceDown * EARLY_PACE_DOWN_SPEED_RATIO && activeSpeedBuff <= 0) {
                    isTriggeredLow = true;
                }
            } else if (activeSpeedBuff <= 0) {


                let speedIndicatesPaceDown = false;
                let hpIndicatesPaceDown = false;


                if (!isDownhillMode && (currentSpeed < res.min * PACE_DOWN_SPEED_THRESHOLD || (currentSpeed < res.min && accel < PACE_DOWN_DECEL_THRESHOLD)) && accel < PACE_DOWN_ACCEL_CEILING) {
                    speedIndicatesPaceDown = true;
                }


                if (!isFrontRunner && canPaceDown && currentSpeed < theoreticalPaceDown * PACE_DOWN_SPEED_SOFT_RATIO && accel < PACE_DOWN_ACCEL_LIMIT) {
                    if (isDownhillMode) {

                        if (hpConsumptionRatio < DOWNHILL_HP_RATIO_PACE_DOWN) {
                            hpIndicatesPaceDown = true;
                        }
                    } else {

                        if (hpConsumptionRatio < DOWNHILL_HP_RATIO_THRESHOLD) {
                            hpIndicatesPaceDown = true;
                        }
                    }
                }


                if (speedIndicatesPaceDown || hpIndicatesPaceDown) {
                    isTriggeredLow = true;
                }
            }

            // "Low" Mode Exit Safeguard
            // If accelerating significantly while not firmly in "Low" territory, kill it.
            // Also force exit if we are clearly above Pace Down territory (e.g. due to strong acceleration)
            if ((accel > PACE_DOWN_EXIT_ACCEL && currentSpeed > theoreticalPaceDown * PACE_DOWN_EXIT_SPEED_RATIO) || (currentSpeed > theoreticalPaceDown * PACE_DOWN_SPEED_SOFT_RATIO)) {
                isTriggeredLow = false;
            }

            const currentMode = activeModes[i];

            if (currentMode) {
                // Check if we should exit
                if (currentMode.type === "Pace Up" || currentMode.type === "Speed Up" || currentMode.type === "Overtake") {
                    if (!isTriggeredHigh) {
                        closeMode(i, time);
                    } else {
                        activeModes[i].lastTime = time;
                    }
                } else if (currentMode.type === "Pace Down") {
                    if (!isTriggeredLow) {
                        closeMode(i, time);
                    } else {
                        activeModes[i].lastTime = time;
                    }
                }
            } else {
                // Try to enter a mode
                if (isTriggeredHigh) {
                    if (isFrontRunner) {
                        const isFirst = Math.abs(currentDistance - leaderDistance) < LEADER_PROXIMITY_EPSILON;
                        const type = isFirst ? "Speed Up" : "Overtake";
                        activeModes[i] = { type, startTime: time, lastTime: time };
                    } else {
                        activeModes[i] = { type: "Pace Up", startTime: time, lastTime: time };
                    }
                } else if (isTriggeredLow) {
                    if (!isFrontRunner) {
                        activeModes[i] = { type: "Pace Down", startTime: time, lastTime: time };
                    }
                }
            }


            } // end !isPastPK

            if (activeDownhill[i]) {

                if (!isDownhillMode) {
                    closeDownhill(i, time);
                } else {
                    activeDownhill[i].lastTime = time;
                }
            } else {

                if (isDownhillMode) {
                    activeDownhill[i] = { startTime: time, lastTime: time };
                }
            }
        }
    }


    Object.keys(activeModes).forEach(k => {
        const i = +k;
        closeMode(i, frames[frames.length - 1].time ?? 0);
    });
    Object.keys(activeDownhill).forEach(k => {
        const i = +k;
        closeDownhill(i, frames[frames.length - 1].time ?? 0);
    });

    return events;
}

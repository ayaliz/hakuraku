import { RaceSimulateData, RaceSimulateEventData_SimulateEventType } from "../../../data/race_data_pb";
import { fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import { getDistanceCategory, calculateTargetSpeed, adjustStat, calculateReferenceHpConsumption } from "./speedCalculations";
import { getPassiveStatModifiers, getSkillBaseTime, getActiveSpeedModifier, hasSkillEffect } from "./SkillDataUtils";
import { filterCharaSkills } from "../../../data/RaceDataUtils";
import GameDataLoader from "../../../data/GameDataLoader";
import {
    BASE_SPEED_CONSTANT, BASE_SPEED_COURSE_OFFSET, BASE_SPEED_COURSE_SCALE,
    HP_CONSUMPTION_SCALE, HP_CONSUMPTION_SPEED_OFFSET, HP_CONSUMPTION_DIVISOR,
    SLOPE_SCALE, SLOPE_PENALTY_COEFF,
    DOWNHILL_BONUS_BASE, DOWNHILL_BONUS_DIVISOR, DOWNHILL_HP_RATIO_THRESHOLD,
    SKILL_TIME_SCALE, DEFAULT_SKILL_DURATION,
    SPOT_STRUGGLE_GUTS_BASE, SPOT_STRUGGLE_GUTS_EXPONENT, SPOT_STRUGGLE_GUTS_SCALE,
    DUELING_GUTS_BASE, DUELING_GUTS_EXPONENT, DUELING_GUTS_SCALE,
} from "./raceConstants";

// Dueling detection
const DUELING_HP_THRESHOLD_RATIO = 0.05;   // Dueling ends if HP drops below this fraction of starting HP
const DUEL_UPHILL_SPEED_SLACK = 0.2;       // Min gap between target and current speed to check if duel resumes
const DUEL_ENTRY_ACCEL_MAX = 0.1;          // Max acceleration at duel start to consider early exit
const DUEL_RESUME_SPEED_SLACK = 0.05;      // Speed must exceed target + downhill bonus + this to count as resumed

// Spot Struggle (COMPETE_TOP)
const SPOT_STRUGGLE_DIST_RATIO = 9 / 24;           // Only active before this fraction of course distance
const SPOT_STRUGGLE_GUTS_DURATION_BASE = 700;       // Math.pow(BASE * guts, EXPONENT) * SCALE → duration
const SPOT_STRUGGLE_GUTS_DURATION_EXPONENT = 0.5;
const SPOT_STRUGGLE_GUTS_DURATION_SCALE = 0.012;

// Max adjusted speed calculation
const DECELERATION_THRESHOLD = -0.05;      // m/s²: frames with accel below this are skipped
const DUELING_FRAME_LOOKAHEAD = 2;         // Frames to skip after dueling ends before counting peak speed

// HP outcome calculation
const DEATH_EPSILON = 0.1;                 // Horse is considered to have died before finish if dist < raceDistance - this
const HP_STATUS_MODIFIER_GUTS_BASE = 600;  // Guts scaling base: 1 + COEFF / sqrt(BASE * guts)
const HP_STATUS_MODIFIER_COEFF = 200;


type HpOutcome ={ type: 'died', distance: number, deficit: number, startHp: number }
    | { type: 'survived', hp: number, startHp: number };

export function computeOtherEvents(
    raceData: RaceSimulateData,
    raceHorseInfo: any[],
    detectedCourseId: number | undefined,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]>,
    goalInX: number
): Record<number, { time: number; duration: number; name: string }[]> {
    const allOtherEvents: Record<number, { time: number; duration: number; name: string }[]> = {};
    if (!raceData.frame || raceData.frame.length === 0) {
        return allOtherEvents;
    }

    const charaData = new Map<number, TrainedCharaData>();
    const charaRawData = new Map<number, any>();
    if (raceHorseInfo) {
        raceHorseInfo.forEach((data, index) => {
            const frameOrder = (data['frame_order'] ?? data.frameOrder ?? (index + 1)) - 1;
            charaData.set(frameOrder, fromRaceHorseData(data));
            charaRawData.set(frameOrder, data);
        });
    }

    const distanceCategory = getDistanceCategory(goalInX);
    const trackSlopes = detectedCourseId ? (GameDataLoader.courseData as any)[detectedCourseId]?.slopes ?? [] : [];

    for (const event of raceData.event) {
        const e = event.event!;
        const frameOrder = e.param[0];
        const startTime = e.frameTime!;

        if (e.type === RaceSimulateEventData_SimulateEventType.COMPETE_FIGHT) {
            const startHp = raceData.frame[0].horseFrame[frameOrder].hp!;
            const hpThreshold = startHp * DUELING_HP_THRESHOLD_RATIO;
            let endTime = raceData.frame[raceData.frame.length - 1].time!;

            // Prepare data for speed check
            const trainedChara = charaData.get(frameOrder);
            const rawData = charaRawData.get(frameOrder);
            let checkSpeedCriteria = false;
            let passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
            let isOonige = false;
            let strategy = 1;

            if (trainedChara && rawData) {
                checkSpeedCriteria = true;
                // Passives
                const skillEvents = filterCharaSkills(raceData, frameOrder);
                const activatedSkillIds = new Set(skillEvents.map(ev => ev.param[1]));
                activatedSkillIds.forEach(id => {
                    const mods = getPassiveStatModifiers(id);
                    passiveStats.speed += (mods.speed || 0);
                    passiveStats.stamina += (mods.stamina || 0);
                    passiveStats.power += (mods.power || 0);
                    passiveStats.guts += (mods.guts || 0);
                    passiveStats.wisdom += (mods.wisdom || 0);
                });
                if (activatedSkillIds.has(202051)) isOonige = true;

                const runningStyleStr = rawData.running_style ?? 0;
                strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedChara.rawData?.param?.runningStyle ?? 1);
            }

            // Find start frame index
            let startIndex = 0;
            for (let i = 0; i < raceData.frame.length; i++) {
                if (raceData.frame[i].time! >= startTime) {
                    startIndex = i;
                    break;
                }
            }

            for (let i = startIndex; i < raceData.frame.length; i++) {
                const frame = raceData.frame[i];
                if (frame.horseFrame[frameOrder].hp! < hpThreshold) {
                    endTime = frame.time!;
                    break;
                }

                // Speed Check
                if (checkSpeedCriteria && trainedChara) {
                    const h = frame.horseFrame[frameOrder];
                    const currentSpeed = (h.speed ?? 0) / 100;
                    const frameTime = frame.time ?? 0;

                    let accel = 0;
                    if (i < raceData.frame.length - 1) {
                        const nextFrame = raceData.frame[i + 1];
                        const nextH = nextFrame.horseFrame[frameOrder];
                        const nextSpeed = (nextH.speed ?? 0) / 100;
                        const dt = (nextFrame.time! - frame.time!);
                        if (dt > 0) {
                            accel = (nextSpeed - currentSpeed) / dt;
                        }
                    }

                    let activeSpeedBuff = 0;
                    if (skillActivations && skillActivations[frameOrder]) {
                        skillActivations[frameOrder].forEach(s => {
                            const baseTime = getSkillBaseTime(s.param[1]);
                            const duration = baseTime > 0 ? (baseTime / SKILL_TIME_SCALE) * (goalInX / 1000) : DEFAULT_SKILL_DURATION;
                            if (frameTime >= s.time && frameTime < s.time + duration) {
                                activeSpeedBuff += getActiveSpeedModifier(s.param[1]);
                            }
                        });
                    }

                    const targetRes = calculateTargetSpeed({
                        courseDistance: goalInX,
                        courseId: detectedCourseId,
                        currentDistance: h.distance ?? 0,
                        speedStat: trainedChara.speed,
                        wisdomStat: trainedChara.wiz,
                        powerStat: trainedChara.pow,
                        gutsStat: trainedChara.guts,
                        staminaStat: trainedChara.stamina,
                        strategy,
                        distanceProficiency: trainedChara.properDistances[distanceCategory] ?? 1,
                        mood: rawData['motivation'],
                        isOonige,
                        inLastSpurt: (h.distance ?? 0) > (raceData.horseResult[frameOrder]?.lastSpurtStartDistance ?? 999999),
                        slope: 0,
                        greenSkillBonuses: passiveStats,
                        activeSpeedBuff: activeSpeedBuff,
                        isDueling: true,
                        isSpotStruggle: false
                    });

                    const dist = h.distance ?? 0;
                    const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
                    const currentSlope = currentSlopeObj?.slope ?? 0;
                    if (currentSlope > 0) {
                        const slopePer = currentSlope / SLOPE_SCALE;
                        const adjustedPower = adjustStat(trainedChara.pow, rawData['motivation'], passiveStats.power);
                        const penalty = (slopePer * SLOPE_PENALTY_COEFF) / adjustedPower;
                        targetRes.base -= penalty;
                    }

                    let isAffectedByUphill = currentSlope > 0;
                    if (!isAffectedByUphill && i < raceData.frame.length - 1) {
                        const nextFrame = raceData.frame[i + 1];
                        const nextH = nextFrame.horseFrame[frameOrder];
                        const nextDist = nextH.distance ?? 0;
                        const nextSlopeObj = trackSlopes.find((s: any) => nextDist >= s.start && nextDist < s.start + s.length);
                        const nextSlope = nextSlopeObj?.slope ?? 0;
                        if (nextSlope > 0) isAffectedByUphill = true;
                    }

                    if (!isAffectedByUphill && (targetRes.base > currentSpeed + DUEL_UPHILL_SPEED_SLACK) && (accel < DUEL_ENTRY_ACCEL_MAX)) {
                        let duelResumed = false;
                        for (let j = i + 1; j < raceData.frame.length; j++) {
                            const futureFrame = raceData.frame[j];
                            const futureH = futureFrame.horseFrame[frameOrder];
                            const futureSpeed = (futureH.speed ?? 0) / 100;
                            const futureTime = futureFrame.time ?? 0;
                            const futureDist = futureH.distance ?? 0;

                            let futureActiveSpeedBuff = 0;
                            if (skillActivations && skillActivations[frameOrder]) {
                                skillActivations[frameOrder].forEach(s => {
                                    const baseTime = getSkillBaseTime(s.param[1]);
                                    const dur = baseTime > 0 ? (baseTime / SKILL_TIME_SCALE) * (goalInX / 1000) : DEFAULT_SKILL_DURATION;
                                    if (futureTime >= s.time && futureTime < s.time + dur) {
                                        futureActiveSpeedBuff += getActiveSpeedModifier(s.param[1]);
                                    }
                                });
                            }

                            const futureTargetRes = calculateTargetSpeed({
                                courseDistance: goalInX,
                                courseId: detectedCourseId,
                                currentDistance: futureDist,
                                speedStat: trainedChara.speed,
                                wisdomStat: trainedChara.wiz,
                                powerStat: trainedChara.pow,
                                gutsStat: trainedChara.guts,
                                staminaStat: trainedChara.stamina,
                                strategy,
                                distanceProficiency: trainedChara.properDistances[distanceCategory] ?? 1,
                                mood: rawData['motivation'],
                                isOonige,
                                inLastSpurt: futureDist > (raceData.horseResult[frameOrder]?.lastSpurtStartDistance ?? 999999),
                                slope: 0,
                                greenSkillBonuses: passiveStats,
                                activeSpeedBuff: futureActiveSpeedBuff,
                                isDueling: false,
                                isSpotStruggle: false
                            });

                            const futureSlopeObj = trackSlopes.find((s: any) => futureDist >= s.start && futureDist < s.start + s.length);
                            const futureSlope = futureSlopeObj?.slope ?? 0;
                            if (futureSlope > 0) {
                                const slopePer = futureSlope / SLOPE_SCALE;
                                const adjustedPower = adjustStat(trainedChara.pow, rawData['motivation'], passiveStats.power);
                                futureTargetRes.base -= (slopePer * SLOPE_PENALTY_COEFF) / adjustedPower;
                            }

                            let futureDownhillBuff = 0;
                            if (futureSlope < 0 && j < raceData.frame.length - 1) {
                                const nextFutureH = raceData.frame[j + 1].horseFrame[frameOrder];
                                const dt = raceData.frame[j + 1].time! - futureTime;
                                if (dt > 0) {
                                    const rate = ((futureH.hp ?? 0) - (nextFutureH.hp ?? 0)) / dt;
                                    const expected = calculateReferenceHpConsumption(futureSpeed, goalInX);
                                    if (expected > 0 && rate > 0 && rate < expected * DOWNHILL_HP_RATIO_THRESHOLD) {
                                        futureDownhillBuff = DOWNHILL_BONUS_BASE + Math.abs(futureSlope) / DOWNHILL_BONUS_DIVISOR;
                                    }
                                }
                            }

                            if (futureSpeed > futureTargetRes.base + futureDownhillBuff + DUEL_RESUME_SPEED_SLACK) {
                                duelResumed = true;
                                break;
                            }
                        }

                        if (!duelResumed) {
                            endTime = frameTime;
                            break;
                        }
                    }
                }
            }
            if (!allOtherEvents[frameOrder]) {
                allOtherEvents[frameOrder] = [];
            }
            allOtherEvents[frameOrder].push({ time: startTime, duration: endTime - startTime, name: "Dueling" });
        }

        if (e.type === RaceSimulateEventData_SimulateEventType.COMPETE_TOP) {
            const guts = charaData.get(frameOrder)?.guts ?? 0;
            const gutsDuration = Math.pow(SPOT_STRUGGLE_GUTS_DURATION_BASE * guts, SPOT_STRUGGLE_GUTS_DURATION_EXPONENT) * SPOT_STRUGGLE_GUTS_DURATION_SCALE;
            const distanceThreshold = SPOT_STRUGGLE_DIST_RATIO * goalInX;

            let distanceThresholdTime = -1;
            for (let i = 0; i < raceData.frame.length; i++) {
                if (raceData.frame[i].horseFrame[frameOrder].distance! >= distanceThreshold) {
                    distanceThresholdTime = raceData.frame[i].time!;
                    break;
                }
            }
            if (distanceThresholdTime === -1) distanceThresholdTime = raceData.frame[raceData.frame.length - 1].time!;

            if (startTime < distanceThresholdTime) {
                const duration = Math.min(gutsDuration, distanceThresholdTime - startTime);
                if (!allOtherEvents[frameOrder]) {
                    allOtherEvents[frameOrder] = [];
                }
                allOtherEvents[frameOrder].push({ time: startTime, duration: duration, name: "Spot Struggle" });
            }
        }
    }
    return allOtherEvents;
}

export function calculateMaxAdjustedSpeed(
    frames: any[],
    frameOrder: number,
    raceDistance: number,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined,
    trackSlopes: any[],
    adjustedGuts: number,
    lastSpurtStartDistance: number = -1
): number {
    let maxAdjSpeed = 0;
    let wasType28Active = false;
    let lastDuelingActiveFrameIndex = -100;

    for (let fIdx = 0; fIdx < frames.length; fIdx++) {
        const frame = frames[fIdx];
        const h = frame.horseFrame?.[frameOrder];
        if (!h) continue;
        if ((h.distance ?? 0) > raceDistance) continue;
        const speed = (h.speed ?? 0) / 100;
        if (speed <= 0) continue;

        const time = frame.time ?? 0;
        let buff = 0;
        let isType28Active = false;

        // Skills
        if (skillActivations && skillActivations[frameOrder]) {
            skillActivations[frameOrder].forEach(s => {
                const baseTime = getSkillBaseTime(s.param[1]);
                const duration = baseTime > 0 ? (baseTime / SKILL_TIME_SCALE) * (raceDistance / 1000) : DEFAULT_SKILL_DURATION;
                if (time >= s.time && time < s.time + duration) {
                    buff += getActiveSpeedModifier(s.param[1]);
                    if (hasSkillEffect(s.param[1], 28)) {
                        isType28Active = true;
                    }
                }
            });
        }

        const shouldSkip = isType28Active || wasType28Active;
        wasType28Active = isType28Active;
        if (shouldSkip) continue;

        let isDuelingActive = false;
        // Other Events
        if (otherEvents && otherEvents[frameOrder]) {
            otherEvents[frameOrder].forEach(e => {
                if (time >= e.time && time < e.time + e.duration) {
                    const name = e.name || "";
                    if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) {
                        buff += Math.pow(SPOT_STRUGGLE_GUTS_BASE * adjustedGuts, SPOT_STRUGGLE_GUTS_EXPONENT) * SPOT_STRUGGLE_GUTS_SCALE;
                    }
                    if (name.includes("Dueling") || name.includes("Competes (Speed)")) {
                        buff += Math.pow(DUELING_GUTS_BASE * adjustedGuts, DUELING_GUTS_EXPONENT) * DUELING_GUTS_SCALE;
                        isDuelingActive = true;
                    }
                }
            });
        }

        if (isDuelingActive) {
            lastDuelingActiveFrameIndex = fIdx;
        } else {
            if (fIdx - lastDuelingActiveFrameIndex <= DUELING_FRAME_LOOKAHEAD) continue;
        }

        // Downhill Mode
        const dist = h.distance ?? 0;
        const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
        const currentSlope = currentSlopeObj?.slope ?? 0;

        if (currentSlope < 0) {
            const isInLastSpurt = lastSpurtStartDistance > 0 && dist >= lastSpurtStartDistance;
            if (isInLastSpurt) {
                buff += DOWNHILL_BONUS_BASE + Math.abs(currentSlope) / DOWNHILL_BONUS_DIVISOR;
            } else {
                const nextFrame = frames[fIdx + 1];
                if (nextFrame) {
                    const hNext = nextFrame.horseFrame?.[frameOrder];
                    if (hNext) {
                        const dt = (nextFrame.time ?? 0) - time;
                        if (dt > 0) {
                            const rate = ((h.hp ?? 0) - (hNext.hp ?? 0)) / dt;
                            const expected = calculateReferenceHpConsumption(speed, raceDistance);
                            if (expected > 0 && rate > 0 && rate < expected * DOWNHILL_HP_RATIO_THRESHOLD) {
                                buff += DOWNHILL_BONUS_BASE + Math.abs(currentSlope) / DOWNHILL_BONUS_DIVISOR;
                            }
                        }
                    }
                }
            }
        }

        // Deceleration Check
        let isDecelerating = false;
        if (fIdx > 0) {
            const prevFrame = frames[fIdx - 1];
            const hPrev = prevFrame.horseFrame?.[frameOrder];
            if (hPrev) {
                const prevSpeed = (hPrev.speed ?? 0) / 100;
                const dt = (time - (prevFrame.time ?? 0));
                if (dt > 0) {
                    const accel = (speed - prevSpeed) / dt;
                    if (accel < DECELERATION_THRESHOLD) isDecelerating = true;
                }
            }
        }
        if (!isDecelerating && fIdx < frames.length - 1) {
            const nextFrame = frames[fIdx + 1];
            const hNext = nextFrame.horseFrame?.[frameOrder];
            if (hNext) {
                const nextSpeed = (hNext.speed ?? 0) / 100;
                const dt = ((nextFrame.time ?? 0) - time);
                if (dt > 0) {
                    const accel = (nextSpeed - speed) / dt;
                    if (accel < DECELERATION_THRESHOLD) isDecelerating = true;
                }
            }
        }

        if (isDecelerating) continue;

        const adj = speed - buff;
        if (adj > maxAdjSpeed) maxAdjSpeed = adj;
    }

    return maxAdjSpeed;
}

export function calculateHpOutcome(
    frames: any[],
    frameOrder: number,
    raceDistance: number,
    adjustedGuts: number,
    maxAdjSpeed: number,
    lastSpurtTargetSpeed: number
): HpOutcome | undefined {
    if (frames.length === 0) return undefined;

    const startHp = frames[0].horseFrame?.[frameOrder]?.hp ?? 1;
    const firstDeathFrame = frames.find((f: any) => (f.horseFrame?.[frameOrder]?.hp ?? 1) === 0);

    if (firstDeathFrame) {
        const dist = firstDeathFrame.horseFrame?.[frameOrder]?.distance ?? 0;
        if (dist < raceDistance - DEATH_EPSILON) {
            const distance = raceDistance - dist;
            const baseSpeed = BASE_SPEED_CONSTANT - (raceDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;
            const statusModifier = 1.0 + HP_STATUS_MODIFIER_COEFF / Math.sqrt(HP_STATUS_MODIFIER_GUTS_BASE * adjustedGuts);
            const currentSpeed = maxAdjSpeed || lastSpurtTargetSpeed || BASE_SPEED_CONSTANT;

            const hpPerSec = HP_CONSUMPTION_SCALE * Math.pow(currentSpeed - baseSpeed + HP_CONSUMPTION_SPEED_OFFSET, 2) / HP_CONSUMPTION_DIVISOR * statusModifier;
            const time = distance / currentSpeed;
            const deficit = time * hpPerSec;

            return { type: 'died' as const, distance, deficit, startHp };
        }
    }

    const lastFrame = frames[frames.length - 1];
    const hp = lastFrame.horseFrame?.[frameOrder]?.hp ?? 0;
    return { type: 'survived' as const, hp, startHp };
}

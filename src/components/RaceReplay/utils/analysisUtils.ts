import { RaceSimulateData, RaceSimulateEventData_SimulateEventType } from "../../../data/race_data_pb";
import { fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import { getDistanceCategory, calculateTargetSpeed, adjustStat, calculateReferenceHpConsumption } from "./speedCalculations";
import { getPassiveStatModifiers, getSkillBaseTime, getActiveSpeedModifier, hasSkillEffect } from "./SkillDataUtils";
import { filterCharaSkills } from "../../../data/RaceDataUtils";
import GameDataLoader from "../../../data/GameDataLoader";


export type HpOutcome = { type: 'died', distance: number, deficit: number, startHp: number }
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
            const hpThreshold = startHp * 0.05;
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
                            const duration = baseTime > 0 ? (baseTime / 10000) * (goalInX / 1000) : 2.0;
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
                        const slopePer = currentSlope / 10000.;
                        const adjustedPower = adjustStat(trainedChara.pow, rawData['motivation'], passiveStats.power);
                        const penalty = (slopePer * 200) / adjustedPower;
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

                    if (!isAffectedByUphill && (targetRes.base > currentSpeed + 0.2) && (accel < 0.1)) {
                        endTime = frameTime;
                        break;
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
            const gutsDuration = Math.pow(700 * guts, 0.5) * 0.012;
            const distanceThreshold = (9 / 24) * goalInX;

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
    adjustedGuts: number
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
                const duration = baseTime > 0 ? (baseTime / 10000) * (raceDistance / 1000) : 2.0;
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
                        buff += Math.pow(500 * adjustedGuts, 0.6) * 0.0001;
                    }
                    if (name.includes("Dueling") || name.includes("Competes (Speed)")) {
                        buff += Math.pow(200 * adjustedGuts, 0.708) * 0.0001;
                        isDuelingActive = true;
                    }
                }
            });
        }

        if (isDuelingActive) {
            lastDuelingActiveFrameIndex = fIdx;
        } else {
            if (fIdx - lastDuelingActiveFrameIndex <= 2) continue;
        }

        // Downhill Mode
        const dist = h.distance ?? 0;
        const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
        const currentSlope = currentSlopeObj?.slope ?? 0;

        if (currentSlope < 0) {
            const nextFrame = frames[fIdx + 1];
            if (nextFrame) {
                const hNext = nextFrame.horseFrame?.[frameOrder];
                if (hNext) {
                    const dt = (nextFrame.time ?? 0) - time;
                    if (dt > 0) {
                        const rate = ((h.hp ?? 0) - (hNext.hp ?? 0)) / dt;
                        const expected = calculateReferenceHpConsumption(speed, raceDistance);
                        if (expected > 0 && rate > 0 && rate < expected * 0.8) {
                            buff += 0.3 + Math.abs(currentSlope) / 1000;
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
                    if (accel < -0.05) isDecelerating = true;
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
                    if (accel < -0.05) isDecelerating = true;
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
        if (dist < raceDistance - 0.1) {
            const distance = raceDistance - dist;
            const baseSpeed = 20.0 - (raceDistance - 2000) / 1000;
            const statusModifier = 1.0 + 200.0 / Math.sqrt(600.0 * adjustedGuts);
            const currentSpeed = maxAdjSpeed || lastSpurtTargetSpeed || 20;

            const hpPerSec = 20.0 * Math.pow(currentSpeed - baseSpeed + 12.0, 2) / 144.0 * statusModifier * 1.0;
            const time = distance / currentSpeed;
            const deficit = time * hpPerSec;

            return { type: 'died' as const, distance, deficit, startHp };
        }
    }

    const lastFrame = frames[frames.length - 1];
    const hp = lastFrame.horseFrame?.[frameOrder]?.hp ?? 0;
    return { type: 'survived' as const, hp, startHp };
}

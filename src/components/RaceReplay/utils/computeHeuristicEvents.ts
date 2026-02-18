import { TrainedCharaData } from "../../../data/TrainedCharaData";
import { calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption } from "./speedCalculations";
import { getActiveSpeedModifier, getSkillBaseTime } from "./SkillDataUtils";
import { RaceSimulateHorseResultData_RunningStyle } from "../../../data/race_data_pb";

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
    const positionKeepEnd = (10 / 24) * goalInX;

    const courseFactor = 1 + (goalInX - 1000) * 0.0008;

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
            if (duration > 0.1) { // Filter blips
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
            if (duration > 0.1) {
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

            if ((h.distance ?? 0) >= positionKeepEnd) {
                closeMode(i, time);
                continue;
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
                        const duration = (baseTime / 10000) * (goalInX / 1000);
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
                if (tempMode === 4) rushedType = 2;
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
                downhillSpeedBonus = 0.3 + Math.abs(currentSlope) / 1000000;

                if (expected > 0 && rate > 0 && hpConsumptionRatio < 0.8) {
                    if (hpConsumptionRatio < 0.5) {
                        isDownhillMode = true;
                    } else {
                        const baseSpeedNoBuffs = res.base - activeSpeedBuff;

                        const targetDownhill = res.base + downhillSpeedBonus;
                        const targetDownhillPaceUp = (baseSpeedNoBuffs * 1.04) + activeSpeedBuff + downhillSpeedBonus;
                        const targetDownhillPaceDown = (baseSpeedNoBuffs * 0.915) + activeSpeedBuff + downhillSpeedBonus;

                        const candidates = [targetDownhill, targetDownhillPaceUp, targetDownhillPaceDown];

                        const targetNormal = res.base;
                        const targetPaceUp = (baseSpeedNoBuffs * 1.04) + activeSpeedBuff;
                        const targetPaceDown = (baseSpeedNoBuffs * 0.915) + activeSpeedBuff;
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
                            if (Math.abs(currentSpeed - targetNormal) < 0.2 && Math.abs(currentSpeed - targetDownhill) > 0.2) {
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

            const isFrontRunner = strategy === 1 || isOonige;

            const posKeepRange = POSITION_KEEP_RANGES[strategy]?.(courseFactor) ?? { min: 0, max: 1000 };

            const canPaceUp = !isFrontRunner && distanceFromLeader > posKeepRange.max;
            const canPaceDown = !isFrontRunner && distanceFromLeader < posKeepRange.min;

            const isEarlyRace = time < 2.0;
            const isEarlyRacePaceDown = isEarlyRace && !isFrontRunner && i !== designatedPacemaker;

            let isTriggeredHigh = false;
            let isTriggeredLow = false;

            if (currentSpeed > referenceMax * 1.02 || (currentSpeed > referenceMax && accel > 0.2)) {
                if (isFrontRunner) {
                    if (isDownhillMode) {
                        const baseSpeedNoBuffs = res.base - activeSpeedBuff - downhillSpeedBonus;
                        const downhillOnlyMax = baseSpeedNoBuffs + activeSpeedBuff + downhillSpeedBonus;

                        const speedUpDownhillMax = (baseSpeedNoBuffs * 1.04) + activeSpeedBuff + downhillSpeedBonus;
                        const overtakeDownhillMax = (baseSpeedNoBuffs * 1.05) + activeSpeedBuff + downhillSpeedBonus;

                        if (currentSpeed > downhillOnlyMax * 1.02 ||
                            Math.abs(currentSpeed - speedUpDownhillMax) < 0.3 ||
                            Math.abs(currentSpeed - overtakeDownhillMax) < 0.3) {
                            isTriggeredHigh = true;
                        }
                    } else {
                        isTriggeredHigh = true;
                    }
                } else if (canPaceUp) {
                    if (isDownhillMode) {
                        const downhillOnlyMax = res.max + downhillSpeedBonus;

                        // Calculate expected Pace Up + Downhill max speed
                        // Pace Up applies 1.04x multiplier to base speed (before additives)
                        const baseSpeedNoBuffs = res.base - activeSpeedBuff;
                        const downhillPaceUpMax = (baseSpeedNoBuffs * 1.04) + activeSpeedBuff + downhillSpeedBonus;

                        // Trigger only if:
                        // 1. Clearly breaking speed limit (> 2% above normal downhill max)
                        // 2. OR closely matching expected Pace Up + Downhill speed AND accelerating
                        if (currentSpeed > downhillOnlyMax * 1.02 ||
                            (Math.abs(currentSpeed - downhillPaceUpMax) < 0.3 && accel > 0.2)) {
                            isTriggeredHigh = true;
                        }
                    } else {
                        isTriggeredHigh = true;
                    }
                }
            }

            if (accel < -0.2 && currentSpeed < referenceMax * 1.005) {
                isTriggeredHigh = false;
            }

            const theoreticalPaceDown = (res.base * 0.915) + (activeSpeedBuff || 0) + (isDownhillMode ? downhillSpeedBonus : 0);

            if (isEarlyRacePaceDown) {
                if (currentSpeed < theoreticalPaceDown * 1.15 && activeSpeedBuff <= 0) {
                    isTriggeredLow = true;
                }
            } else if (activeSpeedBuff <= 0) {


                let speedIndicatesPaceDown = false;
                let hpIndicatesPaceDown = false;


                if (!isDownhillMode && (currentSpeed < res.min * 0.98 || (currentSpeed < res.min && accel < -0.2)) && accel < 0.2) {
                    speedIndicatesPaceDown = true;
                }


                if (!isFrontRunner && canPaceDown && currentSpeed < theoreticalPaceDown * 1.06 && accel < 0.5) {
                    if (isDownhillMode) {

                        if (hpConsumptionRatio < 0.3) {
                            hpIndicatesPaceDown = true;
                        }
                    } else {

                        if (hpConsumptionRatio < 0.8) {
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
            if ((accel > 0.2 && currentSpeed > theoreticalPaceDown * 1.02) || (currentSpeed > theoreticalPaceDown * 1.06)) {
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
                        const isFirst = Math.abs(currentDistance - leaderDistance) < 0.05;
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

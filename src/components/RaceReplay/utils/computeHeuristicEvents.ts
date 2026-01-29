import { TrainedCharaData } from "../../../data/TrainedCharaData";
import { calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption } from "./speedCalculations";
import { getActiveSpeedModifier, getSkillBaseTime } from "./SkillDataUtils";

export type HeuristicEvent = {
    time: number;
    duration: number;
    name: string;
};

export type ComputeHeuristicEventsParams = {
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

/**
 * Computes heuristic events (Pace Up, Pace Down, Speed Up, Overtake) from race frames.
 * This is a pure function that can be called from both useHeuristicEvents hook and useCharaTableData.
 */
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

    // State for each horse
    const activeModes: Record<number, { type: string; startTime: number; lastTime: number }> = {};

    // Helper to close a mode
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

    const numHorses = frames[0]?.horseFrame?.length ?? 0;

    // Iterate frames
    for (let f = 0; f < frames.length - 1; f++) {
        const frame = frames[f];
        const nextFrame = frames[f + 1];
        const time = frame.time ?? 0;
        const dt = (nextFrame.time ?? 0) - time;
        if (dt <= 0) continue;

        // Calculate leader distance for this frame
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

            // Stop checking if past position keep
            if ((h.distance ?? 0) >= positionKeepEnd) {
                closeMode(i, time);
                continue;
            }

            const info = horseInfoByIdx[i] ?? {};
            const trainedChara = trainedCharaByIdx[i];
            if (!trainedChara) continue;

            // Stats / Strategy
            const runningStyleStr = info.running_style ?? 0;
            const strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedChara.rawData?.param?.runningStyle ?? 1);
            const isOonige = oonigeByIdx[i] ?? false;

            // Current State
            const currentDistance = h.distance ?? 0;
            const currentSpeed = (h.speed ?? 0) / 100; // m/s
            const nextSpeed = (hNext.speed ?? 0) / 100;
            const accel = (nextSpeed - currentSpeed) / dt; // m/s^2

            // Hp Rate
            const hpDiff = (h.hp ?? 0) - (hNext.hp ?? 0);
            const rate = hpDiff / dt;

            // Slope
            const currentSlopeObj = trackSlopes.find((s: any) => currentDistance >= s.start && currentDistance < s.start + s.length);
            const currentSlope = currentSlopeObj?.slope ?? 0;

            // Downhill Mode Check
            let isDownhillMode = false;
            if (currentSlope < 0) {
                const expected = calculateReferenceHpConsumption(currentSpeed, goalInX);
                if (expected > 0 && rate > 0 && rate < expected * 0.8) {
                    isDownhillMode = true;
                }
            }

            // --- Target Speed Calculation ---
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

            // Competition Events
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

            if (isDownhillMode) {
                referenceMax += 0.3 + Math.abs(currentSlope) / 1000;
            }

            // --- Mode Logic ---
            const isFrontRunner = strategy === 1 || isOonige;

            // Determine if trigger condition is met
            let isTriggeredHigh = false;
            let isTriggeredLow = false;

            if (currentSpeed > referenceMax * 1.02 || (currentSpeed > referenceMax && accel > 0.2)) {
                isTriggeredHigh = true;
            } else if (currentSpeed < res.min * 0.98 && accel <= 0.2) {
                isTriggeredLow = true;
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
        }
    }

    // Close any open modes at end of loop
    Object.keys(activeModes).forEach(k => {
        const i = +k;
        closeMode(i, frames[frames.length - 1].time ?? 0);
    });

    return events;
}

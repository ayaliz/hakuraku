import { TrainedCharaData } from "../../../data/TrainedCharaData";
import { calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption, computeGroundPowerBonus } from "./speedCalculations";
import { getActiveSpeedModifier, getHpDrainRatio, getSkillDef, getSkillDurationSecs, countGreenSkills } from "./SkillDataUtils";
import GameDataLoader from "../../../data/GameDataLoader";
import { isSkillEventTargetingFrame } from "../../../data/RaceDataUtils";
import { RaceSimulateEventData_SimulateEventType } from "../../../data/race_data_pb";
import {
    DOWNHILL_BONUS_BASE, DOWNHILL_BONUS_DIVISOR,
    DOWNHILL_HP_RATIO_THRESHOLD, DOWNHILL_HP_RATIO_STRONG, DOWNHILL_HP_RATIO_PACE_DOWN,
    PACE_UP_MULTIPLIER, OVERTAKE_MULTIPLIER, PACE_DOWN_MULTIPLIER,
    TEMPTATION_MODE_RUSH_BOOST,
} from "./raceConstants";
import { getPositionKeepRange, POSITION_KEEP_RANGE_LEEWAY } from "./positionKeepUtils";

// Event filtering
const MIN_EVENT_DURATION = 0.1;            // Discard events shorter than this (seconds)

// Position keep zone
const POSITION_KEEP_END_RATIO = 10 / 24;  // PK zone ends at this fraction of course distance
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

// A short PDM pulse can be split across two received-frame intervals, leaving
// neither interval near the full 0.6x HP drain. These deliberately conservative
// bounds were calibrated against CM17's sole-Pace-Chaser no-Front-Runner races.
// Keep the extension scoped to that same designated-Pace-Chaser problem.
const SHORT_PDM_MIN_INTERVAL_RATIO = 0.72;
const SHORT_PDM_MAX_INTERVAL_RATIO = 0.98;
const SHORT_PDM_MAX_COMBINED_RATIO = 0.98;
const SHORT_PDM_NORMAL_LEAD_IN_RATIO = 0.90;
const SHORT_PDM_MIN_DURATION = 0.15;
const HP_ENDPOINT_QUANTIZATION_ALLOWANCE = 1;

type HpIntervalEvidence = {
    t1: number;
    t2: number;
    d1: number;
    d2: number;
    hp1: number;
    hp2: number;
    hpLoss: number;
    hpDebuffLoss: number;
    expected: number;
    ratio: number;
    downhill: boolean;
    recovery: boolean;
};

export type HeuristicEvent = {
    time: number;
    duration: number;
    name: string;
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
    groundCondition?: number;
    raceData?: any;
    // Analysis-only escape hatch for controlled races where speed/HP evidence
    // is stronger than the approximate Position Keep entry/exit ranges.  The
    // UI keeps the range gate unless a caller explicitly disables it.
    ignorePositionKeepRangeForModeDetection?: boolean;
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
        detectedCourseId,
        groundCondition,
        raceData,
        ignorePositionKeepRangeForModeDetection = false,
    } = params;

    const events: Record<number, HeuristicEvent[]> = {};
    if (!frames || frames.length < 2 || goalInX <= 0) return events;

    const surface: number = detectedCourseId ? (GameDataLoader.courseData as any)[detectedCourseId]?.surface ?? 0 : 0;
    const groundPowerBonus = computeGroundPowerBonus(surface, groundCondition ?? 0);

    const distanceCategory = getDistanceCategory(goalInX);
    const positionKeepEnd = POSITION_KEEP_END_RATIO * goalInX;

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
    const hpIntervalHistory: Record<number, HpIntervalEvidence[]> = {};

    const skillHasRecovery = (skillId: number) => Boolean(getSkillDef(skillId)?.conditionGroups.some(group =>
        group.effects.some(effect => effect.type === 9 && effect.value > 0)
    ));

    const positiveVelocityOverlaps = (
        i: number,
        startTime: number,
        endTime: number,
        learnedSkillLevelById: Map<number, number>,
        scalingStats: TrainedCharaData & { greenSkillCount: number },
    ) => (skillActivations?.[i] ?? []).some(activation => {
        const skillId = activation.param[1];
        const modifier = getActiveSpeedModifier(
            skillId,
            activation.param?.[3],
            activation.skillLevel ?? learnedSkillLevelById.get(skillId),
            scalingStats,
        );
        if (modifier <= 0) return false;
        const duration = getSkillDurationSecs(skillId, goalInX, activation.time, activation.param?.[2], activation.param?.[3]);
        return activation.time < endTime && activation.time + duration > startTime;
    });

    const firstPositiveVelocityStartBetween = (
        i: number,
        startTime: number,
        endTime: number,
        learnedSkillLevelById: Map<number, number>,
        scalingStats: TrainedCharaData & { greenSkillCount: number },
    ) => {
        let first: number | undefined;
        for (const activation of skillActivations?.[i] ?? []) {
            if (!(activation.time > startTime && activation.time <= endTime)) continue;
            const skillId = activation.param[1];
            const modifier = getActiveSpeedModifier(
                skillId,
                activation.param?.[3],
                activation.skillLevel ?? learnedSkillLevelById.get(skillId),
                scalingStats,
            );
            if (modifier > 0 && (first === undefined || activation.time < first)) first = activation.time;
        }
        return first;
    };

    const recoveryNearInterval = (i: number, startTime: number, endTime: number) =>
        (skillActivations?.[i] ?? []).some(activation =>
            skillHasRecovery(activation.param[1])
            && activation.time >= startTime - 2
            && activation.time <= endTime + 2
        );

    const addShortPaceDownEvent = (i: number, startTime: number, endTime: number) => {
        if (endTime - startTime < MIN_EVENT_DURATION) return;
        if (!events[i]) events[i] = [];
        const overlapping = events[i].find(event =>
            event.name === "Pace Down"
            && event.time < endTime
            && event.time + event.duration > startTime
        );
        if (overlapping) {
            const mergedStart = Math.min(overlapping.time, startTime);
            const mergedEnd = Math.max(overlapping.time + overlapping.duration, endTime);
            overlapping.time = mergedStart;
            overlapping.duration = mergedEnd - mergedStart;
        } else {
            events[i].push({ time: startTime, duration: endTime - startTime, name: "Pace Down" });
        }
    };

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
    const hpDebuffHitsByIdx: Record<number, Array<{ time: number; amount: number }>> = {};
    if (raceData?.event) {
        const raceHorseInfo = Array.from({ length: numHorses }, (_, i) => horseInfoByIdx[i]);
        for (const wrappedEvent of raceData.event) {
            const event = wrappedEvent?.event;
            if (!event?.param || event.type !== RaceSimulateEventData_SimulateEventType.SKILL) continue;
            const drainRatio = getHpDrainRatio(event.param[1], event.param?.[3]);
            if (drainRatio <= 0) continue;
            for (let target = 0; target < numHorses; target++) {
                if (!isSkillEventTargetingFrame(raceData, event, target, raceHorseInfo)) continue;
                const maxHp = frames[0]?.horseFrame?.[target]?.hp ?? 0;
                if (!(maxHp > 0)) continue;
                hpDebuffHitsByIdx[target] ??= [];
                hpDebuffHitsByIdx[target].push({
                    time: event.frameTime ?? 0,
                    amount: maxHp * drainRatio,
                });
            }
        }
    }

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
            const strategyProficiency = trainedChara.properRunningStyles[isOonige ? 1 : strategy] ?? 7;

            const currentDistance = h.distance ?? 0;
            const currentSpeed = (h.speed ?? 0) / 100; // m/s
            const nextSpeed = (hNext.speed ?? 0) / 100;
            const accel = (nextSpeed - currentSpeed) / dt; // m/s^2

            const distanceFromLeader = leaderDistance - currentDistance;

            const observedHpDiff = (h.hp ?? 0) - (hNext.hp ?? 0);
            const hpDebuffLoss = (hpDebuffHitsByIdx[i] ?? [])
                .filter(hit => hit.time > time && hit.time <= (nextFrame.time ?? time))
                .reduce((total, hit) => total + hit.amount, 0);
            const hpDiff = Math.max(0, observedHpDiff - hpDebuffLoss);
            const rate = hpDiff / dt;

            const currentSlopeObj = trackSlopes.find((s: any) => currentDistance >= s.start && currentDistance < s.start + s.length);
            const currentSlope = currentSlopeObj?.slope ?? 0;

            const greenStats = passiveStatModifiers?.[i];
            const learnedSkillLevelById = new Map(trainedChara.skills.map(skill => [skill.skillId, skill.level]));
            const scalingStats = { ...trainedChara, greenSkillCount: countGreenSkills(skillActivations?.[i]) };
            let activeSpeedBuff = 0;
            if (skillActivations && skillActivations[i]) {
                skillActivations[i].forEach(activation => {
                    const skillId = activation.param[1];
                    const duration = getSkillDurationSecs(skillId, goalInX, activation.time, activation.param?.[2], activation.param?.[3]);
                    if (time >= activation.time && time < activation.time + duration) {
                        activeSpeedBuff += getActiveSpeedModifier(
                            skillId,
                            activation.param?.[3],
                            activation.skillLevel ?? learnedSkillLevelById.get(skillId),
                            scalingStats
                        );
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
                strategyProficiency,
                mood: info.motivation ?? 3,
                isOonige,
                inLastSpurt,
                slope: currentSlope,
                greenSkillBonuses: greenStats ? { ...greenStats, power: greenStats.power + groundPowerBonus } : { speed: 0, stamina: 0, power: groundPowerBonus, guts: 0, wisdom: 0 },
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
            // The exact speed trajectory inside the ~16/15s observation gap is
            // unavailable. The lower endpoint is a conservative lower bound for
            // normal HP drain and reduces false PDM/downhill detections.
            const hpReferenceSpeed = Math.min(currentSpeed, nextSpeed);
            const expected = calculateReferenceHpConsumption(hpReferenceSpeed, goalInX);
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

            const posKeepRange = getPositionKeepRange(strategy, goalInX);
            const canPaceUp = !isFrontRunner
                && (ignorePositionKeepRangeForModeDetection || (
                    posKeepRange !== null
                    && distanceFromLeader > posKeepRange.max - POSITION_KEEP_RANGE_LEEWAY
                ));
            const canPaceDown = !isFrontRunner
                && (ignorePositionKeepRangeForModeDetection || (
                    posKeepRange !== null
                    && distanceFromLeader < posKeepRange.min + POSITION_KEEP_RANGE_LEEWAY
                ));

            const intervalExpected = expected * dt;
            const intervalEvidence: HpIntervalEvidence = {
                t1: time,
                t2: nextFrame.time ?? time,
                d1: currentDistance,
                d2: hNext.distance ?? currentDistance,
                hp1: h.hp ?? 0,
                hp2: hNext.hp ?? 0,
                hpLoss: hpDiff,
                hpDebuffLoss,
                expected: intervalExpected,
                ratio: intervalExpected > 0 ? hpDiff / intervalExpected : 1,
                downhill: trackSlopes.some((slope: any) =>
                    slope.slope < 0
                    && Math.max(currentDistance, hNext.distance ?? currentDistance) >= slope.start
                    && Math.min(currentDistance, hNext.distance ?? currentDistance) < slope.start + slope.length
                ),
                recovery: recoveryNearInterval(i, time, nextFrame.time ?? time),
            };
            const history = hpIntervalHistory[i] ?? [];
            const priorInterval = history.at(-1);
            const leadInInterval = history.at(-2);

            if (strategy === 2
                && i === designatedPacemaker
                && time >= EARLY_RACE_TIME
                && canPaceDown
                && priorInterval
                && priorInterval.t2 === intervalEvidence.t1
                && priorInterval.d2 < positionKeepEnd
                && intervalEvidence.d2 < positionKeepEnd
                && priorInterval.expected >= 6
                && intervalEvidence.expected >= 6
                && !priorInterval.downhill
                && !intervalEvidence.downhill
                && !priorInterval.recovery
                && !intervalEvidence.recovery
                && priorInterval.hpLoss >= 0
                && intervalEvidence.hpLoss >= 0
                && priorInterval.ratio > SHORT_PDM_MIN_INTERVAL_RATIO
                && intervalEvidence.ratio > SHORT_PDM_MIN_INTERVAL_RATIO
                && priorInterval.ratio < SHORT_PDM_MAX_INTERVAL_RATIO
                && intervalEvidence.ratio < SHORT_PDM_MAX_INTERVAL_RATIO
                && (!leadInInterval
                    || leadInInterval.ratio >= SHORT_PDM_NORMAL_LEAD_IN_RATIO
                    || positiveVelocityOverlaps(i, leadInInterval.t1, leadInInterval.t2, learnedSkillLevelById, scalingStats))) {
                const combinedExpected = priorInterval.expected + intervalEvidence.expected;
                // Across both intervals there are only two outer integer HP
                // endpoints, so grant one HP total rather than one per interval.
                const conservativeRatio = (
                    priorInterval.hpLoss + intervalEvidence.hpLoss + HP_ENDPOINT_QUANTIZATION_ALLOWANCE
                ) / combinedExpected;
                const conservativeDuration = Math.max(0, (1 - conservativeRatio) / 0.4)
                    * (intervalEvidence.t2 - priorInterval.t1);
                const priorOccupancy = Math.max(0, (
                    1 - (priorInterval.hpLoss + HP_ENDPOINT_QUANTIZATION_ALLOWANCE) / priorInterval.expected
                ) / 0.4) * (priorInterval.t2 - priorInterval.t1);
                const currentOccupancy = Math.max(0, (
                    1 - (intervalEvidence.hpLoss + HP_ENDPOINT_QUANTIZATION_ALLOWANCE) / intervalEvidence.expected
                ) / 0.4) * (intervalEvidence.t2 - intervalEvidence.t1);
                const inferredStart = priorInterval.t2 - priorOccupancy;
                const inferredEnd = intervalEvidence.t1 + currentOccupancy;

                if (conservativeRatio <= SHORT_PDM_MAX_COMBINED_RATIO
                    && conservativeDuration >= SHORT_PDM_MIN_DURATION
                    && inferredEnd > inferredStart
                    && !positiveVelocityOverlaps(i, inferredStart, inferredEnd, learnedSkillLevelById, scalingStats)) {
                    addShortPaceDownEvent(i, inferredStart, inferredEnd);
                }
            }

            history.push(intervalEvidence);
            if (history.length > 3) history.shift();
            hpIntervalHistory[i] = history;

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
                } else {
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
            const hpConsumptionIndicatesPaceDown = hpConsumptionRatio < (
                isDownhillMode ? DOWNHILL_HP_RATIO_PACE_DOWN : DOWNHILL_HP_RATIO_THRESHOLD
            );

            if (isEarlyRacePaceDown) {
                if (currentSpeed < theoreticalPaceDown * EARLY_PACE_DOWN_SPEED_RATIO
                    && activeSpeedBuff <= 0) {
                    isTriggeredLow = true;
                }
            } else if (activeSpeedBuff <= 0) {


                let speedIndicatesPaceDown = false;
                let hpIndicatesPaceDown = false;


                if (!isDownhillMode
                    && hpConsumptionIndicatesPaceDown
                    && (currentSpeed < res.min * PACE_DOWN_SPEED_THRESHOLD || (currentSpeed < res.min && accel < PACE_DOWN_DECEL_THRESHOLD))
                    && accel < PACE_DOWN_ACCEL_CEILING) {
                    speedIndicatesPaceDown = true;
                }


                if (!isFrontRunner && currentSpeed < theoreticalPaceDown * PACE_DOWN_SPEED_SOFT_RATIO && accel < PACE_DOWN_ACCEL_LIMIT) {
                    hpIndicatesPaceDown = hpConsumptionIndicatesPaceDown;
                }


                if (speedIndicatesPaceDown || hpIndicatesPaceDown) {
                    isTriggeredLow = true;
                }
            }

            // "Low" Mode Exit Safeguard
            // If accelerating significantly while not firmly in "Low" territory, kill it.
            // Also force exit if we are clearly above Pace Down territory (e.g. due to strong acceleration)
            if ((accel > PACE_DOWN_EXIT_ACCEL && currentSpeed > theoreticalPaceDown * PACE_DOWN_EXIT_SPEED_RATIO)
                || (!hpConsumptionIndicatesPaceDown && currentSpeed > theoreticalPaceDown * PACE_DOWN_SPEED_SOFT_RATIO)) {
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
                        // A velocity skill makes PDM impossible from its exact
                        // activation frame. Received frames are sparse, so clip
                        // the inferred event to that boundary instead of the
                        // following received frame.
                        const velocityStart = activeSpeedBuff > 0
                            ? firstPositiveVelocityStartBetween(
                                i, currentMode.lastTime, time, learnedSkillLevelById, scalingStats,
                            )
                            : undefined;
                        closeMode(i, velocityStart ?? time);
                    } else {
                        activeModes[i].lastTime = time;
                    }
                }
            } else {
                // Try to enter a mode
                if (isTriggeredHigh && (isFrontRunner || canPaceUp)) {
                    if (isFrontRunner) {
                        const isFirst = Math.abs(currentDistance - leaderDistance) < LEADER_PROXIMITY_EPSILON;
                        const type = isFirst ? "Speed Up" : "Overtake";
                        activeModes[i] = { type, startTime: time, lastTime: time };
                    } else {
                        activeModes[i] = { type: "Pace Up", startTime: time, lastTime: time };
                    }
                } else if (isTriggeredLow && !isFrontRunner && canPaceDown) {
                    activeModes[i] = { type: "Pace Down", startTime: time, lastTime: time };
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

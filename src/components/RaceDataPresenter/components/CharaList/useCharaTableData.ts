import { RaceSimulateData, RaceSimulateEventData_SimulateEventType } from "../../../../data/race_data_pb";
import { filterCharaSkills, getSkillEventTargetingState, isSkillEventTargetingFrame } from "../../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../../data/TrainedCharaData";
import GameDataLoader from "../../../../data/GameDataLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { useAvailableTracks } from "../../../RaceReplay/hooks/useAvailableTracks";
import { useGuessTrack } from "../../../RaceReplay/hooks/useGuessTrack";
import { getPassiveStatModifiers, getRushedChanceModifier, getSkillDurationSecs, getSkillBaseTime, getHpDrainRatio, countGreenSkills } from "../../../RaceReplay/utils/SkillDataUtils";
import { getSelfHpDrainEstimate } from "../../../RaceReplay/utils/selfHpDrainUtils";
import type { SkillScalingStats } from "../../../RaceReplay/utils/SkillDataUtils";
import { TEMPTATION_TEXT } from "../../../RaceReplay/RaceReplay.constants";
import {
    adjustStat,
    calculateTargetSpeed,
    calculateLastSpurtTargetSpeedWithTruncatedLateRaceBase,
    getDistanceCategory,
    calculateReferenceHpConsumption,
    computeGroundPowerBonus,
} from "../../../RaceReplay/utils/speedCalculations";
import type { MaxAdjustedSpeedDebug } from "../../../RaceReplay/utils/analysisUtils";
import {
    CAREER_RACE_STAT_BONUS, DOWNHILL_HP_RATIO_THRESHOLD,
    BASE_SPEED_CONSTANT, BASE_SPEED_COURSE_OFFSET, BASE_SPEED_COURSE_SCALE,
    HP_CONSUMPTION_SCALE, HP_CONSUMPTION_SPEED_OFFSET, HP_CONSUMPTION_DIVISOR,
} from "../../../RaceReplay/utils/raceConstants";

const LATE_START_ACCEL_THRESHOLD = 0.0001; // Acceleration (m/s²) below which a horse is considered a late starter
import { computeHeuristicEvents } from "../../../RaceReplay/utils/computeHeuristicEvents";
import { calculateRaceDistance } from "../../utils/RacePresenterUtils";
import { CharaTableData, SkillEventData } from "./types";
import { RaceSimulateFrameData } from "../../../../data/race_data_pb";
import { computeRaceSkillLottery } from "../../utils/witLottery";

function interpolateDistance(frames: RaceSimulateFrameData[], horseIndex: number, time: number): number {
    if (!frames || frames.length === 0) return 0;

    let firstTime = frames[0].time ?? 0;
    if (time <= firstTime) return frames[0].horseFrame?.[horseIndex]?.distance ?? 0;
    let lastTime = frames[frames.length - 1].time ?? 0;
    if (time >= lastTime) return frames[frames.length - 1].horseFrame?.[horseIndex]?.distance ?? 0;

    let left = 0;
    let right = frames.length - 1;
    while (left <= right) {
        let mid = Math.floor((left + right) / 2);
        if ((frames[mid].time ?? 0) < time) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    const f1 = frames[right];
    const f2 = frames[left];
    if (!f1 || !f2) return 0;
    const t1 = f1.time ?? 0;
    const t2 = f2.time ?? 0;
    const d1 = f1.horseFrame?.[horseIndex]?.distance ?? 0;
    const d2 = f2.horseFrame?.[horseIndex]?.distance ?? 0;
    if (t2 === t1) return d1;
    return d1 + (d2 - d1) * ((time - t1) / (t2 - t1));
}

import { calculateMaxAdjustedSpeed, calculateHpOutcome } from "../../../RaceReplay/utils/analysisUtils";

// GroundModifier for HP drain: 1.02 for 重/不良 on turf, 1.01 for 重 on dirt, 1.02 for 不良 on dirt
function computeGroundModifier(surface: number, condition: number): number {
    if (surface === 1) { // Turf
        if (condition === 3 || condition === 4) return 1.02;
    } else if (surface === 2) { // Dirt
        if (condition === 3) return 1.01;
        if (condition === 4) return 1.02;
    }
    return 1.0;
}

export const computeCharaTableData = (
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    effectiveCourseId: number | undefined,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined,
    raceType?: string,
    groundCondition?: number,
    randomSeed?: number
): CharaTableData[] => {
    const raceDistance = calculateRaceDistance(raceData);

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return [];
    }

    const distanceCategory = getDistanceCategory(raceDistance);
    const trackSlopes = effectiveCourseId ? (GameDataLoader.courseData as any)[effectiveCourseId]?.slopes ?? [] : [];
    const surface: number = effectiveCourseId ? (GameDataLoader.courseData as any)[effectiveCourseId]?.surface ?? 0 : 0;
    const groundModifier = computeGroundModifier(surface, groundCondition ?? 0);
    const groundSpeedBonus = (groundCondition ?? 0) === 4 ? -50 : 0;
    const groundPowerBonus = computeGroundPowerBonus(surface, groundCondition ?? 0);
    const skillLottery = computeRaceSkillLottery(raceHorseInfo, raceData, randomSeed, raceType);

    // Prepare data for heuristic events calculation
    const trainedCharaByIdx: Record<number, TrainedCharaData> = {};
    const oonigeByIdx: Record<number, boolean> = {};
    const horseInfoByIdx: Record<number, any> = {};
    const passiveStatModifiers: Record<number, any> = {};
    const lastSpurtStartDistances: Record<number, number> = {};
    const unityTeamStatsByIdx: Record<number, SkillScalingStats["unityTeamStats"]> = {};

    raceHorseInfo.forEach(data => {
        const frameOrder = data['frame_order'] - 1;
        const trainedChara = fromRaceHorseData(data);
        trainedCharaByIdx[frameOrder] = trainedChara;
        horseInfoByIdx[frameOrder] = data;

        const skillEvents = filterCharaSkills(raceData, frameOrder);
        const activatedSkillGroups = new Map(skillEvents.map(e => [e.param[1], e.param?.[3]]));
        const activatedSkillIds = new Set(activatedSkillGroups.keys());
        oonigeByIdx[frameOrder] = activatedSkillIds.has(202051);

        const passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
        activatedSkillGroups.forEach((conditionGroupIndex, id) => {
            const mods = getPassiveStatModifiers(id, conditionGroupIndex);
            passiveStats.speed += mods.speed || 0;
            passiveStats.stamina += mods.stamina || 0;
            passiveStats.power += mods.power || 0;
            passiveStats.guts += mods.guts || 0;
            passiveStats.wisdom += mods.wisdom || 0;
        });

        if (raceType === 'Single') {
            const flatBonus = CAREER_RACE_STAT_BONUS;
            passiveStats.speed += flatBonus;
            passiveStats.stamina += flatBonus;
            passiveStats.power += flatBonus;
            passiveStats.guts += flatBonus;
            passiveStats.wisdom += flatBonus;
        }

        passiveStatModifiers[frameOrder] = passiveStats;

        const horseResult = raceData.horseResult[frameOrder];
        lastSpurtStartDistances[frameOrder] = horseResult?.lastSpurtStartDistance ?? -1;
    });

    const unityTeamTotals = new Map<number, NonNullable<SkillScalingStats["unityTeamStats"]>>();
    raceHorseInfo.forEach(data => {
        const teamId = Number(data['team_id']);
        if (!Number.isInteger(teamId) || teamId <= 0 || unityTeamTotals.has(teamId)) return;
        const total = { speed: 0, stamina: 0, pow: 0, guts: 0, wiz: 0 };
        raceHorseInfo.forEach(member => {
            if (Number(member['team_id']) !== teamId) return;
            const trained = fromRaceHorseData(member);
            const mood = Number(member['motivation'] ?? 3);
            total.speed += adjustStat(trained.speed, mood);
            total.stamina += adjustStat(trained.stamina, mood);
            total.pow += adjustStat(trained.pow, mood);
            total.guts += adjustStat(trained.guts, mood);
            total.wiz += adjustStat(trained.wiz, mood);
        });
        unityTeamTotals.set(teamId, total);
    });
    raceHorseInfo.forEach(data => {
        const frameOrder = data['frame_order'] - 1;
        const teamId = Number(data['team_id']);
        if (unityTeamTotals.has(teamId)) unityTeamStatsByIdx[frameOrder] = unityTeamTotals.get(teamId);
    });

    const heuristicEvents = computeHeuristicEvents({
        frames: raceData.frame ?? [],
        goalInX: raceDistance,
        trainedCharaByIdx,
        oonigeByIdx,
        horseInfoByIdx,
        trackSlopes,
        passiveStatModifiers,
        unityTeamStatsByIdx,
        skillActivations: skillActivations ?? {},
        otherEvents: otherEvents ?? {},
        lastSpurtStartDistances,
        detectedCourseId: effectiveCourseId,
        raceData,
    });

    const tableData: CharaTableData[] = raceHorseInfo.map(data => {
        const frameOrder = data['frame_order'] - 1;

        const horseResult = raceData.horseResult[frameOrder];

        const trainedCharaData = fromRaceHorseData(data);
        const teamId = typeof data['team_id'] === 'number' ? data['team_id'] : undefined;
        const subLabel = trainedCharaData.viewerName
            ? `[${trainedCharaData.viewerName}]`
            : teamId !== undefined
                ? `[Team ${teamId}]`
                : undefined;


        // Calculate Last Spurt Speed
        const skillEvents = filterCharaSkills(raceData, frameOrder);
        const activatedSkillGroups = new Map(skillEvents.map(e => [e.param[1], e.param?.[3]]));
        const activatedSkillIds = new Set(activatedSkillGroups.keys());
        const activatedSkillCounts = new Map<number, number>();
        skillEvents.forEach(e => {
            const skillId = e.param[1];
            activatedSkillCounts.set(skillId, (activatedSkillCounts.get(skillId) || 0) + 1);
        });
        const passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
        activatedSkillGroups.forEach((conditionGroupIndex, id) => {
            const mods = getPassiveStatModifiers(id, conditionGroupIndex);
            passiveStats.speed += mods.speed || 0;
            passiveStats.stamina += mods.stamina || 0;
            passiveStats.power += mods.power || 0;
            passiveStats.guts += mods.guts || 0;
            passiveStats.wisdom += mods.wisdom || 0;
        });

        if (raceType === 'Single') {
            const flatBonus = CAREER_RACE_STAT_BONUS;
            passiveStats.speed += flatBonus;
            passiveStats.stamina += flatBonus;
            passiveStats.power += flatBonus;
            passiveStats.guts += flatBonus;
            passiveStats.wisdom += flatBonus;
        }

        // Determine strategy
        const runningStyleStr = data.running_style ?? 0;
        const strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedCharaData.rawData?.param?.runningStyle ?? 1);

        // Oonige
        let isOonige = false;
        if (activatedSkillIds.has(202051)) isOonige = true;

        // Check for Late Start (0 acceleration at frame 0)
        let isLateStart = false;
        if (raceData.frame && raceData.frame.length > 1) {
            const f0 = raceData.frame[0];
            const f1 = raceData.frame[1];
            const h0 = f0.horseFrame?.[frameOrder];
            const h1 = f1.horseFrame?.[frameOrder];

            if (h0 && h1) {
                const v0 = (h0.speed ?? 0) / 100;
                const v1 = (h1.speed ?? 0) / 100;
                const dt = (f1.time ?? 0) - (f0.time ?? 0);

                if (dt > 0) {
                    const accel = (v1 - v0) / dt;
                    if (accel < LATE_START_ACCEL_THRESHOLD) {
                        isLateStart = true;
                    }
                }
            }
        }

        const distProficiency = trainedCharaData.properDistances[distanceCategory] ?? 1;
        const strategyProficiency = trainedCharaData.properRunningStyles[isOonige ? 1 : strategy] ?? 7;

        const lsRes = calculateTargetSpeed({
            courseDistance: raceDistance,
            currentDistance: raceDistance, // Force late game check
            speedStat: trainedCharaData.speed,
            wisdomStat: trainedCharaData.wiz,
            powerStat: trainedCharaData.pow,
            gutsStat: trainedCharaData.guts,
            staminaStat: trainedCharaData.stamina,
            strategy,
            distanceProficiency: distProficiency,
            strategyProficiency,
            mood: data['motivation'],
            isOonige,
            inLastSpurt: true, // Force last spurt
            slope: 0,
            greenSkillBonuses: { ...passiveStats, speed: passiveStats.speed + groundSpeedBonus, power: passiveStats.power + groundPowerBonus },
            activeSpeedBuff: 0,
            courseId: effectiveCourseId
        });

        const lastSpurtTargetSpeed = lsRes.base;
        const lastSpurtTargetSpeedTruncatedLateRaceBase = calculateLastSpurtTargetSpeedWithTruncatedLateRaceBase({
            courseDistance: raceDistance,
            currentDistance: raceDistance, // Keep the same last-spurt forcing inputs as the primary calculation
            speedStat: trainedCharaData.speed,
            wisdomStat: trainedCharaData.wiz,
            powerStat: trainedCharaData.pow,
            gutsStat: trainedCharaData.guts,
            staminaStat: trainedCharaData.stamina,
            strategy,
            distanceProficiency: distProficiency,
            mood: data['motivation'],
            isOonige,
            inLastSpurt: true,
            slope: 0,
            greenSkillBonuses: { ...passiveStats, speed: passiveStats.speed + groundSpeedBonus, power: passiveStats.power + groundPowerBonus },
            activeSpeedBuff: 0,
            courseId: effectiveCourseId
        });

        let maxAdjSpeed = 0;
        let maxAdjSpeedTime = 0;
        let maxAdjSpeedDebug: MaxAdjustedSpeedDebug | undefined;
        let adjustedGuts = 0;
        let hpAtPhase3Start: number | undefined = undefined;
        let requiredSpurtHp: number | undefined = undefined;
        if (raceData.frame) {
            adjustedGuts = adjustStat(trainedCharaData.guts, data['motivation'], passiveStats.guts);
            const adjustedPower = adjustStat(trainedCharaData.pow, data['motivation'], passiveStats.power + groundPowerBonus);
            const phase3StartDist = raceDistance * 2 / 3;
            for (const frame of raceData.frame) {
                const h = frame.horseFrame?.[frameOrder];
                if (h && (h.distance ?? 0) >= phase3StartDist) {
                    hpAtPhase3Start = h.hp ?? undefined;
                    break;
                }
            }
            if (lastSpurtTargetSpeed > 0 && adjustedGuts > 0) {
                const baseSpeed = BASE_SPEED_CONSTANT - (raceDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;
                const gutsModifier = 1.0 + 200 / Math.sqrt(600 * adjustedGuts);
                const baseHpDrain = HP_CONSUMPTION_SCALE * Math.pow(lastSpurtTargetSpeed - baseSpeed + HP_CONSUMPTION_SPEED_OFFSET, 2) / HP_CONSUMPTION_DIVISOR;
                const totalHpDrain = baseHpDrain * groundModifier * gutsModifier;
                requiredSpurtHp = ((raceDistance / 3 - 62) / lastSpurtTargetSpeed) * totalHpDrain;
            }
            const learnedSkillLevelById = new Map(trainedCharaData.skills.map(skill => [skill.skillId, skill.level]));
            const leveledSkillActivations = skillActivations
                ? {
                    ...skillActivations,
                    [frameOrder]: (skillActivations[frameOrder] ?? []).map(act => ({
                        ...act,
                        skillLevel: learnedSkillLevelById.get(act.param[1]),
                    })),
                }
                : skillActivations;
            const targetedSkillActivations = raceData.event.flatMap(wrapper => {
                const event = wrapper.event;
                if (!event || event.type !== RaceSimulateEventData_SimulateEventType.SKILL) return [];
                const targetingState = getSkillEventTargetingState(raceData, event, frameOrder, raceHorseInfo);
                if (targetingState === "miss") return [];
                return [{
                    time: event.frameTime!,
                    name: UMDatabaseWrapper.skillNameWithEnglishFallback(event.param[1]),
                    param: event.param,
                    ambiguousTarget: targetingState === "ambiguous-hit" || targetingState === "ambiguous-miss",
                    nominallyTargeted: targetingState === "hit" || targetingState === "ambiguous-hit",
                }];
            });

            const maxAdj = calculateMaxAdjustedSpeed(
                raceData.frame,
                frameOrder,
                raceDistance,
                leveledSkillActivations,
                targetedSkillActivations,
                otherEvents,
                trackSlopes,
                adjustedGuts,
                adjustedPower,
                lastSpurtStartDistances[frameOrder] ?? -1,
                {
                    ...trainedCharaData,
                    greenSkillCount: countGreenSkills(skillActivations?.[frameOrder]),
                    unityTeamStats: unityTeamStatsByIdx[frameOrder],
                },
                lastSpurtTargetSpeed
            );
            maxAdjSpeed = maxAdj.speed;
            maxAdjSpeedTime = maxAdj.time;
            maxAdjSpeedDebug = maxAdj.debug;
        }

        // Calculate Skill Events
        const parsedSkillEvents: SkillEventData[] = [];
        if (skillActivations && skillActivations[frameOrder]) {
            skillActivations[frameOrder].forEach(act => {
                const skillId = act.param[1];
                const reportedDuration = act.param?.[2];
                let durationSecs = getSkillDurationSecs(skillId, raceDistance, act.time, reportedDuration, act.param?.[3]);
                const baseTime = getSkillBaseTime(skillId);
                const isInstant = baseTime <= 0 && (reportedDuration ?? 0) <= 0;

                const startDistance = interpolateDistance(raceData.frame ?? [], frameOrder, act.time);
                const endDistance = isInstant ? startDistance : interpolateDistance(raceData.frame ?? [], frameOrder, act.time + durationSecs);
                parsedSkillEvents.push({
                    skillId,
                    name: act.name,
                    time: act.time,
                    durationSecs: isInstant ? 0 : durationSecs,
                    startDistance,
                    endDistance,
                    isInstant
                });
            });
        }

        const positionHistory: { startDistance: number; endDistance: number; rank: number }[] = [];
        if (raceData.frame && raceData.frame.length > 0) {
            let currentRank = -1;
            let rankStartDistance = 0;

            for (let i = 0; i < raceData.frame.length; i++) {
                const frame = raceData.frame[i];
                if (!frame.horseFrame) continue;

                const myDist = frame.horseFrame[frameOrder]?.distance ?? 0;
                let rank = 1;
                for (let j = 0; j < frame.horseFrame.length; j++) {
                    if (j !== frameOrder) {
                        const otherDist = frame.horseFrame[j]?.distance ?? 0;
                        if (otherDist > myDist) {
                            rank++;
                        }
                    }
                }

                if (rank !== currentRank) {
                    if (currentRank !== -1 && myDist > rankStartDistance) {
                        positionHistory.push({ startDistance: rankStartDistance, endDistance: myDist, rank: currentRank });
                    }
                    currentRank = rank;
                    rankStartDistance = myDist;
                }

                if (i === raceData.frame.length - 1 && currentRank !== -1) {
                    positionHistory.push({ startDistance: rankStartDistance, endDistance: raceDistance, rank: currentRank });
                }
            }
        }

        // Calculate Dueling and Spot Struggle from otherEvents
        let duelingTime = 0;
        if (otherEvents && otherEvents[frameOrder]) {
            otherEvents[frameOrder].forEach(evt => {
                const name = evt.name || "";
                if (name.includes("Dueling") || name.includes("Competes (Speed)")) {
                    duelingTime += evt.duration;
                    const startDistance = interpolateDistance(raceData.frame ?? [], frameOrder, evt.time);
                    const endDistance = interpolateDistance(raceData.frame ?? [], frameOrder, evt.time + evt.duration);
                    parsedSkillEvents.push({
                        skillId: -1,
                        name: "Dueling",
                        time: evt.time,
                        durationSecs: evt.duration,
                        startDistance,
                        endDistance,
                        isInstant: false,
                        iconId: 20011,
                        isMode: false
                    });
                } else if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) {
                    const startDistance = interpolateDistance(raceData.frame ?? [], frameOrder, evt.time);
                    const endDistance = interpolateDistance(raceData.frame ?? [], frameOrder, evt.time + evt.duration);
                    parsedSkillEvents.push({
                        skillId: -1,
                        name: "Spot Struggle",
                        time: evt.time,
                        durationSecs: evt.duration,
                        startDistance,
                        endDistance,
                        isInstant: false,
                        iconId: 20011,
                        isMode: false
                    });
                }
            });
        }

        // Calculate Downhill Mode Time by iterating frames
        let downhillModeTime = 0;
        let downhillModeTimePreLate = 0;
        let downhillModeTimeLate = 0;
        const downhillSegments: { startDistance: number; endDistance: number }[] = [];
        if (raceData.frame && raceData.frame.length > 1) {
            let currentDownhillStart = -1;
            let currentDownhillEnd = -1;

            for (let fIdx = 0; fIdx < raceData.frame.length - 1; fIdx++) {
                const frame = raceData.frame[fIdx];
                const nextFrame = raceData.frame[fIdx + 1];
                const h = frame.horseFrame?.[frameOrder];
                const hNext = nextFrame.horseFrame?.[frameOrder];
                if (!h || !hNext) continue;

                const dist = h.distance ?? 0;
                const nextDist = hNext.distance ?? 0;
                const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
                const currentSlope = currentSlopeObj?.slope ?? 0;

                let isDownhillActive = false;
                if (currentSlope < 0) {
                    const speed = (h.speed ?? 0) / 100;
                    const time = frame.time ?? 0;
                    const dt = (nextFrame.time ?? 0) - time;
                    if (dt > 0 && speed > 0) {
                        const rate = ((h.hp ?? 0) - (hNext.hp ?? 0)) / dt;
                        const expected = calculateReferenceHpConsumption(speed, raceDistance);
                        if (expected > 0 && rate > 0 && rate < expected * DOWNHILL_HP_RATIO_THRESHOLD) {
                            downhillModeTime += dt;
                            const lateStartDist = raceDistance * 2 / 3;
                            if (nextDist <= lateStartDist) {
                                downhillModeTimePreLate += dt;
                            } else if (dist >= lateStartDist) {
                                downhillModeTimeLate += dt;
                            } else if (nextDist > dist) {
                                const preLateRatio = Math.max(0, Math.min(1, (lateStartDist - dist) / (nextDist - dist)));
                                downhillModeTimePreLate += dt * preLateRatio;
                                downhillModeTimeLate += dt * (1 - preLateRatio);
                            } else {
                                downhillModeTimeLate += dt;
                            }
                            isDownhillActive = true;
                        }
                    }
                }

                if (isDownhillActive) {
                    if (currentDownhillStart === -1) {
                        currentDownhillStart = dist;
                    }
                    currentDownhillEnd = nextDist;
                } else {
                    if (currentDownhillStart !== -1) {
                        downhillSegments.push({ startDistance: currentDownhillStart, endDistance: currentDownhillEnd });
                        currentDownhillStart = -1;
                    }
                }
            }
            if (currentDownhillStart !== -1) {
                downhillSegments.push({ startDistance: currentDownhillStart, endDistance: currentDownhillEnd });
            }
        }

        // Calculate Pace Up/Down Time from precomputed heuristic events
        let paceUpTime = 0;
        let paceDownTime = 0;
        const paceUpSegments: { startDistance: number; endDistance: number }[] = [];
        const paceDownSegments: { startDistance: number; endDistance: number }[] = [];
        if (heuristicEvents && heuristicEvents[frameOrder]) {
            heuristicEvents[frameOrder].forEach(evt => {
                const name = evt.name || "";
                if (name === "Pace Up" || name === "Speed Up" || name === "Overtake") {
                    paceUpTime += evt.duration;
                    paceUpSegments.push({
                        startDistance: interpolateDistance(raceData.frame ?? [], frameOrder, evt.time),
                        endDistance: interpolateDistance(raceData.frame ?? [], frameOrder, evt.time + evt.duration)
                    });
                } else if (name === "Pace Down") {
                    paceDownTime += evt.duration;
                    paceDownSegments.push({
                        startDistance: interpolateDistance(raceData.frame ?? [], frameOrder, evt.time),
                        endDistance: interpolateDistance(raceData.frame ?? [], frameOrder, evt.time + evt.duration)
                    });
                }
            });
        }

        if (downhillModeTime > 0) {
            parsedSkillEvents.push({
                skillId: -1,
                name: "Downhill Mode",
                time: Infinity,
                durationSecs: downhillModeTime * (15 / 16),
                startDistance: 0,
                endDistance: 0,
                isInstant: false,
                iconId: 20011,
                isMode: true,
                segments: downhillSegments
            });
        }
        if (paceUpTime > 0) {
            parsedSkillEvents.push({
                skillId: -1,
                name: "Pace Up Mode",
                time: Infinity,
                durationSecs: paceUpTime * (15 / 16),
                startDistance: 0,
                endDistance: 0,
                isInstant: false,
                iconId: 20011,
                isMode: true,
                segments: paceUpSegments
            });
        }
        if (paceDownTime > 0) {
            parsedSkillEvents.push({
                skillId: -1,
                name: "Pace Down Mode",
                time: Infinity,
                durationSecs: paceDownTime * (15 / 16),
                startDistance: 0,
                endDistance: 0,
                isInstant: false,
                iconId: 20014,
                isMode: true,
                segments: paceDownSegments
            });
        }

        // Match the Race Graph's received-frame boundaries for Rushed modes.
        const rushedEvents: { name: string; time: number; duration: number }[] = [];
        let activeRushedMode = 0;
        let activeRushedStartTime = 0;
        for (let frameIndex = 0; frameIndex < raceData.frame.length; frameIndex++) {
            const frame = raceData.frame[frameIndex];
            const previousTime = frameIndex === 0 ? 0 : (raceData.frame[frameIndex - 1].time ?? 0);
            const mode = frame.horseFrame?.[frameOrder]?.temptationMode ?? 0;
            if (mode === activeRushedMode) continue;
            if (activeRushedMode !== 0 && previousTime > activeRushedStartTime) {
                rushedEvents.push({
                    name: TEMPTATION_TEXT[activeRushedMode] ?? "Rushed",
                    time: activeRushedStartTime,
                    duration: previousTime - activeRushedStartTime,
                });
            }
            activeRushedStartTime = previousTime;
            activeRushedMode = mode;
        }
        const lastFrameTime = raceData.frame.at(-1)?.time ?? 0;
        if (activeRushedMode !== 0 && lastFrameTime > activeRushedStartTime) {
            rushedEvents.push({
                name: TEMPTATION_TEXT[activeRushedMode] ?? "Rushed",
                time: activeRushedStartTime,
                duration: lastFrameTime - activeRushedStartTime,
            });
        }
        (otherEvents?.[frameOrder] ?? []).forEach(event => {
            if (!event.name?.includes("Rushed") || event.duration <= 0) return;
            rushedEvents.push({ name: event.name, time: event.time, duration: event.duration });
        });
        const mergedRushedIntervals = rushedEvents
            .map(event => ({ start: event.time, end: event.time + event.duration }))
            .sort((a, b) => a.start - b.start)
            .reduce<{ start: number; end: number }[]>((merged, interval) => {
                const previous = merged.at(-1);
                if (previous && interval.start <= previous.end) {
                    previous.end = Math.max(previous.end, interval.end);
                } else {
                    merged.push({ ...interval });
                }
                return merged;
            }, []);
        const observedRushedDuration = mergedRushedIntervals.reduce(
            (total, interval) => total + interval.end - interval.start,
            0,
        );
        const frenziedActivationTime = rushedEvents
            .filter(event => event.name.includes("Frenzied"))
            .reduce((first, event) => Math.min(first, event.time), Infinity);
        const rushedStartTime = rushedEvents.reduce(
            (first, event) => Math.min(first, event.time),
            Infinity,
        );
        const rushedDuration = rushedEvents.length === 0
            ? 0
            : Number.isFinite(frenziedActivationTime)
                ? Math.max(0, frenziedActivationTime - rushedStartTime) + 5
                : ([3, 6, 9, 12] as const).reduce((nearest, duration) => (
                    Math.abs(duration - observedRushedDuration) < Math.abs(nearest - observedRushedDuration)
                        ? duration
                        : nearest
                ), 3);

        const totalSkillPoints = trainedCharaData.skills.reduce((sum, cs) => {
            const base = UMDatabaseWrapper.skillNeedPoints[cs.skillId] ?? 0;
            let upgrade = 0;
            if (UMDatabaseWrapper.skills[cs.skillId]?.rarity === 2) {
                const lastDigit = cs.skillId % 10;
                const flippedId = lastDigit === 1 ? cs.skillId + 1 : cs.skillId - 1;
                upgrade = UMDatabaseWrapper.skillNeedPoints[flippedId] ?? 0;
            } else if (UMDatabaseWrapper.skills[cs.skillId]?.rarity === 1 && cs.skillId % 10 === 1) {
                const pairedId = cs.skillId + 1;
                if (UMDatabaseWrapper.skills[pairedId]?.rarity === 1) {
                    upgrade = UMDatabaseWrapper.skillNeedPoints[pairedId] ?? 0;
                }
            }
            return sum + base + upgrade;
        }, 0);

        const rushedLotteryResult = skillLottery?.rushedByFrameOrder.get(frameOrder + 1);
        const restraintModifier = activatedSkillIds.has(202161)
            ? getRushedChanceModifier(202161, activatedSkillGroups.get(202161))
            : 0;
        const rushedPreventedByRestraint = restraintModifier < 0
            && rushedLotteryResult !== undefined
            && !rushedLotteryResult.enabled
            && rushedLotteryResult.threshold - restraintModifier > rushedLotteryResult.enableRoll;

        return {
            trainedChara: trainedCharaData,
            chara: UMDatabaseWrapper.charas[trainedCharaData.charaId],
            displayName: UMDatabaseWrapper.raceHorseDisplayName(data),
            subLabel,

            frameOrder: frameOrder + 1,
            finishOrder: horseResult.finishOrder! + 1,

            horseResultData: horseResult,

            popularity: data['popularity'],
            popularityMarks: data['popularity_mark_rank_array'],
            motivation: data['motivation'],

            activatedSkills: activatedSkillIds,
            activatedSkillCounts: activatedSkillCounts,
            skillLotteryResults: skillLottery?.byFrameOrder.get(frameOrder + 1),
            skillEvents: parsedSkillEvents,
            positionHistory: positionHistory,

            raceDistance: raceDistance,

            deck: data.deck || [],
            parents: data.parents || [],

            totalSkillPoints,

            startDelay: horseResult.startDelayTime,
            isLateStart,
            lastSpurtTargetSpeed,
            lastSpurtTargetSpeedTruncatedLateRaceBase,
            maxAdjustedSpeed: maxAdjSpeed,
            maxAdjustedSpeedTime: maxAdjSpeedTime || undefined,
            maxAdjustedSpeedDebug: maxAdjSpeedDebug,
            hpAtPhase3Start,
            requiredSpurtHp,
            rushedDuration,
            rushedEvents,
            rushedPreventedByRestraint,
            duelingTime,
            downhillModeTime,
            downhillModeTimePreLate,
            downhillModeTimeLate,
            paceUpTime,
            paceDownTime,
            hpOutcome: calculateHpOutcome(
                raceData.frame || [],
                frameOrder,
                raceDistance,
                adjustedGuts,
                maxAdjSpeed,
                lastSpurtTargetSpeed
            ),
        };
    });

    // Calculate finish distance gap to previous finisher at the moment they finish.
    const sortedByFinish = [...tableData].sort((a, b) => a.finishOrder - b.finishOrder);
    for (let i = 1; i < sortedByFinish.length; i++) {
        const prev = sortedByFinish[i - 1];
        const curr = sortedByFinish[i];
        const prevTime = prev.horseResultData.finishTimeRaw ?? 0;
        const currDistanceAtPrevFinish = interpolateDistance(raceData.frame ?? [], curr.frameOrder - 1, prevTime);
        curr.finishDistanceToPrev = Math.max(0, raceDistance - currDistanceAtPrevFinish);
    }

    const rowByFrameOrder = new Map(tableData.map(row => [row.frameOrder - 1, row]));
    raceData.event.forEach(({ event }) => {
        if (!event || event.type !== RaceSimulateEventData_SimulateEventType.SKILL) return;

        const skillId = event.param[1];
        const casterFrameOrder = event.param[0];
        const caster = rowByFrameOrder.get(casterFrameOrder);
        if (!caster) return;

        const selfCost = getSelfHpDrainEstimate(raceData, event, raceHorseInfo);
        if (selfCost) {
            const selfCostDistance = interpolateDistance(
                raceData.frame ?? [],
                casterFrameOrder,
                event.frameTime ?? 0,
            );
            caster.hpDebuffHits ??= [];
            caster.hpDebuffHits.push({
                skillId,
                skillName: UMDatabaseWrapper.skillNameWithEnglishFallback(skillId),
                casterFrameOrder: caster.frameOrder,
                casterName: caster.displayName ?? caster.trainedChara.viewerName ?? `Character ${caster.frameOrder}`,
                time: event.frameTime ?? 0,
                drainRatio: selfCost.drainRatio,
                estimatedHpDrain: selfCost.estimatedHpDrain,
                isSelfCost: true,
                isLateRace: selfCostDistance >= raceDistance * 2 / 3,
            });
        }

        const drainRatio = getHpDrainRatio(skillId, event.param?.[3]);
        if (drainRatio <= 0) return;

        tableData.forEach(target => {
            const targetFrameOrder = target.frameOrder - 1;
            if (!isSkillEventTargetingFrame(raceData, event, targetFrameOrder, raceHorseInfo)) return;

            const maxHp = target.hpOutcome?.startHp
                ?? raceData.frame?.[0]?.horseFrame?.[targetFrameOrder]?.hp
                ?? 0;
            const estimatedHpDrain = Math.max(0, maxHp * drainRatio);
            const drainDistance = interpolateDistance(
                raceData.frame ?? [],
                targetFrameOrder,
                event.frameTime ?? 0,
            );
            const skillName = UMDatabaseWrapper.skillNameWithEnglishFallback(skillId);
            const casterBaseName = caster.displayName ?? caster.trainedChara.viewerName ?? `Character ${caster.frameOrder}`;
            const targetBaseName = target.displayName ?? target.trainedChara.viewerName ?? `Character ${target.frameOrder}`;
            const casterName = `${casterBaseName}${caster.subLabel ? ` ${caster.subLabel}` : ""}`;
            const targetName = `${targetBaseName}${target.subLabel ? ` ${target.subLabel}` : ""}`;

            target.hpDebuffHits ??= [];
            target.hpDebuffHits.push({
                skillId,
                skillName,
                casterFrameOrder: caster.frameOrder,
                casterName,
                time: event.frameTime ?? 0,
                drainRatio,
                estimatedHpDrain,
                isLateRace: drainDistance >= raceDistance * 2 / 3,
            });

            const hadNoSpareHpAtPhase3 = target.hpAtPhase3Start !== undefined
                && target.requiredSpurtHp !== undefined
                && target.hpAtPhase3Start <= target.requiredSpurtHp;
            const didNotFinishWithHp = target.hpOutcome?.type === "died"
                || (target.hpOutcome?.type === "survived" && target.hpOutcome.hp <= 0);
            if (!hadNoSpareHpAtPhase3 && !didNotFinishWithHp) return;

            caster.debuffSpurtImpacts ??= new Map();
            const impacts = caster.debuffSpurtImpacts.get(skillId) ?? [];
            impacts.push({
                targetFrameOrder: target.frameOrder,
                targetName,
                estimatedHpDrain,
            });
            caster.debuffSpurtImpacts.set(skillId, impacts);
        });
    });

    return tableData;
};

export const useCharaTableData = (
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    detectedCourseId: number | undefined,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined,
    raceType?: string,
    groundCondition?: number,
    randomSeed?: number
) => {
    const raceDistance = calculateRaceDistance(raceData);
    const availableTracks = useAvailableTracks(raceDistance);
    const { selectedTrackId } = useGuessTrack(detectedCourseId, raceDistance, availableTracks);
    const effectiveCourseId = selectedTrackId ? parseInt(selectedTrackId) : undefined;

    const tableData = computeCharaTableData(raceHorseInfo, raceData, effectiveCourseId, skillActivations, otherEvents, raceType, groundCondition, randomSeed);

    return { tableData, effectiveCourseId };
};

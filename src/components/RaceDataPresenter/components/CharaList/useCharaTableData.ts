import { RaceSimulateData } from "../../../../data/race_data_pb";
import { filterCharaSkills } from "../../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../../data/TrainedCharaData";
import GameDataLoader from "../../../../data/GameDataLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { useAvailableTracks } from "../../../RaceReplay/hooks/useAvailableTracks";
import { useGuessTrack } from "../../../RaceReplay/hooks/useGuessTrack";
import { getPassiveStatModifiers, getSkillDurationSecs, getSkillBaseTime } from "../../../RaceReplay/utils/SkillDataUtils";
import { adjustStat, calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption, computeGroundPowerBonus } from "../../../RaceReplay/utils/speedCalculations";
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
    groundCondition?: number
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

    // Prepare data for heuristic events calculation
    const trainedCharaByIdx: Record<number, TrainedCharaData> = {};
    const oonigeByIdx: Record<number, boolean> = {};
    const horseInfoByIdx: Record<number, any> = {};
    const passiveStatModifiers: Record<number, any> = {};
    const lastSpurtStartDistances: Record<number, number> = {};

    raceHorseInfo.forEach(data => {
        const frameOrder = data['frame_order'] - 1;
        const trainedChara = fromRaceHorseData(data);
        trainedCharaByIdx[frameOrder] = trainedChara;
        horseInfoByIdx[frameOrder] = data;

        const skillEvents = filterCharaSkills(raceData, frameOrder);
        const activatedSkillIds = new Set(skillEvents.map(e => e.param[1]));
        oonigeByIdx[frameOrder] = activatedSkillIds.has(202051);

        const passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
        activatedSkillIds.forEach(id => {
            const mods = getPassiveStatModifiers(id);
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

    const heuristicEvents = computeHeuristicEvents({
        frames: raceData.frame ?? [],
        goalInX: raceDistance,
        trainedCharaByIdx,
        oonigeByIdx,
        horseInfoByIdx,
        trackSlopes,
        passiveStatModifiers,
        skillActivations: skillActivations ?? {},
        otherEvents: otherEvents ?? {},
        lastSpurtStartDistances,
        detectedCourseId: effectiveCourseId
    });

    const tableData: CharaTableData[] = raceHorseInfo.map(data => {
        const frameOrder = data['frame_order'] - 1;

        const horseResult = raceData.horseResult[frameOrder];

        const trainedCharaData = fromRaceHorseData(data);


        // Calculate Last Spurt Speed
        const skillEvents = filterCharaSkills(raceData, frameOrder);
        const activatedSkillIds = new Set(skillEvents.map(e => e.param[1]));
        const activatedSkillCounts = new Map<number, number>();
        skillEvents.forEach(e => {
            const skillId = e.param[1];
            activatedSkillCounts.set(skillId, (activatedSkillCounts.get(skillId) || 0) + 1);
        });
        const passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
        activatedSkillIds.forEach(id => {
            const mods = getPassiveStatModifiers(id);
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
            mood: data['motivation'],
            isOonige,
            inLastSpurt: true, // Force last spurt
            slope: 0,
            greenSkillBonuses: { ...passiveStats, speed: passiveStats.speed + groundSpeedBonus, power: passiveStats.power + groundPowerBonus },
            activeSpeedBuff: 0,
            courseId: effectiveCourseId
        });

        const lastSpurtTargetSpeed = lsRes.base;


        let maxAdjSpeed = 0;
        let adjustedGuts = 0;
        if (raceData.frame) {
            adjustedGuts = adjustStat(trainedCharaData.guts, data['motivation'], passiveStats.guts);

            maxAdjSpeed = calculateMaxAdjustedSpeed(
                raceData.frame,
                frameOrder,
                raceDistance,
                skillActivations,
                otherEvents,
                trackSlopes,
                adjustedGuts,
                lastSpurtStartDistances[frameOrder] ?? -1
            );
        }

        // HP at phase 3 start (2/3 point) and required HP for full spurt
        let hpAtPhase3Start: number | undefined = undefined;
        let requiredSpurtHp: number | undefined = undefined;
        const phase3StartDist = raceDistance * 2 / 3;
        if (raceData.frame) {
            for (const frame of raceData.frame) {
                const h = frame.horseFrame?.[frameOrder];
                if (h && (h.distance ?? 0) >= phase3StartDist) {
                    hpAtPhase3Start = h.hp ?? undefined;
                    break;
                }
            }
        }
        if (lastSpurtTargetSpeed > 0 && adjustedGuts > 0) {
            const baseSpeed = BASE_SPEED_CONSTANT - (raceDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;
            const gutsModifier = 1.0 + 200 / Math.sqrt(600 * adjustedGuts);
            const baseHpDrain = HP_CONSUMPTION_SCALE * Math.pow(lastSpurtTargetSpeed - baseSpeed + HP_CONSUMPTION_SPEED_OFFSET, 2) / HP_CONSUMPTION_DIVISOR;
            const totalHpDrain = baseHpDrain * groundModifier * gutsModifier;
            requiredSpurtHp = ((raceDistance / 3 - 62) / lastSpurtTargetSpeed) * totalHpDrain;
        }

        // Calculate Skill Events
        const parsedSkillEvents: SkillEventData[] = [];
        if (skillActivations && skillActivations[frameOrder]) {
            skillActivations[frameOrder].forEach(act => {
                const skillId = act.param[1];
                let durationSecs = getSkillDurationSecs(skillId, raceDistance, act.param[2]);
                const baseTime = getSkillBaseTime(skillId);
                const isInstant = baseTime <= 0 && act.param[2] <= 0;

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

        return {
            trainedChara: trainedCharaData,
            chara: UMDatabaseWrapper.charas[trainedCharaData.charaId],

            frameOrder: frameOrder + 1,
            finishOrder: horseResult.finishOrder! + 1,

            horseResultData: horseResult,

            popularity: data['popularity'],
            popularityMarks: data['popularity_mark_rank_array'],
            motivation: data['motivation'],

            activatedSkills: activatedSkillIds,
            activatedSkillCounts: activatedSkillCounts,
            skillEvents: parsedSkillEvents,
            positionHistory: positionHistory,

            raceDistance: raceDistance,

            deck: data.deck || [],
            parents: data.parents || [],

            totalSkillPoints,

            startDelay: horseResult.startDelayTime,
            isLateStart,
            lastSpurtTargetSpeed,
            maxAdjustedSpeed: maxAdjSpeed,
            hpAtPhase3Start,
            requiredSpurtHp,
            duelingTime,
            downhillModeTime,
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

    // Calculate time diff to previous finisher
    const sortedByFinish = [...tableData].sort((a, b) => a.finishOrder - b.finishOrder);
    for (let i = 1; i < sortedByFinish.length; i++) {
        const prev = sortedByFinish[i - 1];
        const curr = sortedByFinish[i];
        const prevTime = prev.horseResultData.finishTimeRaw ?? 0;
        const currTime = curr.horseResultData.finishTimeRaw ?? 0;
        curr.timeDiffToPrev = currTime - prevTime;
    }

    return tableData;
};

export const useCharaTableData = (
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    detectedCourseId: number | undefined,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined,
    raceType?: string,
    groundCondition?: number
) => {
    const raceDistance = calculateRaceDistance(raceData);
    const availableTracks = useAvailableTracks(raceDistance);
    const { selectedTrackId } = useGuessTrack(detectedCourseId, raceDistance, availableTracks);
    const effectiveCourseId = selectedTrackId ? parseInt(selectedTrackId) : undefined;

    const tableData = computeCharaTableData(raceHorseInfo, raceData, effectiveCourseId, skillActivations, otherEvents, raceType, groundCondition);

    return { tableData, effectiveCourseId };
};

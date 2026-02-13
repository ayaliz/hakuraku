import { RaceSimulateData } from "../../../../data/race_data_pb";
import { filterCharaSkills } from "../../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../../data/TrainedCharaData";
import GameDataLoader from "../../../../data/GameDataLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { useAvailableTracks } from "../../../RaceReplay/hooks/useAvailableTracks";
import { useGuessTrack } from "../../../RaceReplay/hooks/useGuessTrack";
import { getPassiveStatModifiers } from "../../../RaceReplay/utils/SkillDataUtils";
import { adjustStat, calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption } from "../../../RaceReplay/utils/speedCalculations";
import { computeHeuristicEvents } from "../../../RaceReplay/utils/computeHeuristicEvents";
import { calculateRaceDistance } from "../../utils/RacePresenterUtils";
import { CharaTableData } from "./types";
import { calculateMaxAdjustedSpeed, calculateHpOutcome } from "../../../RaceReplay/utils/analysisUtils";

export const computeCharaTableData = (
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    effectiveCourseId: number | undefined,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined,
    raceType?: string
): CharaTableData[] => {
    const raceDistance = calculateRaceDistance(raceData);

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return [];
    }

    const distanceCategory = getDistanceCategory(raceDistance);
    const trackSlopes = effectiveCourseId ? (GameDataLoader.courseData as any)[effectiveCourseId]?.slopes ?? [] : [];

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
            const flatBonus = 400;
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
            const flatBonus = 400;
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
                    if (accel < 0.0001) {
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
            greenSkillBonuses: passiveStats,
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
                adjustedGuts
            );
        }

        // Calculate Dueling Time from otherEvents
        let duelingTime = 0;
        if (otherEvents && otherEvents[frameOrder]) {
            otherEvents[frameOrder].forEach(evt => {
                const name = evt.name || "";
                if (name.includes("Dueling") || name.includes("Competes (Speed)")) {
                    duelingTime += evt.duration;
                }
            });
        }

        // Calculate Downhill Mode Time by iterating frames
        let downhillModeTime = 0;
        if (raceData.frame && raceData.frame.length > 1) {
            for (let fIdx = 0; fIdx < raceData.frame.length - 1; fIdx++) {
                const frame = raceData.frame[fIdx];
                const nextFrame = raceData.frame[fIdx + 1];
                const h = frame.horseFrame?.[frameOrder];
                const hNext = nextFrame.horseFrame?.[frameOrder];
                if (!h || !hNext) continue;

                const dist = h.distance ?? 0;
                const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
                const currentSlope = currentSlopeObj?.slope ?? 0;

                if (currentSlope < 0) {
                    const speed = (h.speed ?? 0) / 100;
                    const time = frame.time ?? 0;
                    const dt = (nextFrame.time ?? 0) - time;
                    if (dt > 0 && speed > 0) {
                        const rate = ((h.hp ?? 0) - (hNext.hp ?? 0)) / dt;
                        const expected = calculateReferenceHpConsumption(speed, raceDistance);
                        if (expected > 0 && rate > 0 && rate < expected * 0.8) {
                            downhillModeTime += dt;
                        }
                    }
                }
            }
        }

        // Calculate Pace Up/Down Time from precomputed heuristic events
        let paceUpTime = 0;
        let paceDownTime = 0;
        if (heuristicEvents && heuristicEvents[frameOrder]) {
            heuristicEvents[frameOrder].forEach(evt => {
                const name = evt.name || "";
                if (name === "Pace Up" || name === "Speed Up" || name === "Overtake") {
                    paceUpTime += evt.duration;
                } else if (name === "Pace Down") {
                    paceDownTime += evt.duration;
                }
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

            raceDistance: raceDistance,

            deck: data.deck || [],
            parents: data.parents || [],

            totalSkillPoints,

            startDelay: horseResult.startDelayTime,
            isLateStart,
            lastSpurtTargetSpeed,
            maxAdjustedSpeed: maxAdjSpeed,
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
    raceType?: string
) => {
    const raceDistance = calculateRaceDistance(raceData);
    const availableTracks = useAvailableTracks(raceDistance);
    const { selectedTrackId } = useGuessTrack(detectedCourseId, raceDistance, availableTracks);
    const effectiveCourseId = selectedTrackId ? parseInt(selectedTrackId) : undefined;

    const tableData = computeCharaTableData(raceHorseInfo, raceData, effectiveCourseId, skillActivations, otherEvents, raceType);

    return { tableData, effectiveCourseId };
};

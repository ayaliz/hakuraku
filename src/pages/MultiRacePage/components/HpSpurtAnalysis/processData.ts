import { ParsedRace } from "../../types";
import { CharaHpSpurtStats } from "./types";
import { filterCharaSkills } from "../../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../../data/TrainedCharaData";
import courseData from "../../../../data/tracks/course_data.json";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { getActiveSpeedModifier, getPassiveStatModifiers, getSkillBaseTime, hasSkillEffect } from "../../../../components/RaceReplay/utils/SkillDataUtils";
import { adjustStat, calculateReferenceHpConsumption, calculateTargetSpeed, getDistanceCategory } from "../../../../components/RaceReplay/utils/speedCalculations";

import { computeOtherEvents, calculateMaxAdjustedSpeed, calculateHpOutcome } from "../../../../components/RaceReplay/utils/analysisUtils";
import { RaceSimulateData } from "../../../../data/race_data_pb";
import { getAvailableTracks, guessTrackId } from "../../../../components/RaceReplay/utils/guessTrackUtils";

export const computeHpSpurtStats = (
    races: ParsedRace[],
    targetCharaId?: number,
    onlyPlayer: boolean = false,
    statsFilter?: { speed: number, stamina: number, pow: number, guts: number, wiz: number }
): CharaHpSpurtStats[] => {
    const statsMap = new Map<number, CharaHpSpurtStats>();

    races.forEach(race => {
        const raceData = race.raceData;
        const raceDistance = race.raceDistance;

        // Use shared track guessing logic
        const availableTracks = getAvailableTracks(raceDistance);
        const guessedTrack = guessTrackId(race.detectedCourseId, raceDistance, availableTracks);
        const effectiveCourseId = guessedTrack.id ? parseInt(guessedTrack.id) : undefined;

        const trackSlopes = effectiveCourseId ? (courseData as any)[effectiveCourseId]?.slopes ?? [] : [];
        const distanceCategory = getDistanceCategory(raceDistance);

        // Pre-parse skills
        const skillActivations: Record<number, { time: number; name: string; param: number[] }[]> = {};
        race.horseInfo.forEach((data, index) => {
            const frameOrder = (data['frame_order'] ?? data.frameOrder ?? (index + 1)) - 1;
            const skills = filterCharaSkills(raceData, frameOrder).map(event => ({
                time: event.frameTime ?? 0,
                name: UMDatabaseWrapper.skillName(event.param[1]),
                param: event.param
            }));
            skillActivations[frameOrder] = skills;
        });

        // Compute "Other Events" (Dueling/Struggle) for 1:1 parity
        const otherEvents = computeOtherEvents(raceData, race.horseInfo, effectiveCourseId, skillActivations, raceDistance);

        race.horseInfo.forEach((data, index) => {
            const frameOrder = (data['frame_order'] ?? data.frameOrder ?? (index + 1)) - 1;
            const trainedCharaData = fromRaceHorseData(data);
            const charaId = trainedCharaData.charaId;

            // Filters
            if (targetCharaId && charaId !== targetCharaId) return;
            if (onlyPlayer) {
                const isPlayer = race.playerIndices?.has(frameOrder) ?? false;
                if (!isPlayer) return;
            }
            if (statsFilter) {
                if (trainedCharaData.speed !== statsFilter.speed ||
                    trainedCharaData.stamina !== statsFilter.stamina ||
                    trainedCharaData.pow !== statsFilter.pow ||
                    trainedCharaData.guts !== statsFilter.guts ||
                    trainedCharaData.wiz !== statsFilter.wiz) {
                    return;
                }
            }

            const chara = UMDatabaseWrapper.charas[charaId];
            const charaName = chara?.name ?? `Unknown (${charaId})`;

            // Initialize stats if needed
            if (!statsMap.has(charaId)) {
                statsMap.set(charaId, {
                    charaId,
                    cardId: trainedCharaData.cardId,
                    charaName,
                    totalRuns: 0,
                    fullSpurtCount: 0,
                    survivalCount: 0,
                    hpOutcomesFullSpurt: [],
                    hpOutcomesNonFullSpurt: []
                });
            }
            const currentStats = statsMap.get(charaId)!;
            currentStats.totalRuns++;

            const horseResult = raceData.horseResult[frameOrder];
            if (!horseResult) return;

            // Calculate Passive Stats and Guts unconditionally
            const skillEvents = filterCharaSkills(raceData, frameOrder);
            const activatedSkillIds = new Set(skillEvents.map(e => e.param[1]));

            const passiveStats = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
            activatedSkillIds.forEach(id => {
                const mods = getPassiveStatModifiers(id);
                passiveStats.speed += mods.speed || 0;
                passiveStats.stamina += mods.stamina || 0;
                passiveStats.power += mods.power || 0;
                passiveStats.guts += mods.guts || 0;
                passiveStats.wisdom += mods.wisdom || 0;
            });

            const adjustedGuts = adjustStat(trainedCharaData.guts, data['motivation'], passiveStats.guts);

            // Prepare vars for speed calc
            const runningStyleStr = data.running_style ?? 0;
            const strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedCharaData.rawData?.param?.runningStyle ?? 1);
            const isOonige = activatedSkillIds.has(202051);
            const distProficiency = trainedCharaData.properDistances[distanceCategory] ?? 1;

            // Calculate Target Speed for Last Spurt (Unconditionally)
            const lsRes = calculateTargetSpeed({
                courseDistance: raceDistance,
                currentDistance: raceDistance,
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
                greenSkillBonuses: passiveStats,
                activeSpeedBuff: 0,
                courseId: effectiveCourseId
            });
            const lastSpurtTargetSpeed = lsRes.base;

            // Calculate Max Adjusted Speed (Unconditionally)
            const maxAdjSpeed = calculateMaxAdjustedSpeed(
                raceData.frame ?? [],
                frameOrder,
                raceDistance,
                skillActivations,
                otherEvents,
                trackSlopes,
                adjustedGuts
            );

            // --- 2. Full Spurt Analysis ---
            const lastSpurtStartDist = horseResult.lastSpurtStartDistance;
            let didFullSpurt = false;

            if (lastSpurtStartDist && lastSpurtStartDist !== -1) {
                const phase3Start = raceDistance * 2 / 3;
                const spurtDelay = lastSpurtStartDist - phase3Start;

                if (spurtDelay < 3) {
                    const speedDiff = maxAdjSpeed - lastSpurtTargetSpeed;
                    const speedReached = speedDiff >= -0.05;

                    if (speedReached) {
                        didFullSpurt = true;
                    }
                }
            }

            if (didFullSpurt) {
                currentStats.fullSpurtCount++;
            }

            // --- 1. Survival Analysis (Logic moved after speed calc to reuse variables if needed, though HpOutcome is mostly independent except fallback) ---
            const hpOutcome = calculateHpOutcome(
                raceData.frame ?? [],
                frameOrder,
                raceDistance,
                adjustedGuts,
                maxAdjSpeed,
                lastSpurtTargetSpeed
            );

            if (hpOutcome) {
                if (hpOutcome.type === 'survived') {
                    currentStats.survivalCount++;
                }

                // Collect HP Outcome Value
                let outcomeValue = 0;
                if (hpOutcome.type === 'survived') {
                    outcomeValue = hpOutcome.hp;
                } else {
                    outcomeValue = -hpOutcome.deficit;
                }

                if (didFullSpurt) {
                    currentStats.hpOutcomesFullSpurt.push(outcomeValue);
                } else {
                    currentStats.hpOutcomesNonFullSpurt.push(outcomeValue);
                }
            }
        });
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalRuns - a.totalRuns);
};

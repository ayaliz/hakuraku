import { RaceSimulateData } from "../../../../data/race_data_pb";
import { filterCharaSkills } from "../../../../data/RaceDataUtils";
import { fromRaceHorseData } from "../../../../data/TrainedCharaData";
import courseData from "../../../../data/tracks/course_data.json";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { useAvailableTracks } from "../../../RaceReplay/hooks/useAvailableTracks";
import { useGuessTrack } from "../../../RaceReplay/hooks/useGuessTrack";
import { getActiveSpeedModifier, getPassiveStatModifiers, getSkillBaseTime, hasSkillEffect } from "../../../RaceReplay/utils/SkillDataUtils";
import { adjustStat, calculateReferenceHpConsumption, calculateTargetSpeed, getDistanceCategory } from "../../../RaceReplay/utils/speedCalculations";
import { calculateRaceDistance } from "../../utils/RacePresenterUtils";
import { CharaTableData } from "./types";

export const useCharaTableData = (
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    detectedCourseId: number | undefined,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined
) => {
    const raceDistance = calculateRaceDistance(raceData);
    const availableTracks = useAvailableTracks(raceDistance);
    const { selectedTrackId } = useGuessTrack(detectedCourseId, raceDistance, availableTracks);
    const effectiveCourseId = selectedTrackId ? parseInt(selectedTrackId) : undefined;

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return { tableData: [] as CharaTableData[], effectiveCourseId };
    }

    const distanceCategory = getDistanceCategory(raceDistance);
    const trackSlopes = effectiveCourseId ? (courseData as any)[effectiveCourseId]?.slopes ?? [] : [];

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

            let wasType28Active = false;

            raceData.frame.forEach((frame, fIdx) => {
                const h = frame.horseFrame?.[frameOrder];
                if (!h) return;
                if ((h.distance ?? 0) > raceDistance) return;
                const speed = (h.speed ?? 0) / 100;
                if (speed <= 0) return;
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

                if (shouldSkip) return;

                // Events
                if (otherEvents && otherEvents[frameOrder]) {
                    otherEvents[frameOrder].forEach(e => {
                        if (time >= e.time && time < e.time + e.duration) {
                            const name = e.name || "";
                            if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) {
                                buff += Math.pow(500 * adjustedGuts, 0.6) * 0.0001;
                            }
                            if (name.includes("Dueling") || name.includes("Competes (Speed)")) {
                                buff += Math.pow(200 * adjustedGuts, 0.708) * 0.0001;
                            }

                        }
                    });
                }

                // Downhill
                const dist = h.distance ?? 0;
                const currentSlopeObj = trackSlopes.find((s: any) => dist >= s.start && dist < s.start + s.length);
                const currentSlope = currentSlopeObj?.slope ?? 0;

                if (currentSlope < 0) {
                    // Check for Downhill Mode
                    const nextFrame = raceData.frame[fIdx + 1];
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

                let isDecelerating = false;

                // Check previous (Backward diff)
                const prevFrame = fIdx > 0 ? raceData.frame[fIdx - 1] : undefined;
                if (prevFrame) {
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

                // Check next (Forward diff) - Catches the moment a buff drops but speed hasn't
                const nextFrame = fIdx < raceData.frame.length - 1 ? raceData.frame[fIdx + 1] : undefined;
                if (!isDecelerating && nextFrame) {
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

                if (isDecelerating) return;

                const adj = speed - buff;
                if (adj > maxAdjSpeed) maxAdjSpeed = adj;
            });
        }

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

            startDelay: horseResult.startDelayTime,
            isLateStart,
            lastSpurtTargetSpeed,
            maxAdjustedSpeed: maxAdjSpeed,
            hpOutcome: (() => {
                const frames = raceData.frame ?? [];
                if (frames.length === 0) return undefined;

                const firstDeathFrame = frames.find(f => (f.horseFrame?.[frameOrder]?.hp ?? 1) === 0);

                if (firstDeathFrame) {
                    const dist = firstDeathFrame.horseFrame?.[frameOrder]?.distance ?? 0;
                    if (dist < raceDistance - 0.1) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const distance = raceDistance - dist;
                        const baseSpeed = 20.0 - (raceDistance - 2000) / 1000;
                        const statusModifier = 1.0 + 200.0 / Math.sqrt(600.0 * adjustedGuts);
                        const currentSpeed = maxAdjSpeed || lastSpurtTargetSpeed || 20;

                        // HPConsumptionPerSecond = 20.0 * (CurrentSpeed - BaseSpeed + 12.0)^2 / 144.0 * StatusModifier * GroundModifier
                        const hpPerSec = 20.0 * Math.pow(currentSpeed - baseSpeed + 12.0, 2) / 144.0 * statusModifier * 1.0;
                        const time = distance / currentSpeed;
                        const deficit = time * hpPerSec;

                        return { type: 'died' as const, distance, deficit };
                    }
                }

                const lastFrame = frames[frames.length - 1];
                const hp = lastFrame.horseFrame?.[frameOrder]?.hp ?? 0;
                return { type: 'survived' as const, hp };
            })(),
        };
    });

    return { tableData, effectiveCourseId };
};

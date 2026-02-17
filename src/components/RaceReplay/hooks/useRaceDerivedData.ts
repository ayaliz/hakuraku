import { useMemo } from "react";
import { fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import { getCharaActivatedSkillIds } from "../../../data/RaceDataUtils";
import { getPassiveStatModifiers } from "../utils/SkillDataUtils";
import { useHeuristicEvents } from "./useHeuristicEvents";
import GameDataLoader from "../../../data/GameDataLoader";

export function useRaceDerivedData(
    raceData: any,
    frames: any[],
    raceHorseInfo: any[],
    skillActivations: Record<number, any[]>,
    otherEvents: Record<number, any[]>,
    goalInX: number,
    selectedTrackId: string | null,
    toggles: { heuristics: boolean }
) {
    const horseInfoByIdx = useMemo(() => {
        const map: Record<number, any> = {};
        (raceHorseInfo ?? []).forEach((h: any) => {
            const idx = (h.frame_order ?? h.frameOrder) - 1;
            if (idx >= 0) map[idx] = h;
        });
        return map;
    }, [raceHorseInfo]);

    const maxHpByIdx = useMemo(() => {
        const map: Record<number, number> = {};
        (frames[0]?.horseFrame ?? []).forEach((h: any, i: number) => {
            map[i] = h?.hp ?? 0;
        });
        return map;
    }, [frames]);

    const hpZeroEvents = useMemo(() => {
        const events: Record<number, { time: number; duration: number; name: string }[]> = {};
        if (!frames || frames.length < 2) return events;

        const numHorses = frames[0]?.horseFrame?.length ?? 0;
        for (let h = 0; h < numHorses; h++) {
            const horseEvents: { time: number; duration: number; name: string }[] = [];
            let currentStart = -1;
            let currentEnd = -1;

            for (let i = 0; i < frames.length - 1; i++) {
                const nextFrameHorse = frames[i + 1]?.horseFrame?.[h];
                if (nextFrameHorse && nextFrameHorse.hp === 0) {
                    const t = frames[i].time ?? 0;
                    const nextT = frames[i + 1].time ?? 0;

                    if (currentStart === -1) {
                        currentStart = t;
                        currentEnd = nextT;
                    } else if (Math.abs(t - currentEnd) < 0.001) {
                        currentEnd = nextT;
                    } else {
                        horseEvents.push({ time: currentStart, duration: currentEnd - currentStart, name: "Out of HP" });
                        currentStart = t;
                        currentEnd = nextT;
                    }
                } else {
                    if (currentStart !== -1) {
                        horseEvents.push({ time: currentStart, duration: currentEnd - currentStart, name: "Out of HP" });
                        currentStart = -1;
                        currentEnd = -1;
                    }
                }
            }
            if (currentStart !== -1) {
                horseEvents.push({ time: currentStart, duration: currentEnd - currentStart, name: "Out of HP" });
            }

            if (horseEvents.length > 0) {
                events[h] = horseEvents;
            }
        }
        return events;
    }, [frames]);

    const spurtDelayEvents = useMemo(() => {
        const events: Record<number, { time: number; duration: number; name: string }[]> = {};
        if (!frames || frames.length < 2 || !goalInX) return events;

        const phase3Start = (goalInX * 2) / 3;
        const numHorses = frames[0]?.horseFrame?.length ?? 0;

        for (let h = 0; h < numHorses; h++) {
            const result = raceData.horseResult?.[h];
            if (!result) continue;

            const dist = result.lastSpurtStartDistance;
            if (dist == null) continue;

            let eventName: string | null = null;
            if (dist === -1) {
                eventName = "No spurt";
            } else {
                const delay = dist - phase3Start;
                if (delay > 4) {
                    eventName = `${delay.toFixed(2)}m spurt delay`;
                }
            }

            if (eventName) {
                let foundTime = -1;
                for (let i = 0; i < frames.length; i++) {
                    const d = frames[i]?.horseFrame?.[h]?.distance ?? 0;
                    if (d >= phase3Start) {
                        foundTime = frames[i].time ?? 0;
                        break;
                    }
                }

                if (foundTime !== -1) {
                    events[h] = [{ time: foundTime, duration: 2, name: eventName }];
                }
            }
        }
        return events;
    }, [frames, raceData.horseResult, goalInX]);

    const trainedCharaByIdx = useMemo(() => {
        const map: Record<number, TrainedCharaData> = {};
        (raceHorseInfo ?? []).forEach((h: any) => {
            const idx = (h.frame_order ?? h.frameOrder) - 1;
            if (idx >= 0) map[idx] = fromRaceHorseData(h);
        });
        return map;
    }, [raceHorseInfo]);

    const oonigeByIdx = useMemo(() => {
        const map: Record<number, boolean> = {};
        Object.entries(skillActivations).forEach(([iStr, list]) => {
            if (list.some(s => s.param && s.param[1] === 202051)) {
                map[+iStr] = true;
            }
        });
        return map;
    }, [skillActivations]);

    const lastSpurtStartDistances = useMemo(() => {
        const map: Record<number, number> = {};
        (raceData.horseResult ?? []).forEach((hr: any, i: number) => {
            if (hr.lastSpurtStartDistance && hr.lastSpurtStartDistance > 0) map[i] = hr.lastSpurtStartDistance;
        });
        return map;
    }, [raceData.horseResult]);

    const trackSlopes = useMemo(() => {
        const td = selectedTrackId ? (GameDataLoader.courseData as Record<string, any>)[selectedTrackId] : null;
        return td?.slopes ?? [];
    }, [selectedTrackId]);

    const passiveStatModifiers = useMemo(() => {
        const map: Record<number, { speed: number, stamina: number, power: number, guts: number, wisdom: number }> = {};
        if (!raceData) return map;
        (raceHorseInfo || []).forEach((h: any) => {
            const idx = (h.frame_order ?? h.frameOrder) - 1;
            if (idx < 0) return;
            const skillIds = getCharaActivatedSkillIds(raceData, idx);
            const totalMods = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
            skillIds.forEach(id => {
                const mods = getPassiveStatModifiers(id);
                totalMods.speed += mods.speed || 0;
                totalMods.stamina += mods.stamina || 0;
                totalMods.power += mods.power || 0;
                totalMods.guts += mods.guts || 0;
                totalMods.wisdom += mods.wisdom || 0;
            });
            map[idx] = totalMods;
        });
        return map;
    }, [raceData, raceHorseInfo]);

    const heuristicEvents = useHeuristicEvents(
        frames,
        goalInX,
        trainedCharaByIdx,
        oonigeByIdx,
        horseInfoByIdx,
        trackSlopes,
        passiveStatModifiers,
        skillActivations,
        otherEvents,
        {},
        lastSpurtStartDistances,
        selectedTrackId ? +selectedTrackId : undefined
    );

    const combinedOtherEvents = useMemo(() => {
        const combined = { ...otherEvents };
        const merge = (source: Record<number, any[]>) => {
            Object.entries(source).forEach(([hStr, evts]) => {
                const h = +hStr;
                combined[h] = [...(combined[h] ?? []), ...evts];
            });
        };
        merge(hpZeroEvents);
        merge(spurtDelayEvents);
        if (toggles.heuristics) merge(heuristicEvents);
        return combined;
    }, [otherEvents, hpZeroEvents, spurtDelayEvents, heuristicEvents, toggles.heuristics]);

    return {
        horseInfoByIdx,
        maxHpByIdx,
        trainedCharaByIdx,
        oonigeByIdx,
        lastSpurtStartDistances,
        trackSlopes,
        passiveStatModifiers,
        combinedOtherEvents
    };
}

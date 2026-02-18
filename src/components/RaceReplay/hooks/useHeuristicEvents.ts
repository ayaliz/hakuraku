import { useMemo } from "react";
import { TrainedCharaData } from "../../../data/TrainedCharaData";
import { computeHeuristicEvents, HeuristicEvent } from "../utils/computeHeuristicEvents";

export function useHeuristicEvents(
    frames: any[],
    goalInX: number,
    trainedCharaByIdx: Record<number, TrainedCharaData>,
    oonigeByIdx: Record<number, boolean>,
    horseInfoByIdx: Record<number, any>,
    trackSlopes: any[],
    passiveStatModifiers: Record<number, any>,
    skillActivations: Record<number, any[]>,
    otherEvents: Record<number, any[]>,
    _consumptionRateByIdx: Record<number, number>,
    lastSpurtStartDistances: Record<number, number>,
    detectedCourseId?: number
): Record<number, HeuristicEvent[]> {
    return useMemo(() => {
        return computeHeuristicEvents({
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
        });
    }, [frames, goalInX, trainedCharaByIdx, oonigeByIdx, horseInfoByIdx, trackSlopes, passiveStatModifiers, skillActivations, otherEvents, lastSpurtStartDistances, detectedCourseId]);
}


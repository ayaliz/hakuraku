import _ from "lodash";
import React from "react";
import { RaceSimulateData } from "../../../../data/race_data_pb";
import { useWorldTransformEstimate } from "../../../RaceReplay/hooks/useWorldTransformEstimate";
import { bisectFrameIndex, clamp01 } from "../../../RaceReplay/RaceReplay.utils";
import CharaTable from "./CharaCard";
import { useCharaTableData } from "./useCharaTableData";
import { useRacePredictions } from "./useRacePredictions";
import "./CharaList.css";

type CharaListProps = {
    raceHorseInfo: any[];
    raceData: RaceSimulateData;
    detectedCourseId?: number;
    laneDistanceMax?: number;
    skillActivations?: Record<number, { time: number; name: string; param: number[] }[]>;
    otherEvents?: Record<number, { time: number; duration: number; name: string }[]>;
    raceType?: string;
    groundCondition?: number;
};

function getWorldTransformLossAtTime(
    raceData: RaceSimulateData,
    horseIndex: number,
    finishTime: number | undefined,
    cumulativeLossByFrame: number[][],
) {
    const frames = raceData.frame ?? [];
    if (!frames.length || finishTime === undefined) {
        return undefined;
    }

    const frameIndex = bisectFrameIndex(frames, finishTime);
    const nextIndex = Math.min(frameIndex + 1, frames.length - 1);
    const lowerFrame = frames[frameIndex];
    const upperFrame = frames[nextIndex] ?? lowerFrame;
    const lowerTime = lowerFrame?.time ?? 0;
    const upperTime = upperFrame?.time ?? lowerTime;
    const alpha = frameIndex < frames.length - 1
        ? clamp01((finishTime - lowerTime) / Math.max(1e-9, upperTime - lowerTime))
        : 0;
    const loss0 = cumulativeLossByFrame[frameIndex]?.[horseIndex] ?? 0;
    const loss1 = cumulativeLossByFrame[nextIndex]?.[horseIndex] ?? loss0;
    return loss0 + (loss1 - loss0) * alpha;
}

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData, detectedCourseId, laneDistanceMax, skillActivations, otherEvents, raceType, groundCondition }) => {
    const { tableData, effectiveCourseId } = useCharaTableData(raceHorseInfo, raceData, detectedCourseId, skillActivations, otherEvents, raceType, groundCondition);
    const predictionState = useRacePredictions(raceHorseInfo, effectiveCourseId);
    const worldTransformEstimate = useWorldTransformEstimate(
        raceData.frame ?? [],
        effectiveCourseId !== undefined ? String(effectiveCourseId) : null,
        laneDistanceMax,
    );

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const mergedData = tableData.map((row) => {
        const prediction = predictionState.predictionMap.get(row.frameOrder);
        return {
            ...row,
            predictedWinProbability: prediction?.probability,
            predictionRank: prediction?.rank,
            worldTransformLossTotal: worldTransformEstimate
                ? getWorldTransformLossAtTime(
                    raceData,
                    row.frameOrder - 1,
                    row.horseResultData.finishTimeRaw,
                    worldTransformEstimate.cumulativeLossByFrame,
                )
                : undefined,
        };
    });

    const sortedData = _.sortBy(mergedData, d => d.finishOrder);
    const showPredictionColumn = mergedData.some((row) => row.predictedWinProbability !== undefined);

    return (
        <div className="chara-list-section">
            <CharaTable
                data={sortedData}
                courseId={effectiveCourseId}
                showPredictionColumn={showPredictionColumn}
            />
        </div>
    );
};

export default CharaList;

import _ from "lodash";
import React from "react";
import { RaceSimulateData } from "../../../../data/race_data_pb";
import CharaTable from "./CharaCard";
import { useCharaTableData } from "./useCharaTableData";
import { useRacePredictions } from "./useRacePredictions";
import "./CharaList.css";

type CharaListProps = {
    raceHorseInfo: any[];
    raceData: RaceSimulateData;
    detectedCourseId?: number;
    skillActivations?: Record<number, { time: number; name: string; param: number[] }[]>;
    otherEvents?: Record<number, { time: number; duration: number; name: string }[]>;
    raceType?: string;
    groundCondition?: number;
};

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData, detectedCourseId, skillActivations, otherEvents, raceType, groundCondition }) => {
    const { tableData, effectiveCourseId } = useCharaTableData(raceHorseInfo, raceData, detectedCourseId, skillActivations, otherEvents, raceType, groundCondition);
    const predictionState = useRacePredictions(raceHorseInfo, effectiveCourseId);

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const mergedData = tableData.map((row) => {
        const prediction = predictionState.predictionMap.get(row.frameOrder);
        return {
            ...row,
            predictedWinProbability: prediction?.probability,
            predictionRank: prediction?.rank,
        };
    });

    const sortedData = _.sortBy(mergedData, d => d.finishOrder);
    const showPredictionColumn = mergedData.some((row) => row.predictedWinProbability !== undefined);
    const showPredictionBanner = predictionState.status === "loading" || showPredictionColumn;

    return (
        <div className="chara-list-section">
            {showPredictionBanner && (
                <div className="prediction-banner">
                    Trying out displaying predicted win probabilities for CM11 rooms based on stats, known skills and gate draws. Possibly horribly incorrect for some umas.
                </div>
            )}
            <CharaTable data={sortedData} courseId={effectiveCourseId} showPredictionColumn={showPredictionColumn} />
        </div>
    );
};

export default CharaList;

import _ from "lodash";
import React from "react";
import { RaceSimulateData } from "../../../../data/race_data_pb";
import CharaTable from "./CharaCard";
import { useCharaTableData } from "./useCharaTableData";
import "./CharaList.css";

type CharaListProps = {
    raceHorseInfo: any[];
    raceData: RaceSimulateData;
    detectedCourseId?: number;
    skillActivations?: Record<number, { time: number; name: string; param: number[] }[]>;
    otherEvents?: Record<number, { time: number; duration: number; name: string }[]>;
};

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData, detectedCourseId, skillActivations, otherEvents }) => {
    const { tableData } = useCharaTableData(raceHorseInfo, raceData, detectedCourseId, skillActivations, otherEvents);

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const sortedData = _.sortBy(tableData, d => d.finishOrder);

    return (
        <div className="chara-list-section">
            <CharaTable data={sortedData} />
        </div>
    );
};

export default CharaList;

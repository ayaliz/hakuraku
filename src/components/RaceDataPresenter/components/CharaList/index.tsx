import _ from "lodash";
import React from "react";
import BootstrapTable from "react-bootstrap-table-next";
import { RaceSimulateData } from "../../../../data/race_data_pb";
import FoldCard from "../../../FoldCard";
import { charaTableColumns } from "./columns";
import { expandRowOptions } from "./ExpandedRow";
import { useCharaTableData } from "./useCharaTableData";

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

    return <FoldCard header="Umas">
        <BootstrapTable bootstrap4 condensed hover
            classes="responsive-bootstrap-table"
            wrapperClasses="table-responsive"
            expandRow={expandRowOptions}
            data={sortedData}
            columns={charaTableColumns}
            keyField="frameOrder" />
    </FoldCard>;
};

export default CharaList;

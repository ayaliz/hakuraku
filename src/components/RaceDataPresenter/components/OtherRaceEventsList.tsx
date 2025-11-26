import React from "react";
import BootstrapTable, { ColumnDescription } from "react-bootstrap-table-next";
import _ from "lodash";
import { RaceSimulateData } from "../../../data/race_data_pb";
import FoldCard from "../../FoldCard";
import { otherRaceEventLabels } from "../utils/RacePresenterUtils";

type CompeteTableData = {
    time: number,
    type: string,
    charas: {
        displayName: string,
    }[],
};

const competeTableColumns: ColumnDescription<CompeteTableData>[] = [
    {
        dataField: 'time',
        text: 'Time',
    },
    {
        dataField: 'type',
        text: 'Type',
    },
    {
        dataField: 'charas',
        text: '',
        formatter: (_, row) => <>
            {row.charas.map(c => <>{c.displayName}<br /></>)}
        </>,
    },
];

type OtherRaceEventsListProps = {
    raceData: RaceSimulateData;
    displayNames: Record<number, string>;
};

const OtherRaceEventsList: React.FC<OtherRaceEventsListProps> = ({ raceData, displayNames }) => {
    const groupedEvents = _.groupBy(raceData.event.map(e => e.event!)
        .filter(e => otherRaceEventLabels.has(e.type!)),
        e => e.frameTime!);

    const d: CompeteTableData[] = _.values(groupedEvents).map(events => {
        const time = events[0].frameTime!;
        return {
            time: time,
            type: otherRaceEventLabels.get(events[0].type!)!,
            charas: events.map(e => {
                const frameOrder = e.param[0];
                return {
                    displayName: displayNames[frameOrder],
                };
            }),
        };
    });

    return <FoldCard header="Other Race Events">
        <BootstrapTable bootstrap4 condensed hover
            classes="responsive-bootstrap-table"
            wrapperClasses="table-responsive"
            data={d}
            columns={competeTableColumns}
            keyField="time" />
    </FoldCard>;
};

export default OtherRaceEventsList;

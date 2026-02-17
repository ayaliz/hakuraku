import React from "react";
import { Table } from "react-bootstrap";
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

type OtherRaceEventsListProps = {
    raceData: RaceSimulateData;
    displayNames: Record<number, string>;
};

const OtherRaceEventsList: React.FC<OtherRaceEventsListProps> = ({ raceData, displayNames }) => {
    const groupedEvents = _.groupBy(raceData.event.map(e => e.event!)
        .filter(e => otherRaceEventLabels.has(e.type!)),
        e => e.frameTime!);

    const data: CompeteTableData[] = _.values(groupedEvents).map(events => {
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
        <div className="table-responsive">
            <Table striped bordered hover size="sm" className="responsive-bootstrap-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Characters</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, idx) => (
                        <tr key={row.time}>
                            <td>{row.time}</td>
                            <td>{row.type}</td>
                            <td>
                                {row.charas.map((c, cIdx) => (
                                    <React.Fragment key={cIdx}>
                                        {c.displayName}
                                        {cIdx < row.charas.length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    </FoldCard>;
};

export default OtherRaceEventsList;

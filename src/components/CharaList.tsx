import React from "react";
import { OverlayTrigger, Table, Tooltip } from "react-bootstrap";
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import _ from "lodash";
import { Chara } from "../data/data_pb";
import {
    RaceSimulateData,
    RaceSimulateHorseResultData,
} from "../data/race_data_pb";
import {
    getCharaActivatedSkillIds,
} from "../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../data/TrainedCharaData";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import CardNamePresenter from "./CardNamePresenter";
import CharaProperLabels from "./CharaProperLabels";
import CopyButton from "./CopyButton";
import FoldCard from "./FoldCard";
import {
    calculateRaceDistance,
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "./RacePresenterUtils";

type CharaTableData = {
    trainedChara: TrainedCharaData,
    chara: Chara | undefined, // Mob or unknown chara will be undefined.

    frameOrder: number, // 馬番, 1-indexed
    finishOrder: number, // 着順, 1-indexed

    horseResultData: RaceSimulateHorseResultData,

    popularity: number,
    popularityMarks: number[],
    motivation: number,

    activatedSkills: Set<number>,

    raceDistance: number,
};

const charaTableColumns: ColumnDescription<CharaTableData>[] = [
    {
        dataField: 'copy',
        isDummyField: true,
        text: '',
        formatter: (cell, row) => <CopyButton content={JSON.stringify(row.trainedChara.rawData)} />,
    },
    {
        dataField: 'finishOrder',
        text: 'Finish',
        sort: true,
    },
    {
        dataField: 'frameOrder',
        text: 'No.',
        sort: true,
    },
    {
        dataField: 'chara',
        text: '',
        formatter: (chara: Chara | undefined, row) => chara ? <>
            {chara.name} {row.trainedChara.viewerName ? `[${row.trainedChara.viewerName}]` : ''} <CardNamePresenter cardId={row.trainedChara.cardId} />
        </> : unknownCharaTag,
    },
    {
        dataField: 'df2',
        isDummyField: true,
        text: 'Time',
        formatter: (cell, row) => <>
            {UMDatabaseUtils.formatTime(row.horseResultData.finishTime!)}
            <br />{UMDatabaseUtils.formatTime(row.horseResultData.finishTimeRaw!)}
        </>,
    },
    {
        dataField: 'df3',
        isDummyField: true,
        text: '',
        formatter: (cell, row) => <>
            {runningStyleLabel(row.horseResultData, row.activatedSkills)}
            <br />Mood: {UMDatabaseUtils.motivationLabels[row.motivation]}
        </>,
    },
    {
        dataField: 'lastSpurt',
        isDummyField: true,
        text: 'Spurt delay',
        headerFormatter: (column, colIndex) => {
            return (
                <span>
                    Spurt delay{' '}
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id={`tooltip-spurt-delay`}>
                                High values indicate a lack of HP when entering late-race. Values below roughly 4m aren't indicative of any problems with HP.
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
        formatter: (cell, row) => {
            const dist = row.horseResultData.lastSpurtStartDistance;
            if (!dist) return '-';

            const phase3Start = row.raceDistance * 2 / 3;
            const delay = dist - phase3Start;
            const color = getColorForSpurtDelay(delay);

            return (
                <span style={{ color, fontWeight: 'bold' }}>{delay.toFixed(2)}m</span>
            );
        },
    },
    {
        dataField: 'rankScore',
        isDummyField: true,
        text: 'Score',
        formatter: (cell, row) => row.trainedChara.rankScore,
    },
    {
        dataField: 'speed',
        isDummyField: true,
        text: 'Speed',
        formatter: (cell, row) => row.trainedChara.speed,
    },
    {
        dataField: 'stamina',
        isDummyField: true,
        text: 'Stamina',
        formatter: (cell, row) => row.trainedChara.stamina,
    },
    {
        dataField: 'pow',
        isDummyField: true,
        text: 'Power',
        formatter: (cell, row) => row.trainedChara.pow,
    },
    {
        dataField: 'guts',
        isDummyField: true,
        text: 'Guts',
        formatter: (cell, row) => row.trainedChara.guts,
    },
    {
        dataField: 'wiz',
        isDummyField: true,
        text: 'Wit',
        formatter: (cell, row) => row.trainedChara.wiz,
    },
];

const charaTableExpandRow: ExpandRowProps<CharaTableData> = {
    renderer: row => <div className="d-flex flex-row align-items-start">
        <Table size="small" className="w-auto m-2">
            <tbody>
                {row.trainedChara.skills.map(cs =>
                    <tr>
                        <td>{UMDatabaseWrapper.skillNameWithId(cs.skillId)}</td>
                        <td>Lv {cs.level}</td>
                        <td>{row.activatedSkills.has(cs.skillId) ? 'Used' : ''}</td>
                    </tr>,
                )}
            </tbody >
        </Table >
        <CharaProperLabels chara={row.trainedChara} />
    </div >,
    showExpandColumn: true,
};

type CharaListProps = {
    raceHorseInfo: any[];
    raceData: RaceSimulateData;
};

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData }) => {
    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const raceDistance = calculateRaceDistance(raceData);

    const l: CharaTableData[] = raceHorseInfo.map(data => {
        const frameOrder = data['frame_order'] - 1;

        const horseResult = raceData.horseResult[frameOrder];

        const trainedCharaData = fromRaceHorseData(data);
        return {
            trainedChara: trainedCharaData,
            chara: UMDatabaseWrapper.charas[trainedCharaData.charaId],

            frameOrder: frameOrder + 1,
            finishOrder: horseResult.finishOrder! + 1,

            horseResultData: horseResult,

            popularity: data['popularity'],
            popularityMarks: data['popularity_mark_rank_array'],
            motivation: data['motivation'],

            activatedSkills: getCharaActivatedSkillIds(raceData, frameOrder),

            raceDistance: raceDistance,
        };
    });

    return <FoldCard header="Umas">
        <BootstrapTable bootstrap4 condensed hover
            classes="responsive-bootstrap-table"
            wrapperClasses="table-responsive"
            expandRow={charaTableExpandRow}
            data={_.sortBy(l, d => d.finishOrder)} columns={charaTableColumns} keyField="frameOrder" />
    </FoldCard>;
};

export default CharaList;

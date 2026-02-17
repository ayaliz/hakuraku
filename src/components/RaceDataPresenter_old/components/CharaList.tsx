import React, { useState } from "react";
import { OverlayTrigger, Table, Tooltip } from "react-bootstrap";
import _ from "lodash";
import { Chara } from "../../../data/data_pb";
import {
    RaceSimulateData,
    RaceSimulateHorseResultData,
} from "../../../data/race_data_pb";
import {
    getCharaActivatedSkillIds,
} from "../../../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import * as UMDatabaseUtils from "../../../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import CardNamePresenter from "../../CardNamePresenter";
import CharaProperLabels from "../../CharaProperLabels";
import CopyButton from "../../CopyButton";
import FoldCard from "../../FoldCard";
import {
    calculateRaceDistance,
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "../utils/RacePresenterUtils";

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

const ChevronIcon = () => (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
);

type CharaListProps = {
    raceHorseInfo: any[];
    raceData: RaceSimulateData;
};

const CharaList: React.FC<CharaListProps> = ({ raceHorseInfo, raceData }) => {
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    if (!raceHorseInfo || raceHorseInfo.length === 0) {
        return null;
    }

    const raceDistance = calculateRaceDistance(raceData);

    const tableData: CharaTableData[] = raceHorseInfo.map(data => {
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

    const sortedData = _.sortBy(tableData, d => d.finishOrder);

    const toggleRow = (frameOrder: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(frameOrder)) {
                next.delete(frameOrder);
            } else {
                next.add(frameOrder);
            }
            return next;
        });
    };

    return <FoldCard header="Umas">
        <div className="table-responsive">
            <Table striped bordered hover size="sm">
                <thead>
                    <tr>
                        <th style={{ width: '30px' }}></th>
                        <th style={{ width: '40px' }}></th>
                        <th style={{ width: '60px' }}>Finish</th>
                        <th style={{ width: '50px' }}>No.</th>
                        <th>Character</th>
                        <th>Time</th>
                        <th>Style / Mood</th>
                        <th>
                            <span>
                                Spurt delay{' '}
                                <OverlayTrigger
                                    placement="top"
                                    overlay={
                                        <Tooltip id="tooltip-spurt-delay">
                                            High values indicate a lack of HP when entering late-race. Values below roughly 4m aren't indicative of any problems with HP.
                                        </Tooltip>
                                    }
                                >
                                    <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                                </OverlayTrigger>
                            </span>
                        </th>
                        <th>Score</th>
                        <th>Speed</th>
                        <th>Stamina</th>
                        <th>Power</th>
                        <th>Guts</th>
                        <th>Wit</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.flatMap(row => {
                        const isExpanded = expandedRows.has(row.frameOrder);
                        const dist = row.horseResultData.lastSpurtStartDistance;
                        let spurtDelayContent: React.ReactNode = '-';

                        if (dist) {
                            if (dist === -1) {
                                spurtDelayContent = <span style={{ color: '#dc3545', fontWeight: 'bold' }}>No spurt</span>;
                            } else {
                                const phase3Start = row.raceDistance * 2 / 3;
                                const delay = dist - phase3Start;
                                const color = getColorForSpurtDelay(delay);
                                spurtDelayContent = <span style={{ color, fontWeight: 'bold' }}>{delay.toFixed(2)}m</span>;
                            }
                        }

                        const mainRow = (
                            <tr key={`main-${row.frameOrder}`} style={{ cursor: 'pointer' }} onClick={() => toggleRow(row.frameOrder)}>
                                <td style={{ textAlign: 'center' }}>
                                    <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>
                                        <ChevronIcon />
                                    </span>
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                    <CopyButton content={JSON.stringify(row.trainedChara.rawData)} />
                                </td>
                                <td>{row.finishOrder}</td>
                                <td>{row.frameOrder}</td>
                                <td>
                                    {row.chara ? (
                                        <>
                                            {row.chara.name} {row.trainedChara.viewerName ? `[${row.trainedChara.viewerName}]` : ''} <CardNamePresenter cardId={row.trainedChara.cardId} />
                                        </>
                                    ) : unknownCharaTag}
                                </td>
                                <td>
                                    {UMDatabaseUtils.formatTime(row.horseResultData.finishTime!)}
                                    <br />{UMDatabaseUtils.formatTime(row.horseResultData.finishTimeRaw!)}
                                </td>
                                <td>
                                    {runningStyleLabel(row.horseResultData, row.activatedSkills)}
                                    <br />Mood: {UMDatabaseUtils.motivationLabels[row.motivation]}
                                </td>
                                <td>{spurtDelayContent}</td>
                                <td>{row.trainedChara.rankScore}</td>
                                <td>{row.trainedChara.speed}</td>
                                <td>{row.trainedChara.stamina}</td>
                                <td>{row.trainedChara.pow}</td>
                                <td>{row.trainedChara.guts}</td>
                                <td>{row.trainedChara.wiz}</td>
                            </tr>
                        );

                        if (!isExpanded) {
                            return [mainRow];
                        }

                        const expandedRow = (
                            <tr key={`expanded-${row.frameOrder}`}>
                                <td colSpan={14} style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                    <div className="d-flex flex-row align-items-start">
                                        <Table size="sm" className="w-auto m-2">
                                            <tbody>
                                                {row.trainedChara.skills.map(cs =>
                                                    <tr key={cs.skillId}>
                                                        <td>{UMDatabaseWrapper.skillNameWithId(cs.skillId)}</td>
                                                        <td>Lv {cs.level}</td>
                                                        <td>{row.activatedSkills.has(cs.skillId) ? 'Used' : ''}</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </Table>
                                        <CharaProperLabels chara={row.trainedChara} />
                                    </div>
                                </td>
                            </tr>
                        );

                        return [mainRow, expandedRow];
                    })}
                </tbody>
            </Table>
        </div>
    </FoldCard>;
};

export default CharaList;

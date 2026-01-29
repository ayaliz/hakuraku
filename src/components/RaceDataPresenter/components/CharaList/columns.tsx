import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { ColumnDescription } from "react-bootstrap-table-next";
import { Chara } from "../../../../data/data_pb";
import * as UMDatabaseUtils from "../../../../data/UMDatabaseUtils";
import CardNamePresenter from "../../../CardNamePresenter";
import CopyButton from "../../../CopyButton";
import {
    getColorForSpurtDelay,
    runningStyleLabel,
    unknownCharaTag,
} from "../../utils/RacePresenterUtils";
import { CharaTableData } from "./types";

export const charaTableColumns: ColumnDescription<CharaTableData>[] = [
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
        formatter: (chara: Chara | undefined, row) => chara ? (
            <div style={{ lineHeight: 1.2 }}>
                {chara.name} <CardNamePresenter cardId={row.trainedChara.cardId} />
                {row.trainedChara.viewerName && (
                    <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                        [{row.trainedChara.viewerName}]
                    </div>
                )}
            </div>
        ) : unknownCharaTag,
    },
    {
        dataField: 'df2',
        isDummyField: true,
        text: 'Time',
        headerFormatter: () => {
            return (
                <span>
                    Time{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-time`}>
                                The first value is the in-game time; the second is the simulation time. The in-game time is typically inaccurate and heavily manipulated to match real-world race times on this track.
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
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
        dataField: 'startDelay',
        isDummyField: true,
        text: 'Start delay',
        headerFormatter: () => {
            return (
                <span>
                    Start delay{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-start-delay`}>
                                Ingame, a start delay of 0.08 or worse is marked as a late start. However, the most devastating effect of high start delay is the loss of 1 frame of acceleration which already occurs at 0.066, so any start that loses that frame of acceleration is marked as a late start here
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
        formatter: (cell, row) => (
            <>
                {row.startDelay !== undefined ? row.startDelay.toFixed(5) + "s" : '-'}
                <br />
                {row.isLateStart ? (
                    <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '0.85em' }}>Late start</span>
                ) : (
                    <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '0.85em' }}>Normal start</span>
                )}
            </>
        ),
    },
    {
        dataField: 'lastSpurt',
        isDummyField: true,
        text: 'Last spurt',
        headerFormatter: () => {
            return (
                <span>
                    Last spurt{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-spurt-delay`}>
                                If an Uma performed a full last spurt, you should see a spurt delay &lt; 3m as well as an observed speed matching the theoretical speed. (Theoretical speed calculation requires the correct track to be selected; see the top left of Replay.) This data may look messed up for career races due to the hidden +400 stat modifier.
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
            if (dist === -1) {
                return <span style={{ color: '#dc3545', fontWeight: 'bold' }}>No spurt</span>;
            }

            const phase3Start = row.raceDistance * 2 / 3;
            const delay = dist - phase3Start;
            const color = getColorForSpurtDelay(delay);

            const diff = (row.maxAdjustedSpeed && row.lastSpurtTargetSpeed)
                ? row.maxAdjustedSpeed - row.lastSpurtTargetSpeed
                : 0;
            const reached = diff >= -0.05;

            return (
                <div style={{ lineHeight: 1.2 }}>
                    <div>
                        Delay: <span style={{ color, fontWeight: 'bold' }}>{delay.toFixed(2)}m</span>
                    </div>
                    {row.maxAdjustedSpeed && row.lastSpurtTargetSpeed ? (
                        <div style={{ fontSize: '0.85em', color: reached ? '#28a745' : '#dc3545' }} title="Max Speed Reached vs Theoretical Target">
                            <span style={{ color: '#fff' }}>Speed:</span> {row.maxAdjustedSpeed.toFixed(2)} <span style={{ opacity: 0.8 }}>({diff > 0 ? '+' : ''}{diff.toFixed(2)})</span>
                        </div>
                    ) : null}
                </div>
            );
        },
    },
    {
        dataField: 'hpOutcome',
        isDummyField: true,
        text: 'HP Result',
        headerFormatter: () => {
            return (
                <span>
                    HP Result{' '}
                    <OverlayTrigger
                        placement="bottom"
                        overlay={
                            <Tooltip id={`tooltip-hp-result`}>
                                Shows remaining HP if an Uma made it to the finish without running out of HP, otherwise shows an estimate for missing HP based on observed last spurt speed.
                            </Tooltip>
                        }
                    >
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #fff' }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            );
        },
        formatter: (cell, row) => {
            if (!row.hpOutcome) return '-';
            if (row.hpOutcome.type === 'died') {
                const percent = (row.hpOutcome.deficit / row.hpOutcome.startHp) * 100;
                return (
                    <div>
                        <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Died {row.hpOutcome.distance.toFixed(2)}m early</span>
                        <br />
                        <span style={{ fontSize: '0.85em', color: '#dc3545' }}>~{row.hpOutcome.deficit.toFixed(0)} HP ({percent.toFixed(1)}%) missing</span>
                    </div>
                );
            } else {
                const percent = (row.hpOutcome.hp / row.hpOutcome.startHp) * 100;
                return (
                    <div>
                        <span style={{ color: '#28a745', fontWeight: 'bold' }}>Survived</span>
                        <br />
                        <span style={{ fontSize: '0.85em', color: '#28a745' }}>{Math.round(row.hpOutcome.hp)} HP ({percent.toFixed(1)}%) remaining</span>
                    </div>
                );
            }
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

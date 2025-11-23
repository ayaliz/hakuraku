import { JsonViewer } from "@textea/json-viewer";
import EChartsReactCore from "echarts-for-react/lib/core";
import { LineChart, LineSeriesOption } from "echarts/charts";
import {
    DataZoomComponentOption,
    DataZoomSliderComponent,
    GridComponent,
    GridComponentOption,
    LegendComponent,
    LegendComponentOption,
    MarkAreaComponent,
    MarkAreaComponentOption,
    MarkLineComponent,
    MarkLineComponentOption,
    TooltipComponent,
    TooltipComponentOption,
} from "echarts/components";
import * as echarts from "echarts/core";
import { ComposeOption } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { MarkArea2DDataItemOption } from "echarts/types/src/component/marker/MarkAreaModel";
import type { MarkLine1DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";
import _ from "lodash";
import memoize from "memoize-one";
import React from "react";
import { Alert, Form, OverlayTrigger, Table, Tooltip } from "react-bootstrap";
import BootstrapTable, { ColumnDescription, ExpandRowProps } from "react-bootstrap-table-next";
import { Chara } from "../data/data_pb";
import {
    RaceSimulateData,
    RaceSimulateEventData_SimulateEventType,
    RaceSimulateHorseFrameData_TemptationMode,
    RaceSimulateHorseResultData,
} from "../data/race_data_pb";
import {
    filterCharaSkills,
    filterCharaTargetedSkills,
    filterRaceEvents,
    getCharaActivatedSkillIds,
} from "../data/RaceDataUtils";
import { fromRaceHorseData, TrainedCharaData } from "../data/TrainedCharaData";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";
import UMDatabaseWrapper from "../data/UMDatabaseWrapper";
import CardNamePresenter from "./CardNamePresenter";
import CharaProperLabels from "./CharaProperLabels";
import CopyButton from "./CopyButton";
import FoldCard from "./FoldCard";
import RaceReplay from "./RaceReplay/index";



const unknownCharaTag = 'Unknown Chara / Mob';
const supportedRaceDataVersion = 100000002;

type CompeteTableData = {
    time: number,
    type: string,
    charas: {
        displayName: string,
    }[],
};

type ECOption = ComposeOption<
    | LineSeriesOption
    | TooltipComponentOption
    | GridComponentOption
    | MarkLineComponentOption
    | MarkAreaComponentOption
    | LegendComponentOption
    | DataZoomComponentOption>;

echarts.use([
    LineChart, TooltipComponent, GridComponent, MarkLineComponent, MarkAreaComponent, LegendComponent, SVGRenderer, DataZoomSliderComponent,
]);

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

const runningStyleLabel = (horseResultData: RaceSimulateHorseResultData, activatedSkills: Set<number>) => {
    if (activatedSkills.has(202051)) {
        return '大逃げ';
    }
    return UMDatabaseUtils.runningStyleLabels[horseResultData.runningStyle!];
};

const otherRaceEventLabels = new Map([
    [RaceSimulateEventData_SimulateEventType.COMPETE_TOP, 'COMPETE_TOP'],
    [RaceSimulateEventData_SimulateEventType.COMPETE_FIGHT, 'COMPETE_FIGHT'],
    [RaceSimulateEventData_SimulateEventType.RELEASE_CONSERVE_POWER, 'RELEASE_CONSERVE_POWER'],
    [RaceSimulateEventData_SimulateEventType.STAMINA_LIMIT_BREAK_BUFF, 'STAMINA_LIMIT_BREAK_BUFF'],
    [RaceSimulateEventData_SimulateEventType.COMPETE_BEFORE_SPURT, 'COMPETE_BEFORE_SPURT'],
    [RaceSimulateEventData_SimulateEventType.STAMINA_KEEP, 'STAMINA_KEEP'],
    [RaceSimulateEventData_SimulateEventType.SECURE_LEAD, 'SECURE_LEAD'],
]);

function getColorForSpurtDelay(delay: number): string {
    if (delay < 4) return '#28a745'; // Green
    if (delay > 20) return '#dc3545'; // Red

    // Gradient from Green (4) to Yellow (12) to Red (20)
    if (delay <= 12) {
        // Green to Yellow
        const t = (delay - 4) / 8;
        // Green: 40, 167, 69
        // Yellow: 255, 193, 7
        const r = 40 + t * (255 - 40);
        const g = 167 + t * (193 - 167);
        const b = 69 + t * (7 - 69);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    } else {
        // Yellow to Red
        const t = (delay - 12) / 8;
        // Yellow: 255, 193, 7
        // Red: 220, 53, 69
        const r = 255 + t * (220 - 255);
        const g = 193 + t * (53 - 193);
        const b = 7 + t * (69 - 7);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
}

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

type RaceDataPresenterProps = {
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
};

type RaceDataPresenterState = {
    selectedCharaFrameOrder: number | undefined,

    showSkills: boolean,
    showTargetedSkills: boolean,
    showBlocks: boolean,
    showTemptationMode: boolean,
    showOtherRaceEvents: boolean,
};

function bisectFrameIndex(frames: RaceSimulateData["frame"], t: number) {
    if (!frames.length) return 0;
    const last = frames.length - 1;
    if (t <= (frames[0].time ?? 0)) return 0;
    if (t >= (frames[last].time ?? 0)) return last;
    let lo = 0, hi = last;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1, tm = frames[mid].time ?? 0;
        if (tm <= t) { if (t < (frames[mid + 1].time ?? tm)) return mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return lo;
}

function calculateRaceDistance(raceData: RaceSimulateData) {
    const frames = raceData.frame ?? [];
    let winnerIndex = -1, winnerFinish = Number.POSITIVE_INFINITY;
    (raceData.horseResult ?? []).forEach((hr, idx) => { const t = hr?.finishTimeRaw; if (typeof t === "number" && t > 0 && t < winnerFinish) { winnerFinish = t; winnerIndex = idx; } });
    if (winnerIndex >= 0 && frames.length && isFinite(winnerFinish)) {
        const i = bisectFrameIndex(frames, winnerFinish);
        const d0 = frames[i]?.horseFrame?.[winnerIndex]?.distance ?? 0;
        return Math.round(d0 / 100) * 100;
    }
    return 0;
}

class RaceDataPresenter extends React.PureComponent<RaceDataPresenterProps, RaceDataPresenterState> {
    constructor(props: RaceDataPresenterProps) {
        super(props);

        this.state = {
            selectedCharaFrameOrder: undefined,

            showSkills: true,
            showTargetedSkills: true,
            showBlocks: true,
            showTemptationMode: true,
            showOtherRaceEvents: true,
        };
    }

    displayNames = memoize((raceHorseInfo: any[], raceData: RaceSimulateData) => {
        const nameFromRaceHorseInfo: Record<number, string> = {};
        if (raceHorseInfo && raceHorseInfo.length === raceData.horseResult.length) {
            raceHorseInfo.forEach((d: any) => {
                const frameOrder = d['frame_order'] - 1; // 0-indexed
                const charaId = d['chara_id'];
                const charaDisplayName = charaId in UMDatabaseWrapper.charas ? UMDatabaseWrapper.charas[charaId].name : unknownCharaTag;
                const trainerNameSuffix = d['trainer_name'] ? ` [${d['trainer_name']}]` : '';
                nameFromRaceHorseInfo[frameOrder] = ` ${charaDisplayName}${trainerNameSuffix}`;
            });
        }

        const m: Record<number, string> = {};
        for (let frameOrder = 0; frameOrder < raceData.horseResult.length; frameOrder++) {
            // frameOrder is 0 ordered.
            const finishOrder = raceData.horseResult[frameOrder].finishOrder! + 1; // 1-indexed
            m[frameOrder] = `#${finishOrder}${nameFromRaceHorseInfo[frameOrder] ?? ''}`;
        }
        return m;
    });


    renderGraphs() {
        const raceHorseInfo = this.props.raceHorseInfo;
        const raceData = this.props.raceData;
        const frameOrder = this.state.selectedCharaFrameOrder!;

        const displayNames = this.displayNames(raceHorseInfo, raceData);

        const skillPlotLines = filterCharaSkills(raceData, frameOrder)
            .map(event => {
                return {
                    xAxis: event.frameTime,
                    name: UMDatabaseWrapper.skillName(event.param[1]),
                    label: { show: true, position: 'insideStartBottom' },
                    lineStyle: { color: '#666' },
                } as MarkLine1DDataItemOption;
            });

        const skillTargetedSkillPlotLines = filterCharaTargetedSkills(raceData, frameOrder)
            .map(event => {
                return {
                    xAxis: event.frameTime,
                    name: `${UMDatabaseWrapper.skillName(event.param[1])} by ${displayNames[event.param[0]]}`,
                    label: { show: true, position: 'insideStartBottom' },
                    lineStyle: { color: 'rgba(255, 0, 0, 0.6)' },
                } as MarkLine1DDataItemOption;
            });

        const otherEventsPlotLines = Array.from(otherRaceEventLabels).flatMap(([eventType, name]) =>
            filterRaceEvents(raceData, frameOrder, eventType).map(event => {
                return {
                    xAxis: event.frameTime,
                    name: name,
                    label: { show: true, position: 'insideStartBottom' },
                    lineStyle: { color: 'rgba(0, 255, 0, 0.6)' },
                } as MarkLine1DDataItemOption;
            }));

        const lastSpurtStartDistance = raceData.horseResult[frameOrder].lastSpurtStartDistance!;
        let lastSpurtStartTime = 0;

        function makeBlockedPlotArea(from: number, to: number, blockedByIndex: number): MarkArea2DDataItemOption {
            return [
                {
                    name: `Blocked by ${displayNames[blockedByIndex]}`,
                    xAxis: from,
                    itemStyle: { color: 'rgba(255, 0, 0, 0.1)' },
                },
                {
                    xAxis: to,
                },
            ];
        }

        function makeTemptationModePlotArea(from: number, to: number, mode: RaceSimulateHorseFrameData_TemptationMode): MarkArea2DDataItemOption {
            return [
                {
                    name: `Temptation ${RaceSimulateHorseFrameData_TemptationMode[mode] ?? mode}`,
                    xAxis: from,
                    itemStyle: { color: 'rgba(255, 255, 0, 0.1)' },
                },
                {
                    xAxis: to,
                },
            ];
        }


        const blockFrontPlotAreas: MarkArea2DDataItemOption[] = [];
        const temptationModePlotAreas: MarkArea2DDataItemOption[] = [];

        const deltaSpeed: [number, number][] = [];
        const deltaHp: [number, number][] = [];

        let lastBlockFrontHorseIndexChangedTime = 0;
        let lastBlockFrontHorseIndex = -1;
        let lastTemptationModeChangedTime = 0;
        let lastTemptationMode = 0;
        for (let i = 0; i < raceData.frame.length; i++) {
            const frame = raceData.frame[i];
            const time = frame.time!;
            const horseFrame = frame.horseFrame[frameOrder];

            const previousFrame = raceData.frame[i - 1];
            const previousTime = i === 0 ? 0 : previousFrame.time!;
            const previousHorseFrame = previousFrame?.horseFrame[frameOrder];

            if (horseFrame.blockFrontHorseIndex !== lastBlockFrontHorseIndex) {
                if (lastBlockFrontHorseIndex !== -1) {
                    blockFrontPlotAreas.push(makeBlockedPlotArea(lastBlockFrontHorseIndexChangedTime, previousTime, lastBlockFrontHorseIndex));
                }
                lastBlockFrontHorseIndexChangedTime = previousTime;
                lastBlockFrontHorseIndex = horseFrame.blockFrontHorseIndex!;
            }
            if (horseFrame.temptationMode !== lastTemptationMode) {
                if (lastTemptationMode !== 0) {
                    temptationModePlotAreas.push(makeTemptationModePlotArea(lastTemptationModeChangedTime, previousTime, lastTemptationMode));
                }
                lastTemptationModeChangedTime = previousTime;
                lastTemptationMode = horseFrame.temptationMode!;
            }

            const distance = horseFrame.distance!;
            if (lastSpurtStartDistance > 0 && lastSpurtStartTime === 0 && lastSpurtStartDistance <= distance) {
                // i should never be 0 unless it has > 0 distance at frame 0, but just in case...
                if (i > 0) {
                    // Interpolate it.
                    const previousFrameDistance = previousHorseFrame.distance!;
                    lastSpurtStartTime = previousTime + (lastSpurtStartDistance - previousFrameDistance) / (distance - previousFrameDistance) * (time - previousTime);
                }
            }

            if (i === 0) {
                deltaSpeed.push([0, 0]);
                deltaHp.push([0, 0]);
            } else {
                deltaSpeed.push([time, horseFrame.speed! - previousHorseFrame.speed!]);
                deltaHp.push([time, horseFrame.hp! - previousHorseFrame.hp!]);
            }
        }
        const lastFrameTime = _.last(raceData.frame)!.time!;
        if (lastBlockFrontHorseIndex !== -1) {
            blockFrontPlotAreas.push(makeBlockedPlotArea(lastBlockFrontHorseIndexChangedTime, lastFrameTime, lastBlockFrontHorseIndex));
        }
        if (lastTemptationMode !== 0) {
            temptationModePlotAreas.push(makeTemptationModePlotArea(lastTemptationModeChangedTime, lastFrameTime, lastTemptationMode));
        }

        const plotLines: MarkLine1DDataItemOption[] = [{
            xAxis: raceData.horseResult[frameOrder!].finishTimeRaw,
            name: 'Goal in',
            lineStyle: {
                color: '#666',
                type: [8, 3, 1, 3],
            },
        }];
        if (lastSpurtStartDistance > 0) {
            plotLines.push({
                xAxis: lastSpurtStartTime,
                name: 'Last Spurt',
                lineStyle: {
                    color: '#666',
                    type: [8, 3],
                },
            });
        }

        const options: ECOption = {
            grid: [
                {
                    height: '45%',
                },
                {
                    top: '60%',
                    height: '30%',
                },
            ],
            axisPointer: {
                link: [
                    {
                        xAxisIndex: 'all',
                    },
                ],
            },
            xAxis: [
                {
                    name: "Time",
                    nameLocation: "middle",
                    type: "value",
                    min: "dataMin",
                    max: "dataMax",
                },
                {
                    gridIndex: 1,
                    type: "value",
                    position: "top",
                    min: "dataMin",
                    max: "dataMax",
                },
            ],
            yAxis: [
                { type: "value" },
                { gridIndex: 1, type: "value" },
            ],
            legend: { show: true },
            series: [
                {
                    name: "Speed",
                    data: raceData.frame.map(frame => [
                        frame.time,
                        frame.horseFrame[frameOrder!].speed,
                    ]),
                    type: "line",
                    smooth: true,
                    markLine: {
                        symbol: 'none',
                        label: {
                            position: "end",
                            formatter: "{b}",
                        },
                        lineStyle: { type: "solid" },
                        data: [
                            ...(this.state.showSkills ? skillPlotLines : []),
                            ...(this.state.showTargetedSkills ? skillTargetedSkillPlotLines : []),
                            ...(this.state.showOtherRaceEvents ? otherEventsPlotLines : []),
                            ...plotLines,
                        ],
                    },
                    markArea: {
                        label: {
                            position: "inside",
                            rotate: 90,
                        },
                        emphasis: {
                            label: {
                                position: "inside",
                                rotate: 90,
                            },
                        },
                        data: [
                            ...(this.state.showBlocks ? blockFrontPlotAreas : []),
                            ...(this.state.showTemptationMode ? temptationModePlotAreas : []),
                        ],
                    },
                }, {
                    name: "HP",
                    data: raceData.frame.map(frame => [
                        frame.time,
                        frame.horseFrame[frameOrder!].hp,
                    ]),
                    type: "line",
                    smooth: true,
                },
                {
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    name: "ΔSpeed",
                    data: deltaSpeed,
                    type: "line",
                    smooth: true,
                }, {
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    name: "ΔHP",
                    data: deltaHp,
                    type: "line",
                    smooth: true,
                },
            ],
            tooltip: {
                trigger: 'axis',
            },
            dataZoom: {
                type: 'slider',
                xAxisIndex: [0, 1],
            },
        };

        return <div>
            <EChartsReactCore echarts={echarts} option={options} style={{ height: '700px' }} theme="dark" />
        </div>;
    }

    renderOtherRaceEventsList() {
        const groupedEvents = _.groupBy(this.props.raceData.event.map(e => e.event!)
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
                        displayName: this.displayNames(this.props.raceHorseInfo, this.props.raceData)[frameOrder],
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
    }

    renderCharaList() {
        if (!this.props.raceHorseInfo || this.props.raceHorseInfo.length === 0) {
            return undefined;
        }

        const raceDistance = calculateRaceDistance(this.props.raceData);

        const l: CharaTableData[] = this.props.raceHorseInfo.map(data => {
            const frameOrder = data['frame_order'] - 1;

            const horseResult = this.props.raceData.horseResult[frameOrder];

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

                activatedSkills: getCharaActivatedSkillIds(this.props.raceData, frameOrder),

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
    }

    skillActivations = memoize((raceData: RaceSimulateData) => {
        const allSkillActivations: Record<number, { time: number; name: string; param: number[] }[]> = {};
        for (let i = 0; i < raceData.horseResult.length; i++) {
            const frameOrder = i;
            const skills = filterCharaSkills(raceData, frameOrder).map(event => ({
                time: event.frameTime!,
                name: UMDatabaseWrapper.skillName(event.param[1]),
                param: event.param,
            }));
            allSkillActivations[frameOrder] = skills;
        }
        return allSkillActivations;
    });

    otherEvents = memoize((raceData: RaceSimulateData, raceHorseInfo: any[]) => {
        const allOtherEvents: Record<number, { time: number; duration: number; name: string }[]> = {};
        if (!raceData.frame || raceData.frame.length === 0) {
            return allOtherEvents;
        }

        const charaData = new Map<number, TrainedCharaData>();
        if (raceHorseInfo) {
            raceHorseInfo.forEach(data => {
                const frameOrder = data['frame_order'] - 1;
                charaData.set(frameOrder, fromRaceHorseData(data));
            });
        }

        const goalInX = calculateRaceDistance(raceData);

        for (const event of raceData.event) {
            const e = event.event!;
            const frameOrder = e.param[0];
            const startTime = e.frameTime!;

            if (e.type === RaceSimulateEventData_SimulateEventType.COMPETE_FIGHT) {
                const startHp = raceData.frame[0].horseFrame[frameOrder].hp!;
                const hpThreshold = startHp * 0.05;
                let endTime = raceData.frame[raceData.frame.length - 1].time!;

                for (let i = 0; i < raceData.frame.length; i++) {
                    const frame = raceData.frame[i];
                    if (frame.time! < startTime) continue;
                    if (frame.horseFrame[frameOrder].hp! < hpThreshold) {
                        endTime = frame.time!;
                        break;
                    }
                }
                if (!allOtherEvents[frameOrder]) {
                    allOtherEvents[frameOrder] = [];
                }
                allOtherEvents[frameOrder].push({ time: startTime, duration: endTime - startTime, name: "Dueling" });
            }

            if (e.type === RaceSimulateEventData_SimulateEventType.COMPETE_TOP) {
                const guts = charaData.get(frameOrder)?.guts ?? 0;
                const gutsDuration = Math.pow(700 * guts, 0.5) * 0.012;

                const raceDistance = goalInX;
                const distanceThreshold = (9 / 24) * raceDistance;

                let distanceThresholdTime = -1;
                for (let i = 0; i < raceData.frame.length; i++) {
                    const frame = raceData.frame[i];
                    if (frame.horseFrame[frameOrder].distance! >= distanceThreshold) {
                        distanceThresholdTime = frame.time!;
                        break;
                    }
                }

                if (distanceThresholdTime === -1) { // Should not happen
                    distanceThresholdTime = raceData.frame[raceData.frame.length - 1].time!;
                }

                if (startTime < distanceThresholdTime) {
                    const duration = Math.min(gutsDuration, distanceThresholdTime - startTime);
                    if (!allOtherEvents[frameOrder]) {
                        allOtherEvents[frameOrder] = [];
                    }
                    allOtherEvents[frameOrder].push({ time: startTime, duration: duration, name: "Spot Struggle" });
                }
            }
        }

        return allOtherEvents;
    });

    render() {
        return <div>
            {(this.props.raceData.header!.version! > supportedRaceDataVersion) &&
                <Alert variant="warning">
                    RaceData version {this.props.raceData.header!.version!} higher than supported
                    version {supportedRaceDataVersion}, use at your own risk!
                </Alert>}
            {this.renderCharaList()}
            <FoldCard header="Replay">
                <RaceReplay raceData={this.props.raceData} raceHorseInfo={this.props.raceHorseInfo} displayNames={this.displayNames(this.props.raceHorseInfo, this.props.raceData)} skillActivations={this.skillActivations(this.props.raceData)} otherEvents={this.otherEvents(this.props.raceData, this.props.raceHorseInfo)} />
            </FoldCard>
            {this.renderOtherRaceEventsList()}
            <Form>
                <Form.Group>
                    <Form.Label>Chara</Form.Label>
                    <Form.Control as="select" custom
                        onChange={(e) => this.setState({ selectedCharaFrameOrder: e.target.value ? parseInt(e.target.value) : undefined })}>
                        <option value="">-</option>
                        {Object.entries(this.displayNames(this.props.raceHorseInfo, this.props.raceData))
                            .sort(([, a], [, b]) => a.localeCompare(b))
                            .map(([frameOrder, displayName]) => {
                                return <option value={frameOrder}>{displayName}</option>;
                            })}
                    </Form.Control>
                    <Form.Switch
                        checked={this.state.showSkills}
                        onChange={(e) => this.setState({ showSkills: e.target.checked })}
                        id="show-skills"
                        label="Show Skills" />
                    <Form.Switch
                        checked={this.state.showTargetedSkills}
                        onChange={(e) => this.setState({ showTargetedSkills: e.target.checked })}
                        id="show-targeted-skills"
                        label="Show Targeted Skills" />
                    <Form.Switch
                        checked={this.state.showBlocks}
                        onChange={(e) => this.setState({ showBlocks: e.target.checked })}
                        id="show-blocks"
                        label="Show Blocks" />
                    <Form.Switch
                        checked={this.state.showTemptationMode}
                        onChange={(e) => this.setState({ showTemptationMode: e.target.checked })}
                        id="show-temptation-mode"
                        label="Show Temptation Mode" />
                    <Form.Switch
                        checked={this.state.showOtherRaceEvents}
                        onChange={(e) => this.setState({ showOtherRaceEvents: e.target.checked })}
                        id="show-competes"
                        label={`Show Other Race Events (${Array.from(otherRaceEventLabels.values()).join(', ')})`} />
                </Form.Group>
            </Form>
            {this.state.selectedCharaFrameOrder !== undefined && this.renderGraphs()}
            <hr />
            <JsonViewer value={this.props.raceData.toJson()} defaultInspectDepth={1} theme="dark" />
        </div>;
    }
}

export default RaceDataPresenter;
import React from "react";
import EChartsReactCore from "echarts-for-react/lib/core";
import { LineChart, LineSeriesOption } from "echarts/charts";
import {
	AxisPointerComponent,
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
type MarkLine1DDataItemOption = { xAxis?: number | string; name?: string; label?: object; lineStyle?: object };
type MarkArea2DDataItemOption = [{ name?: string; xAxis?: number; itemStyle?: object }, { xAxis?: number }];
import _ from "lodash";
import {
    RaceSimulateData,
    RaceSimulateHorseFrameData_TemptationMode,
} from "../../../data/race_data_pb";
import {
    filterCharaSkills,
    filterCharaTargetedSkills,
    filterRaceEvents,
} from "../../../data/RaceDataUtils";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import { otherRaceEventLabels } from "../utils/RacePresenterUtils";

echarts.use([
    LineChart, TooltipComponent, GridComponent, MarkLineComponent, MarkAreaComponent, LegendComponent, SVGRenderer, DataZoomSliderComponent, AxisPointerComponent,
]);

type ECOption = ComposeOption<
    | LineSeriesOption
    | TooltipComponentOption
    | GridComponentOption
    | MarkLineComponentOption
    | MarkAreaComponentOption
    | LegendComponentOption
    | DataZoomComponentOption>;

type RaceGraphProps = {
    raceData: RaceSimulateData;
    frameOrder: number;
    displayNames: Record<number, string>;
    showSkills: boolean;
    showTargetedSkills: boolean;
    showBlocks: boolean;
    showTemptationMode: boolean;
    showOtherRaceEvents: boolean;
};

const RaceGraph: React.FC<RaceGraphProps> = ({
    raceData,
    frameOrder,
    displayNames,
    showSkills,
    showTargetedSkills,
    showBlocks,
    showTemptationMode,
    showOtherRaceEvents,
}) => {
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
                        ...(showSkills ? skillPlotLines : []),
                        ...(showTargetedSkills ? skillTargetedSkillPlotLines : []),
                        ...(showOtherRaceEvents ? otherEventsPlotLines : []),
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
                        ...(showBlocks ? blockFrontPlotAreas : []),
                        ...(showTemptationMode ? temptationModePlotAreas : []),
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
};

export default RaceGraph;

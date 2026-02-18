import {
    ScatterSeriesOption,
    CustomSeriesOption,
} from "echarts/charts";
import {
    GridComponentOption,
    LegendComponentOption,
    TooltipComponentOption,
    MarkLineComponentOption,
    MarkAreaComponentOption,
    GraphicComponentOption,
} from "echarts/components";
import { ComposeOption } from "echarts/core";
type MarkLine1DDataItemOption = { xAxis?: number | string; name?: string; label?: object; lineStyle?: object };
import { RaceSimulateData } from "../../../data/race_data_pb";
import {
    DEFAULT_TEAM_PALETTE,
} from "../RaceReplay.constants";
import { labelStyle } from "../RaceReplay.utils";

export type ECOption = ComposeOption<
    | ScatterSeriesOption
    | TooltipComponentOption
    | GridComponentOption
    | LegendComponentOption
    | MarkLineComponentOption
    | MarkAreaComponentOption
    | CustomSeriesOption
    | GraphicComponentOption
>;

export const teamColorFor = (idx: number, info: any, trainerColors?: Record<number, string>) => {
    const trainerId = info?.trainer_id ?? info?.trainerId ?? info?.owner_id ?? info?.team_id ?? null;
    const paletteIndex = (typeof trainerId === "number" ? Math.abs(trainerId) : idx) % DEFAULT_TEAM_PALETTE.length;
    return (trainerId != null && trainerColors?.[trainerId]) || DEFAULT_TEAM_PALETTE[paletteIndex];
};

export function buildLegendShadowSeries(displayNames: Record<number, string>, horseInfoByIdx: Record<number, any>, trainerColors?: Record<number, string>) {
    const out: ScatterSeriesOption[] = [];
    Object.entries(displayNames).forEach(([iStr, name]) => {
        const i = +iStr, info = horseInfoByIdx[i] ?? {}, color = teamColorFor(i, info, trainerColors);
        out.push({ id: `legend-shadow-${i}`, name, type: "scatter", data: [], symbolSize: 0, silent: true, tooltip: { show: false }, itemStyle: { color } });
    });
    return out;
}

export function buildCourseLabelItems(markers: MarkLine1DDataItemOption[], yTop: number) {
    return (markers ?? [])
        .filter((m): m is MarkLine1DDataItemOption & { xAxis: number; name: string } => typeof (m as any).xAxis === "number" && !!(m as any).name)
        .map((m, idx) => ({ id: `course-label-${idx}`, value: [(m as any).xAxis as number, yTop], label: { ...labelStyle(10), position: "top", formatter: (m as any).name } }));
}

export function buildPositionKeepSeries(frontRunnerDistance: number, courseLength: number, yMax: number) {
    const courseFactor = 0.0008 * (courseLength - 1000) + 1.0;

    // Zones relative to front runner (distance behind)
    const zones = [
        { name: "Pace", min: 3.0, max: 5.0 * courseFactor, color: "rgba(128, 0, 128, 0.2)" },
        { name: "Late", min: 6.5 * courseFactor, max: 7.0 * courseFactor, color: "rgba(0, 0, 255, 0.2)" },
        { name: "End", min: 7.5 * courseFactor, max: 8.0 * courseFactor, color: "rgba(0, 128, 0, 0.2)" },
    ];

    const data = zones.map(z => [
        { xAxis: frontRunnerDistance - z.max, yAxis: 0, itemStyle: { color: z.color }, label: { show: true, position: "insideTop", formatter: z.name, color: "#fff" } },
        { xAxis: frontRunnerDistance - z.min, yAxis: yMax }
    ]);

    return {
        id: "position-keep-areas",
        type: "scatter",
        silent: true,
        data: [],
        markArea: {
            silent: true,
            data: data
        }
    };
}

export function buildMarkLines(goalInX: number, raceData: RaceSimulateData, displayNames: Record<number, string>, segmentMarkers: MarkLine1DDataItemOption[], trackData?: any) {
    const lines: MarkLine1DDataItemOption[] = [];
    if (goalInX > 0) lines.push(
        { xAxis: goalInX, name: "Goal In", lineStyle: { color: "#666", type: [8, 3, 1, 3] } },
        { xAxis: (10 / 24) * goalInX, name: "Position Keep ends", lineStyle: { color: "#777", type: "dashed" } },
        { xAxis: (4 / 24) * goalInX, name: "Mid race", lineStyle: { color: "#999", type: "dashed" } }
    );
    (raceData.horseResult ?? []).forEach((hr: any, i: number) => {
        if (hr?.lastSpurtStartDistance != null && hr.lastSpurtStartDistance > 0)
            lines.push({ xAxis: hr.lastSpurtStartDistance, name: `Last Spurt (${displayNames[i] || `Horse ${i + 1}`})`, lineStyle: { color: "#666", type: [8, 3] } });
    });
    lines.push(...segmentMarkers);
    (trackData?.slopes ?? []).forEach((s: any) => {
        const pct = Math.abs((s.slope ?? 0) / 10000).toFixed(2) + "%";
        const dir = s.slope > 0 ? "Uphill" : s.slope < 0 ? "Downhill" : "Flat";
        lines.push({ xAxis: s.start, name: `${dir} ${pct}`, lineStyle: { color: s.slope > 0 ? "#ffcccc" : s.slope < 0 ? "#ccccff" : "#dddddd", type: "solid" } });
    });
    return lines;
}

export const noTooltipScatter = (id: string, markArea?: any) => ({ id, type: "scatter" as const, data: [], symbolSize: 0, silent: true, z: 0, tooltip: { show: false }, markArea });

export function createOptions(args: {
    xMin: number; xMax: number; yMax: number;
    series: ECOption["series"];
    legendNames: string[]; legendSelection: Record<string, boolean>;
}): ECOption {
    const { xMin, xMax, yMax, series, legendNames, legendSelection } = args;
    return {
        xAxis: { type: "value", min: xMin, max: xMax, name: "Distance", axisLabel: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
        yAxis: { type: "value", min: 0, max: yMax, name: "Lane Position", splitLine: { show: false } },
        legend: { show: true, type: "scroll", top: 8, left: 8, right: 8, data: legendNames, selected: legendSelection },
        tooltip: {
            trigger: "item",
            confine: true,
            formatter: (p: any) => {
                const { name, value } = p;
                const has = typeof name === "string" && name.length > 0;
                const speed = (value?.[6] ?? 0) / 100;
                const accel = (value?.[7] ?? 0) / 100;
                const maxHp = value?.[8];
                const hp = value?.[9];
                const accelStr = (accel > 0 ? "+" : "") + accel.toFixed(2);
                const hpStr = (typeof maxHp === "number" && typeof hp === "number")
                    ? `<br/>HP: ${Math.round(hp)}/${Math.round(maxHp)} (${((hp / maxHp) * 100).toFixed(1)}%)`
                    : "";

                const minTarget = value?.[11];
                const maxTarget = value?.[12];
                let targetStr = "";
                if (typeof minTarget === "number" && typeof maxTarget === "number" && maxTarget > 0) {
                    if (Math.abs(maxTarget - minTarget) < 0.001) {
                        targetStr = `<br/>Target: ${maxTarget.toFixed(2)} m/s`;
                    } else {
                        targetStr = `<br/>Target: ${minTarget.toFixed(2)} - ${maxTarget.toFixed(2)} m/s`;
                    }
                }

                return `${has ? name + "<br/>" : ""}Distance: ${value[0].toFixed(2)}m<br/>Lane: ${Math.round(value[1])}<br/>Speed: ${speed.toFixed(2)} m/s<br/>Accel: ${accelStr} m/s²${hpStr}${targetStr}<br/>Start delay: ${(value[13] ?? 0).toFixed(5)}`;
            }
        },
        grid: { top: 80, right: 16, bottom: 40, left: 50, containLabel: false },
        graphic: {
            elements: [
                {
                    id: "distance-readout",
                    type: "text",
                    right: 8,
                    bottom: 8,
                    z: 100,
                    silent: true,
                    style: {
                        text: `${Math.round(xMax)} m`,
                        fontSize: 14,
                        fontWeight: 700,
                        fill: "#000",
                        backgroundColor: "#fff",
                        borderColor: "#000",
                        borderWidth: 1,
                        borderRadius: 6,
                        padding: [4, 8]
                    }
                }
            ]
        },
        series,
        animation: false,
    };
}

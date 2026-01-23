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
import type { MarkLine1DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";
import { RaceSimulateData } from "../../../data/race_data_pb";
import {
    DEFAULT_TEAM_PALETTE,
    SPEED_BOX_WIDTH,
    SPEED_BOX_HEIGHT,
    SPEED_BOX_BG,
    SPEED_BOX_BORDER,
    SPEED_BOX_TEXT,
    SPEED_BOX_FONT_SIZE,
    OVERLAY_INSET,
    ACCEL_BOX_GAP_Y,
    BG_OFFSET_X_PX,
    BG_OFFSET_Y_PX,
    BG_SIZE,
    ICON_SIZE,
    DOT_SIZE,
    BLOCKED_ICON_SIZE,
    EXCLUDE_SKILL_RE,
    TEMPTATION_TEXT,
    HP_BAR_WIDTH,
    HP_BAR_HEIGHT,
    HP_BAR_GAP_Y,
    HP_BAR_BG_COLOR,
    HP_BAR_FILL_COLOR,
} from "../RaceReplay.constants";
import { getCharaIcon, formatSigned, stackLabels, labelStyle, mixWithWhite } from "../RaceReplay.utils";
import { InterpolatedFrame } from "../RaceReplay.types";
import { calculateTargetSpeed, getDistanceCategory, calculateReferenceHpConsumption } from "./speedCalculations";
import { TrainedCharaData } from "../../../data/TrainedCharaData";
import { getActiveSpeedModifier, getSkillBaseTime } from "./SkillDataUtils";

const BLOCKED_ICON = require("../../../data/umamusume_icons/blocked.png");

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

const overlayBox = (x: number, y: number, text: string) => ([
    {
        type: "rect",
        shape: { x, y, width: SPEED_BOX_WIDTH, height: SPEED_BOX_HEIGHT, r: 6 },
        style: { fill: SPEED_BOX_BG, stroke: SPEED_BOX_BORDER, lineWidth: 1 },
        z: 4,
        silent: true,
    },
    {
        type: "text",
        style: {
            x: x + SPEED_BOX_WIDTH / 2,
            y: y + SPEED_BOX_HEIGHT / 2,
            text,
            textAlign: "center",
            textVerticalAlign: "middle",
            fontSize: SPEED_BOX_FONT_SIZE,
            fill: SPEED_BOX_TEXT,
            opacity: 0.95,
            fontWeight: 700,
        },
        z: 5,
        silent: true,
    },
]);

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

export function buildHorsesCustomSeries(
    interpolated: InterpolatedFrame,
    displayNames: Record<number, string>,
    horseInfoByIdx: Record<number, any>,
    trainerColors: Record<number, string> | undefined,
    legendSelection: Record<string, boolean>,
    showSpeedBox: boolean,
    showAccelBox: boolean,
    accByIdx: Record<number, number>,
    showBlockedIcon: boolean,
    showHpBar: boolean,
    maxHpByIdx: Record<number, number>,
    goalInX: number,
    consumptionRateByIdx: Record<number, number>,
    trainedCharaByIdx: Record<number, TrainedCharaData>,
    oonigeByIdx: Record<number, boolean>,
    lastSpurtStartDistances: Record<number, number>,
    trackSlopes: any[],
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined,
    passiveStatModifiers: Record<number, { speed: number; stamina: number; power: number; guts: number; wisdom: number }> | undefined,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]> | undefined,
    courseId: number | undefined
) {
    const data: Array<{ name: string; value: [number, number, string, string, string, number, number, number, number, number, number, number, number] }> = [];

    // Pre-calculate distance category since it's same for all
    const distanceCategory = getDistanceCategory(goalInX);

    Object.entries(displayNames).forEach(([iStr, name]) => {
        if (legendSelection && legendSelection[name] === false) return;
        const i = +iStr, h = interpolated.horseFrame[i];
        if (!h) return;
        const info = horseInfoByIdx[i] ?? {}, teamColor = teamColorFor(i, info, trainerColors), iconUrl = getCharaIcon(info?.chara_id) ?? "";
        const isBlocked = showBlockedIcon && h.blockFrontHorseIndex != null && h.blockFrontHorseIndex !== -1 ? 1 : 0;
        const speed = h.speed ?? 0;
        const accel = accByIdx[i] ?? 0;
        const maxHp = maxHpByIdx[i] ?? 1;
        const hp = h.hp ?? 0;
        const rate = consumptionRateByIdx[i] ?? 0;

        // Target speed calculation
        let minTarget = 0, maxTarget = 0;
        const trainedChara = trainedCharaByIdx[i];
        if (trainedChara) {
            const currentDistance = h.distance ?? 0;
            const lastSpurtDist = lastSpurtStartDistances[i] ?? -1;
            const inLastSpurt = lastSpurtDist > 0 && currentDistance >= lastSpurtDist;

            // Get proficiency for this distance category
            const distProficiency = trainedChara.properDistances[distanceCategory] ?? 1;

            // Strategy
            const runningStyleStr = info.running_style ?? 0;
            const strategy = +runningStyleStr > 0 ? +runningStyleStr : (trainedChara.rawData?.param?.runningStyle ?? 1);

            const isOonige = oonigeByIdx[i] ?? false;

            // Uphill logic
            const currentSlopeObj = trackSlopes.find((s: any) => currentDistance >= s.start && currentDistance < s.start + s.length);
            const currentSlope = currentSlopeObj?.slope ?? 0;

            // Skill Effects
            const greenStats = passiveStatModifiers?.[i];

            let activeSpeedBuff = 0;
            if (skillActivations && skillActivations[i]) {
                const currentTime = interpolated.time;
                skillActivations[i].forEach(activation => {
                    const skillId = activation.param[1];
                    const baseTime = getSkillBaseTime(skillId);
                    if (baseTime > 0) {
                        const duration = (baseTime / 10000) * (goalInX / 1000);
                        if (currentTime >= activation.time && currentTime < activation.time + duration) {
                            activeSpeedBuff += getActiveSpeedModifier(skillId);
                        }
                    }
                });
            }

            // Competition Events (Spot Struggle, Dueling, Rushed)
            let isSpotStruggle = false;
            let isDueling = false;
            let isRushed = false;
            let rushedType = 0;
            const currentTime = interpolated.time;

            // Check temptation mode (Rushed)
            const tempMode = h.temptationMode ?? 0;
            if (tempMode > 0) {
                isRushed = true;
                if (tempMode === 4) rushedType = 2; // Rushed (Boost)
            }

            if (otherEvents && otherEvents[i]) {
                otherEvents[i].forEach(evt => {
                    if (currentTime >= evt.time && currentTime < evt.time + evt.duration) {
                        const name = evt.name || "";
                        if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) isSpotStruggle = true;
                        if (name.includes("Dueling") || name.includes("Competes (Speed)")) isDueling = true;
                        if (name.includes("Rushed")) {
                            isRushed = true;
                            if (name.includes("Boost")) rushedType = 2; // "Speed Up"
                        }
                    }
                });
            }

            const res = calculateTargetSpeed({
                courseDistance: goalInX,
                currentDistance,
                speedStat: trainedChara.speed,
                wisdomStat: trainedChara.wiz,
                powerStat: trainedChara.pow,
                strategy,
                distanceProficiency: distProficiency,
                mood: info?.motivation ?? 3,
                isOonige,
                inLastSpurt,
                slope: currentSlope,
                greenSkillBonuses: greenStats,
                activeSpeedBuff,
                courseId,
                gutsStat: trainedChara.guts,
                staminaStat: trainedChara.stamina,
                isSpotStruggle,
                isDueling,
                isRushed,
                rushedType
            });

            minTarget = res.min;
            maxTarget = res.max;
        }

        data.push({ name, value: [h.distance ?? 0, h.lanePosition ?? 0, name, teamColor, iconUrl, isBlocked, speed, accel, maxHp, hp, rate, minTarget, maxTarget] });
    });

    const renderItem = (params: any, api: any) => {
        const vX = api.value(0) as number, vY = api.value(1) as number; const [cx, cy] = api.coord([vX, vY]);
        const teamColor = (api.value(3) as string) || "#000", iconUrl = (api.value(4) as string) || "", isBlocked = !!api.value(5);
        const speedRaw = (api.value(6) as number) || 0;
        const accelRaw = (api.value(7) as number) || 0;
        const maxHp = (api.value(8) as number) || 1;
        const hp = (api.value(9) as number) || 0;
        const rate = (api.value(10) as number) || 0;
        const speedText = (speedRaw / 100).toFixed(2);
        const accelText = formatSigned(accelRaw);

        const children: any[] = [];

        if (iconUrl) {
            children.push({ type: "circle", shape: { cx: cx + BG_OFFSET_X_PX, cy: cy + BG_OFFSET_Y_PX, r: BG_SIZE / 2 }, style: { fill: teamColor }, silent: true, z: 0 });
            children.push({ type: "image", style: { image: iconUrl, x: cx - ICON_SIZE / 2, y: cy - ICON_SIZE / 2, width: ICON_SIZE, height: ICON_SIZE }, z: 1 });
        } else {
            children.push({ type: "circle", shape: { cx, cy, r: DOT_SIZE / 2 }, style: { fill: teamColor, stroke: "#000", lineWidth: 1 }, z: 0 });
        }

        if (isBlocked) {
            children.push({
                type: "image",
                style: {
                    image: BLOCKED_ICON,
                    x: cx + (iconUrl ? ICON_SIZE : DOT_SIZE) / 2 - BLOCKED_ICON_SIZE,
                    y: cy + (iconUrl ? ICON_SIZE : DOT_SIZE) / 2 - BLOCKED_ICON_SIZE,
                    width: BLOCKED_ICON_SIZE,
                    height: BLOCKED_ICON_SIZE,
                },
                silent: true,
                z: 3,
            });
        }

        const baseSize = iconUrl ? ICON_SIZE : DOT_SIZE;

        const speedRectX = cx - baseSize / 2 + OVERLAY_INSET;
        const speedRectY = cy + baseSize / 2 - SPEED_BOX_HEIGHT - OVERLAY_INSET;

        const accelRectX = speedRectX;
        const accelRectY = speedRectY - SPEED_BOX_HEIGHT - ACCEL_BOX_GAP_Y;

        if (showSpeedBox) children.push(...overlayBox(speedRectX, speedRectY, speedText));
        if (showAccelBox) children.push(...overlayBox(accelRectX, accelRectY, accelText));

        if (showHpBar) {
            const hpPct = Math.max(0, Math.min(1, hp / maxHp));
            const hpBarX = cx - HP_BAR_WIDTH / 2;

            const hpBarY = cy + baseSize / 2 + HP_BAR_GAP_Y;

            children.push({
                type: "rect",
                shape: { x: hpBarX, y: hpBarY, width: HP_BAR_WIDTH, height: HP_BAR_HEIGHT },
                style: { fill: HP_BAR_BG_COLOR },
                z: 6,
                silent: true,
            });
            children.push({
                type: "rect",
                shape: { x: hpBarX, y: hpBarY, width: HP_BAR_WIDTH * hpPct, height: HP_BAR_HEIGHT },
                style: { fill: HP_BAR_FILL_COLOR },
                z: 7,
                silent: true,
            });

            if (vX > (5 / 6) * goalInX) {
                const timeToEmpty = rate > 0 ? hp / rate : Number.POSITIVE_INFINITY;
                const estText = Number.isFinite(timeToEmpty) ? `${timeToEmpty.toFixed(1)}s` : "∞";

                children.push({
                    type: "text",
                    style: {
                        x: hpBarX + 1,
                        y: hpBarY - 2,
                        text: `${Math.round(hp)}`,
                        textAlign: "left",
                        textVerticalAlign: "bottom",
                        fontSize: 9,
                        fill: "#fff",
                        stroke: "#000",
                        lineWidth: 2,
                        fontWeight: "bold",
                    },
                    z: 8,
                    silent: true,
                });

                if (estText) {
                    children.push({
                        type: "text",
                        style: {
                            x: hpBarX + HP_BAR_WIDTH - 1,
                            y: hpBarY - 2,
                            text: estText,
                            textAlign: "right",
                            textVerticalAlign: "bottom",
                            fontSize: 9,
                            fill: "#fff",
                            stroke: "#000",
                            lineWidth: 2,
                            fontWeight: "bold",
                        },
                        z: 8,
                        silent: true,
                    });
                }
            }
        }

        return { type: "group", children };
    };

    const series: CustomSeriesOption = {
        id: "horses-custom",
        name: "Horses",
        type: "custom",
        coordinateSystem: "cartesian2d",
        renderItem: renderItem as any,
        data,
        animation: false,
        z: 5,
        tooltip: { trigger: "item" },
        encode: { x: 0, y: 1, itemName: 2 },
        silent: false,
    };
    return series;
}

export function buildSkillLabels(
    frame: any,
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]>,
    otherEvents: Record<number, { time: number; duration: number; name: string }[]>,
    time: number,
    horseInfoByIdx: Record<number, any>,
    trainerColors: Record<number, string> | undefined,
    displayNames: Record<number, string>,
    legendSelection: Record<string, boolean>,
    showHeuristics: boolean,
    trainedCharaByIdx: Record<number, TrainedCharaData>,
    oonigeByIdx: Record<number, boolean>,
    trackSlopes: any[],
    passiveStatModifiers: Record<number, { speed: number; stamina: number; power: number; guts: number; wisdom: number }> | undefined,
    goalInX: number,
    accByIdx: Record<number, number>,
    consumptionRateByIdx: Record<number, number>
) {
    const items: any[] = [];


    frame.horseFrame.forEach((h: any, i: number) => {
        if (!h) return;
        const name = displayNames[i];
        if (legendSelection && legendSelection[name] === false) return;

        const base: [number, number] = [h.distance ?? 0, h.lanePosition ?? 0];
        const info = horseInfoByIdx[i] ?? {};
        const teamColor = teamColorFor(i, info, trainerColors);
        const bgColor = mixWithWhite(teamColor, 0.9);
        const next = stackLabels(undefined, undefined, bgColor);
        const mode = h.temptationMode ?? 0;
        if (mode) { items.push({ value: base, id: `temptation-${i}-${mode}`, label: next(TEMPTATION_TEXT[mode] ?? "Rushed") }); }

        const currentSpeed = (h.speed ?? 0) / 100;
        const currentDistance = h.distance ?? 0;
        const currentSlopeObj = trackSlopes.find((s: any) => currentDistance >= s.start && currentDistance < s.start + s.length);
        const currentSlope = currentSlopeObj?.slope ?? 0;

        if (currentSlope < 0) {
            const rate = consumptionRateByIdx[i] ?? 0;
            const expected = calculateReferenceHpConsumption(currentSpeed, goalInX);

            if (expected > 0 && rate > 0 && rate < expected * 0.8) {
                items.push({ value: base, id: `downhill-${i}-${time}`, label: next("Downhill Mode") });
            }
        }



        (skillActivations[i] ?? [])
            .filter(s => { const dur = s.param?.[2]; const secs = dur > 0 ? dur / 10000 : 2; return time >= s.time && time < s.time + secs && !EXCLUDE_SKILL_RE.test(s.name); })
            .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
            .forEach((s) => items.push({ value: base, id: `skill-${i}-${s.time}-${s.name}`, label: next(s.name) }));
        (otherEvents[i] ?? [])
            .filter(e => time >= e.time && time < e.time + e.duration)
            .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
            .forEach((e) => items.push({ value: base, id: `other-${i}-${e.time}-${e.name}`, label: next(e.name) }));
    });
    return items;
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

                return `${has ? name + "<br/>" : ""}Distance: ${value[0].toFixed(2)}m<br/>Lane: ${Math.round(value[1])}<br/>Speed: ${speed.toFixed(2)} m/s<br/>Accel: ${accelStr} m/s²${hpStr}${targetStr}`;
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

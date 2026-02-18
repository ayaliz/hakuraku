import { useMemo } from "react";
type MarkLine1DDataItemOption = { xAxis?: number | string; name?: string; label?: object; lineStyle?: object };
import GameDataLoader from "../../../data/GameDataLoader";
import { clampRange } from "../RaceReplay.utils";
import { SLOPE_UP_FILL, SLOPE_DOWN_FILL, SLOPE_DIAG_LINE, SLOPE_HALF_RATIO } from "../RaceReplay.constants";

type AreaPair = [{ xAxis: number; yAxis: number }, { xAxis: number; yAxis: number }];

export function useCourseLayers(selectedTrackId: string | null, goalInX: number, yMaxWithHeadroom: number) {
    return useMemo(() => {
        const straights: AreaPair[] = [], corners: AreaPair[] = [], straightsFinal: AreaPair[] = [], cornersFinal: AreaPair[] = [];
        const segMarkers: MarkLine1DDataItemOption[] = [];
        const slopeTriangles: { value: [number, number, 1 | -1] }[] = [];
        const td = selectedTrackId ? (GameDataLoader.courseData as Record<string, any>)[selectedTrackId] : null;
        if (!td || goalInX <= 0) return { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles };

        const straightsSrc: { start: number; end: number }[] = [];
        const cornersSrc: { start: number; end: number }[] = [];

        (td.straights ?? []).forEach((s: any) => { const [st, ed] = clampRange(goalInX, s.start, s.end); if (ed > st) straightsSrc.push({ start: st, end: ed }); });
        (td.corners ?? []).forEach((c: any) => { const [st, ed] = clampRange(goalInX, c.start, c.length + c.start); if (ed > st) cornersSrc.push({ start: st, end: ed }); });

        const finalStraightStart = straightsSrc.length ? Math.max(...straightsSrc.map(s => s.start)) : -Infinity;
        const finalCornerStart = cornersSrc.length ? Math.max(...cornersSrc.map(s => s.start)) : -Infinity;
        const toArea = (seg: { start: number; end: number }): AreaPair => ([{ xAxis: seg.start, yAxis: 0 }, { xAxis: seg.end, yAxis: yMaxWithHeadroom }]);

        straightsSrc.forEach(seg => (seg.start === finalStraightStart ? straightsFinal : straights).push(toArea(seg)));
        cornersSrc.forEach(seg => (seg.start === finalCornerStart ? cornersFinal : corners).push(toArea(seg)));

        const ordered = [...straightsSrc.map(s => ({ ...s, type: "straight" as const })), ...cornersSrc.map(s => ({ ...s, type: "corner" as const }))].sort((a, b) => a.start - b.start);
        let sc = 0, cc = 0;
        ordered.forEach(seg => {
            if (seg.type === "straight") { sc++; const isFinal = seg.start === finalStraightStart; segMarkers.push({ xAxis: seg.start, name: isFinal ? "Final straight" : `Straight ${sc}`, lineStyle: { color: "#666", type: isFinal ? "solid" : "dashed" } }); }
            else { cc++; const isFinal = seg.start === finalCornerStart; segMarkers.push({ xAxis: seg.start, name: isFinal ? "Final corner" : `Corner ${cc}`, lineStyle: { color: "#666", type: isFinal ? "solid" : "dashed" } }); }
        });

        (td.slopes ?? []).forEach((s: any) => { const [st, ed] = clampRange(goalInX, s.start, s.start + s.length); if (ed > st) slopeTriangles.push({ value: [st, ed, s.slope > 0 ? 1 : -1] }); });
        return { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles };
    }, [selectedTrackId, goalInX, yMaxWithHeadroom]);
}

export function slopeRenderItemFactory(yMaxWithHeadroom: number) {
    return (params: any, api: any) => {
        const start = api.value(0) as number, end = api.value(1) as number, dir = api.value(2) as 1 | -1;
        const yTopVal = yMaxWithHeadroom * SLOPE_HALF_RATIO;
        const pBL = api.coord([start, 0]), pBR = api.coord([end, 0]), pTLh = api.coord([start, yTopVal]), pTRh = api.coord([end, yTopVal]);
        const isUp = dir === 1, triangle = isUp ? [pBL, pBR, pTRh] : [pBL, pTLh, pBR], diagStart = isUp ? pBL : pTLh, diagEnd = isUp ? pTRh : pBR, fill = isUp ? SLOPE_UP_FILL : SLOPE_DOWN_FILL;
        return {
            type: "group",
            children: [
                { type: "polygon", shape: { points: triangle }, style: { fill, stroke: null }, silent: true },
                { type: "line", shape: { x1: diagStart[0], y1: diagStart[1], x2: diagEnd[0], y2: diagEnd[1] }, style: { stroke: SLOPE_DIAG_LINE, lineWidth: 2, opacity: 0.9 }, silent: true }
            ]
        };
    };
}

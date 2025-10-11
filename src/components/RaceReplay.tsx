import EChartsReactCore from "echarts-for-react/lib/core";
import {
  ScatterChart,
  ScatterSeriesOption,
  CustomChart,
  CustomSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  GridComponentOption,
  LegendComponent,
  LegendComponentOption,
  TooltipComponent,
  TooltipComponentOption,
  MarkLineComponent,
  MarkLineComponentOption,
  MarkAreaComponent,
  MarkAreaComponentOption,
  GraphicComponent,
  GraphicComponentOption,
} from "echarts/components";
import * as echarts from "echarts/core";
import { ComposeOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import type { MarkLine1DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { RaceSimulateData } from "../data/race_data_pb";
import cups from "../data/tracks/cups.json";
import courseData from "../data/tracks/course_data.json";
import trackNames from "../data/tracks/tracknames.json";

const BLOCKED_ICON = require("../data/umamusume_icons/blocked.png");

echarts.use([
  ScatterChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
  CustomChart,
  GraphicComponent,
]);

type ECOption = ComposeOption<
  | ScatterSeriesOption
  | TooltipComponentOption
  | GridComponentOption
  | LegendComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | CustomSeriesOption
  | GraphicComponentOption
>;

type RaceReplayProps = {
  raceData: RaceSimulateData;
  raceHorseInfo: any[];
  displayNames: Record<number, string>;
  skillActivations: Record<number, { time: number; name: string; param: number[] }[]>;
  trainerColors?: Record<number, string>;
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clampRange = (goal: number, s: number, e: number) => [clamp(s, 0, goal), clamp(e, 0, goal)] as const;

function bisectFrameIndex(frames: RaceSimulateData["frame"], t: number): number {
  if (!frames.length) return 0;
  const last = frames.length - 1;
  if (t <= (frames[0].time ?? 0)) return 0;
  if (t >= (frames[last].time ?? 0)) return last;
  let lo = 0, hi = last;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tm = frames[mid].time ?? 0;
    if (tm <= t) {
      if (t < (frames[mid + 1].time ?? tm)) return mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return lo;
}

const labelStyle = (offsetY: number) => ({
  show: true,
  position: "top" as const,
  offset: [0, -offsetY],
  padding: [4, 6],
  backgroundColor: "#fff",
  borderColor: "#000",
  borderWidth: 1,
  borderRadius: 5,
  color: "#000",
  fontSize: 12,
});

const SURFACE_MAP: Record<number, string> = { 1: "Turf", 2: "Dirt" };

const STACK_BASE_PX = 24;
const STACK_GAP_PX = 22;
const ICON_SIZE = 64;
const BG_SIZE = 52;
const BG_OFFSET_X_PX = 0;
const BG_OFFSET_Y_PX = 3;
const DOT_SIZE = 52;
const BLOCKED_ICON_SIZE = 24;

const DEFAULT_TEAM_PALETTE = [
  "#2563EB","#16A34A","#DC2626","#9333EA","#EA580C","#0891B2",
  "#DB2777","#4F46E5","#059669","#B45309","#0EA5E9","#C026D3",
];

const STRAIGHT_FILL = "rgba(59, 130, 246, 0.12)";
const CORNER_FILL = "rgba(251, 146, 60, 0.12)";
const STRAIGHT_FINAL_FILL = "rgba(59, 130, 246, 0.22)";
const CORNER_FINAL_FILL = "rgba(251, 146, 60, 0.22)";

const SLOPE_UP_FILL = "rgba(255, 221, 221, 0.28)";
const SLOPE_DOWN_FILL = "rgba(221, 221, 255, 0.28)";
const SLOPE_DIAG_LINE = "rgba(0,0,0,0.35)";
const SLOPE_HALF_RATIO = 0.2;

const EXCLUDE_SKILL_RE = /(standard\s*distance|-handed|savvy|days|conditions| runner| racecourse|target in sight|focus|concentration)/i;
const TEMPTATION_TEXT: Record<number, string> = {
  1: "Rushed (Late)",
  2: "Rushed (Pace)",
  3: "Rushed (Front)",
  4: "Rushed (Speed up)",
};

const TOOLBAR_GAP = 12;           // px between groups (label+select, status, legend)
const TOOLBAR_INLINE_GAP = 8;     // px between label and select
const LEGEND_ITEM_GAP_X = 12;     // px between legend items
const LEGEND_ITEM_GAP_Y = 6;      // px between legend rows
const LEGEND_SWATCH_GAP = 6;      // px between swatch and text

function useRafPlayer(start: number, end: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(start);
  const raf = useRef<number>();
  const last = useRef<number>();
  const tRef = useRef(time);
  const sRef = useRef(start);
  const eRef = useRef(end);
  const pRef = useRef(isPlaying);

  useEffect(() => { sRef.current = start; eRef.current = end; }, [start, end]);
  useEffect(() => { pRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { tRef.current = time; }, [time]);

  useEffect(() => {
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      if (pRef.current) {
        const dt = (now - last.current) / 1000;
        last.current = now;
        const next = Math.min(tRef.current + dt, eRef.current);
        if (next !== tRef.current) setTime(next);
        if (next >= eRef.current) setIsPlaying(false);
      } else {
        last.current = now;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const playPause = () => {
    if (!isPlaying && Math.abs(tRef.current - eRef.current) < 1e-6) setTime(sRef.current);
    setIsPlaying(p => !p);
  };

  return { time, setTime, isPlaying, setIsPlaying, playPause };
}

function useInterpolatedFrame(frames: RaceSimulateData["frame"], renderTime: number) {
  return useMemo(() => {
    if (!frames.length) return { time: 0, horseFrame: [] as any[] };
    const i = bisectFrameIndex(frames, renderTime);
    const f0 = frames[i];
    const f1 = frames[i + 1] ?? f0;
    const t0 = f0.time ?? 0, t1 = f1.time ?? t0;
    const a = i < frames.length - 1 ? clamp01((renderTime - t0) / Math.max(1e-9, t1 - t0)) : 0;
    const count = Math.min(f0.horseFrame.length, f1.horseFrame.length);

    const horseFrame = Array.from({ length: count }, (_, idx) => {
      const h0 = f0.horseFrame[idx];
      const h1 = f1.horseFrame[idx] ?? h0;
      const take = a >= 0.5;
      return {
        distance: lerp(h0.distance ?? 0, h1.distance ?? 0, a),
        lanePosition: lerp(h0.lanePosition ?? 0, h1.lanePosition ?? 0, a),
        speed: lerp(h0.speed ?? 0, h1.speed ?? 0, a),
        hp: lerp(h0.hp ?? 0, h1.hp ?? 0, a),
        temptationMode: (take ? h1 : h0).temptationMode,
        blockFrontHorseIndex: (take ? h1 : h0).blockFrontHorseIndex,
      };
    });
    return { time: lerp(t0, t1, a), horseFrame };
  }, [frames, renderTime]);
}

function useAvailableTracks(goalInX: number) {
  return useMemo(() => {
    if (!goalInX) return [] as { id: string; name: string; raceTrackId: number; surface: number }[];
    return Object.entries(courseData as Record<string, any>)
      .filter(([, d]) => d.distance === goalInX)
      .map(([id, d]) => {
        const trackName = (trackNames as Record<string, string[]>)[d.raceTrackId]?.[1] ?? "Unknown";
        const surface = SURFACE_MAP[d.surface] ?? "Unknown";
        const suffix = d.course === 2 ? " (inner)" : d.course === 3 ? " (outer)" : "";
        return { id, name: `${trackName} ${surface} ${d.distance}m${suffix}`, raceTrackId: d.raceTrackId, surface: d.surface };
      });
  }, [goalInX]);
}

function useGuessTrack(goalInX: number, availableTracks: { id: string; raceTrackId: number; surface: number }[]) {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [guessStatus, setGuessStatus] = useState<"guessed" | "fallback" | "none">("none");

  useEffect(() => {
    if (!goalInX || availableTracks.length === 0) { setSelectedTrackId(null); setGuessStatus("none"); return; }

    const now = new Date();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    const relevant = (cups.cups as any[])
      .filter((c: any) => c.distance === goalInX)
      .map((c: any) => ({ ...c, date: new Date(c.date) }))
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

    const past = relevant.filter(c => c.date <= now);
    const future = relevant.filter(c => c.date > now);

    let guess: any = null;
    if (past.length) {
      const last = past[past.length - 1];
      if (now.getTime() - last.date.getTime() < twoWeeksMs) guess = last;
    }
    if (!guess) guess = future[0] ?? past[past.length - 1] ?? null;

    if (guess) {
      const trackName = guess.track;
      const surface = guess.surface;
      const entry = Object.entries(trackNames as Record<string, string[]>).find(([, names]) => names[1] === trackName);
      if (entry) {
        const raceTrackId = parseInt(entry[0], 10);
        const match = availableTracks.find(t => t.raceTrackId === raceTrackId && t.surface === surface);
        if (match) { setSelectedTrackId(match.id); setGuessStatus("guessed"); return; }
      }
    }

    if (availableTracks.length) { setSelectedTrackId(availableTracks[0].id); setGuessStatus("fallback"); }
    else { setSelectedTrackId(null); setGuessStatus("none"); }
  }, [goalInX, availableTracks]);

  return { selectedTrackId, setSelectedTrackId, guessStatus };
}

function useCourseLayers(selectedTrackId: string | null, goalInX: number, yMaxWithHeadroom: number) {
  type AreaPair = [{ xAxis: number; yAxis: number }, { xAxis: number; yAxis: number }];
  return useMemo(() => {
    const straights: AreaPair[] = [];
    const corners: AreaPair[] = [];
    const straightsFinal: AreaPair[] = [];
    const cornersFinal: AreaPair[] = [];
    const segMarkers: MarkLine1DDataItemOption[] = [];
    const slopeTriangles: { value: [number, number, 1 | -1] }[] = [];

    const trackData = selectedTrackId ? (courseData as Record<string, any>)[selectedTrackId] : null;
    if (!trackData || goalInX <= 0) return { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles };

    const straightsSrc: { start: number; end: number }[] = [];
    const cornersSrc: { start: number; end: number }[] = [];

    (trackData.straights ?? []).forEach((s: any) => {
      const [st, ed] = clampRange(goalInX, s.start, s.end);
      if (ed > st) straightsSrc.push({ start: st, end: ed });
    });
    (trackData.corners ?? []).forEach((c: any) => {
      const [st, ed] = clampRange(goalInX, c.start, c.start + c.length);
      if (ed > st) cornersSrc.push({ start: st, end: ed });
    });

    const finalStraightStart = straightsSrc.length ? Math.max(...straightsSrc.map(s => s.start)) : -Infinity;
    const finalCornerStart = cornersSrc.length ? Math.max(...cornersSrc.map(s => s.start)) : -Infinity;

    const toArea = (seg: { start: number; end: number }): AreaPair => ([{ xAxis: seg.start, yAxis: 0 }, { xAxis: seg.end, yAxis: yMaxWithHeadroom }]);

    straightsSrc.forEach(seg => (seg.start === finalStraightStart ? straightsFinal : straights).push(toArea(seg)));
    cornersSrc.forEach(seg => (seg.start === finalCornerStart ? cornersFinal : corners).push(toArea(seg)));

    const ordered = [
      ...straightsSrc.map(s => ({ ...s, type: "straight" as const })),
      ...cornersSrc.map(s => ({ ...s, type: "corner" as const })),
    ].sort((a, b) => a.start - b.start);

    let sc = 0, cc = 0;
    ordered.forEach(seg => {
      if (seg.type === "straight") {
        sc++;
        const isFinal = seg.start === finalStraightStart;
        segMarkers.push({ xAxis: seg.start, name: isFinal ? "Final straight" : `Straight ${sc}`, lineStyle: { color: "#666", type: isFinal ? "solid" : "dashed" } });
      } else {
        cc++;
        const isFinal = seg.start === finalCornerStart;
        segMarkers.push({ xAxis: seg.start, name: isFinal ? "Final corner" : `Corner ${cc}`, lineStyle: { color: "#666", type: isFinal ? "solid" : "dashed" } });
      }
    });

    (trackData.slopes ?? []).forEach((s: any) => {
      const [st, ed] = clampRange(goalInX, s.start, s.start + s.length);
      if (ed > st) slopeTriangles.push({ value: [st, ed, s.slope > 0 ? 1 : -1] });
    });

    return { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles };
  }, [selectedTrackId, goalInX, yMaxWithHeadroom]);
}

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span
    className="d-inline-flex align-items-center"
    style={{
      whiteSpace: "nowrap",
      marginRight: LEGEND_ITEM_GAP_X,
      marginBottom: LEGEND_ITEM_GAP_Y,
    }}
  >
    <span
      style={{
        width: 12,
        height: 12,
        background: color,
        border: "1px solid #888",
        display: "inline-block",
        marginRight: LEGEND_SWATCH_GAP,
        borderRadius: 2,
      }}
    />
    <span style={{ fontSize: 12 }}>{label}</span>
  </span>
);

function teamColorFor(idx: number, info: any, trainerColors?: Record<number, string>) {
  const trainerId = info?.trainer_id ?? info?.trainerId ?? info?.owner_id ?? info?.team_id ?? null;
  const paletteIndex = (typeof trainerId === "number" ? Math.abs(trainerId) : idx) % DEFAULT_TEAM_PALETTE.length;
  return (trainerId != null && trainerColors?.[trainerId]) || DEFAULT_TEAM_PALETTE[paletteIndex];
}

function buildHorseSeries(interpolated: any, displayNames: Record<number, string>, horseInfoByIdx: Record<number, any>, trainerColors?: Record<number, string>) {
  const arr: any[] = [];
  Object.entries(displayNames).forEach(([iStr, name]) => {
    const i = +iStr;
    const h = interpolated.horseFrame[i];
    if (!h) return;
    const point: [number, number] = [h.distance ?? 0, h.lanePosition ?? 0];
    const info = horseInfoByIdx[i] ?? {};
    const teamColor = teamColorFor(i, info, trainerColors);

    let icon: string | null = null;
    const charaId = info?.chara_id;
    if (charaId != null) {
      try { icon = require(`../data/umamusume_icons/chr_icon_${charaId}.png`); } catch { icon = null; }
    }

    if (icon) {
      arr.push(
        { id: `horse-bg-${i}`, name, type: "scatter" as const, symbol: "circle", symbolSize: BG_SIZE, symbolOffset: [BG_OFFSET_X_PX, BG_OFFSET_Y_PX], data: [point], itemStyle: { color: teamColor }, animation: false, z: 4, silent: true, tooltip: { show: false } },
        { id: `horse-${i}`, name, type: "scatter" as const, symbol: `image://${icon}` as const, symbolSize: ICON_SIZE, data: [point], animation: false, z: 5 },
      );
    } else {
      arr.push({ id: `horse-dot-${i}`, name, type: "scatter" as const, symbol: "circle", symbolSize: DOT_SIZE, data: [point], itemStyle: { color: teamColor, borderColor: "#000", borderWidth: 1 }, animation: false });
    }

    const isBlocked = h.blockFrontHorseIndex != null && h.blockFrontHorseIndex !== -1;
    arr.push({ id: `horse-blocked-${i}`, name: `${name} (Blocked)`, type: "scatter" as const, symbol: `image://${BLOCKED_ICON}` as const, symbolSize: BLOCKED_ICON_SIZE, symbolOffset: [ICON_SIZE / 2 - BLOCKED_ICON_SIZE / 2, ICON_SIZE / 2 - BLOCKED_ICON_SIZE / 2], data: isBlocked ? [point] : [], animation: false, z: 6, zlevel: 1, silent: true, tooltip: { show: false }, clip: true });
  });
  return arr;
}

function buildSkillLabels(frame: any, skillActivations: RaceReplayProps["skillActivations"], time: number) {
  const items: any[] = [];
  frame.horseFrame.forEach((h: any, i: number) => {
    if (!h) return;
    const base: [number, number] = [h.distance ?? 0, h.lanePosition ?? 0];

    let stack = 0;
    const mode = h.temptationMode ?? 0;
    if (mode) {
      items.push({ value: base, id: `temptation-${i}-${mode}`, label: { ...labelStyle(STACK_BASE_PX), formatter: TEMPTATION_TEXT[mode] ?? "Rushed" } });
      stack = 1;
    }

    (skillActivations[i] ?? [])
      .filter(s => {
        const dur = s.param?.[2];
        const secs = dur === -1 ? 2 : (dur ?? 0) / 10000;
        return time >= s.time && time < s.time + secs && !EXCLUDE_SKILL_RE.test(s.name);
      })
      .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
      .forEach((s, k) => items.push({ value: base, id: `skill-${i}-${s.time}-${s.name}`, label: { ...labelStyle(STACK_BASE_PX + (stack + k) * STACK_GAP_PX), formatter: s.name } }));
  });
  return items;
}

/** Build smooth-scrolling labels for course/race markers (Goal In, straights/corners, slopes, etc.) */
function buildCourseLabelItems(
  markers: MarkLine1DDataItemOption[],
  yTop: number
) {
  return (markers ?? [])
    .filter(
      (m): m is MarkLine1DDataItemOption & { xAxis: number; name: string } =>
        typeof (m as any).xAxis === "number" && !!(m as any).name
    )
    .map((m, idx) => ({
      id: `course-label-${idx}`,
      value: [(m as any).xAxis as number, yTop],
      label: {
        ...labelStyle(10),
        position: "top",
        formatter: (m as any).name,
      },
    }));
}

function buildMarkLines(goalInX: number, raceData: RaceSimulateData, displayNames: Record<number, string>, segmentMarkers: MarkLine1DDataItemOption[], trackData?: any) {
  const lines: MarkLine1DDataItemOption[] = [];
  if (goalInX > 0) {
    lines.push(
      { xAxis: goalInX, name: "Goal In", lineStyle: { color: "#666", type: [8, 3, 1, 3] } },
      { xAxis: (10 / 24) * goalInX, name: "Position Keep ends", lineStyle: { color: "#777", type: "dashed" } },
      { xAxis: (4 / 24) * goalInX, name: "Mid race", lineStyle: { color: "#999", type: "dashed" } },
    );
  }
  (raceData.horseResult ?? []).forEach((hr, i) => {
    if (hr?.lastSpurtStartDistance != null && hr.lastSpurtStartDistance > 0) {
      const nm = displayNames[i] || `Horse ${i + 1}`;
      lines.push({ xAxis: hr.lastSpurtStartDistance, name: `Last Spurt (${nm})`, lineStyle: { color: "#666", type: [8, 3] } });
    }
  });

  lines.push(...segmentMarkers);

  (trackData?.slopes ?? []).forEach((s: any) => {
    const pct = Math.abs((s.slope ?? 0) / 10000).toFixed(2) + "%";
    const dir = s.slope > 0 ? "Uphill" : s.slope < 0 ? "Downhill" : "Flat";
    lines.push({ xAxis: s.start, name: `${dir} ${pct}`, lineStyle: { color: s.slope > 0 ? "#ffcccc" : s.slope < 0 ? "#ccccff" : "#dddddd", type: "solid" } });
  });

  return lines;
}

const noTooltipScatter = (id: string, markArea?: any) => ({ id, type: "scatter" as const, data: [], symbolSize: 0, silent: true, z: 0, tooltip: { show: false }, markArea });

function slopeRenderItemFactory(yMaxWithHeadroom: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (params: any, api: any) => {
    const start = api.value(0) as number;
    const end = api.value(1) as number;
    const dir = api.value(2) as 1 | -1;

    const yTopVal = yMaxWithHeadroom * SLOPE_HALF_RATIO;

    const pBL = api.coord([start, 0]);
    const pBR = api.coord([end, 0]);
    const pTLh = api.coord([start, yTopVal]);
    const pTRh = api.coord([end, yTopVal]);

    const isUp = dir === 1;
    const triangle = isUp ? [pBL, pBR, pTRh] : [pBL, pTLh, pBR];
    const diagStart = isUp ? pBL : pTLh;
    const diagEnd = isUp ? pTRh : pBR;
    const fill = isUp ? SLOPE_UP_FILL : SLOPE_DOWN_FILL;

    return {
      type: "group",
      children: [
        { type: "polygon", shape: { points: triangle }, style: api.style({ fill, stroke: null }), silent: true },
        { type: "line", shape: { x1: diagStart[0], y1: diagStart[1], x2: diagEnd[0], y2: diagEnd[1] }, style: { stroke: SLOPE_DIAG_LINE, lineWidth: 2, opacity: 0.9 }, silent: true },
      ],
    };
  };
}

const RaceReplay: React.FC<RaceReplayProps> = ({ raceData, raceHorseInfo, displayNames, skillActivations, trainerColors, }) => {
  const frames = useMemo(() => raceData.frame ?? [], [raceData]);
  const startTime = frames[0]?.time ?? 0;
  const endTime = frames[frames.length - 1]?.time ?? 0;

  const { time: renderTime, setTime: setRenderTime, isPlaying, playPause } = useRafPlayer(startTime, endTime);

  const goalInX = useMemo(() => {
    let winnerIndex = -1; let winnerFinish = Number.POSITIVE_INFINITY;
    (raceData.horseResult ?? []).forEach((hr, idx) => { const t = hr?.finishTimeRaw; if (typeof t === "number" && t > 0 && t < winnerFinish) { winnerFinish = t; winnerIndex = idx; } });
    if (winnerIndex >= 0 && frames.length && isFinite(winnerFinish)) {
      const i = bisectFrameIndex(frames, winnerFinish);
      const d0 = frames[i]?.horseFrame?.[winnerIndex]?.distance ?? 0;
      return Math.round(d0 / 100) * 100;
    }
    return 0;
  }, [frames, raceData.horseResult]);

  const availableTracks = useAvailableTracks(goalInX);
  const { selectedTrackId, setSelectedTrackId, guessStatus } = useGuessTrack(goalInX, availableTracks);

  const maxLanePosition = useMemo(() => frames.reduce((m, f) => {
    const local = (f.horseFrame ?? []).reduce((mm: number, h: any) => Math.max(mm, h?.lanePosition ?? 0), 0);
    return Math.max(m, local);
  }, 0), [frames]);

  const interpolatedFrame = useInterpolatedFrame(frames, renderTime);

  const frontRunnerDistance = interpolatedFrame.horseFrame.reduce((m: number, h: any) => Math.max(m, h?.distance ?? 0), 0);
  const cameraWindow = 50, cameraLead = 8;
  const xAxis = useMemo(() => ({ min: Math.max(0, Math.max(cameraWindow, frontRunnerDistance + cameraLead) - cameraWindow), max: Math.max(cameraWindow, frontRunnerDistance + cameraLead) }), [frontRunnerDistance]);

  const horseInfoByIdx = useMemo(() => {
    const map: Record<number, any> = {};
    (raceHorseInfo ?? []).forEach((h: any) => { const idx = (h.frame_order ?? h.frameOrder) - 1; if (idx >= 0) map[idx] = h; });
    return map;
  }, [raceHorseInfo]);

  const seriesData = useMemo(() => buildHorseSeries(interpolatedFrame, displayNames, horseInfoByIdx, trainerColors), [interpolatedFrame, displayNames, horseInfoByIdx, trainerColors]);

  const yMaxWithHeadroom = maxLanePosition + 3;

  const skillLabelData = useMemo(() => buildSkillLabels(interpolatedFrame, skillActivations, renderTime), [interpolatedFrame, skillActivations, renderTime]);

  const { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles } = useCourseLayers(selectedTrackId, goalInX, yMaxWithHeadroom);

  const raceMarkers = useMemo(() => {
    const trackData = selectedTrackId ? (courseData as Record<string, any>)[selectedTrackId] : undefined;
    return buildMarkLines(goalInX, raceData, displayNames, segMarkers, trackData);
  }, [goalInX, raceData, displayNames, segMarkers, selectedTrackId]);

  const courseLabelData = useMemo(
    () => buildCourseLabelItems(raceMarkers as MarkLine1DDataItemOption[], yMaxWithHeadroom),
    [raceMarkers, yMaxWithHeadroom]
  );

  const bgSeries = useMemo(() => [
    { id: "bg-straights", fill: STRAIGHT_FILL, data: straights },
    { id: "bg-corners", fill: CORNER_FILL, data: corners },
    { id: "bg-straights-final", fill: STRAIGHT_FINAL_FILL, data: straightsFinal },
    { id: "bg-corners-final", fill: CORNER_FINAL_FILL, data: cornersFinal },
  ].map(({ id, fill, data }) => noTooltipScatter(id, { silent: true, itemStyle: { color: fill }, label: { show: false }, data })), [straights, corners, straightsFinal, cornersFinal]);

  const slopeRenderItem = useMemo(() => slopeRenderItemFactory(yMaxWithHeadroom), [yMaxWithHeadroom]);

  const markerSeries = useMemo(() => ({
    id: "race-markers",
    type: "scatter" as const,
    data: [],
    silent: true,
    z: 1,
    tooltip: { show: false },
    markLine: {
      animation: false,
      symbol: "none",
      label: { show: false },
      lineStyle: { type: "solid" },
      data: raceMarkers,
    },
  }), [raceMarkers]);

  const options: ECOption = {
    xAxis: {
      type: "value",
      min: xAxis.min,
      max: xAxis.max,
      name: "Distance",
      axisLabel: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: { type: "value", min: 0, max: yMaxWithHeadroom, name: "Lane Position" , splitLine: { show: false }},
    legend: { show: true, data: Object.values(displayNames) },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: any) => {
        const { name, value } = p;
        const has = typeof name === "string" && name.length > 0;
        return `${has ? name + "<br/>" : ""}Distance: ${value[0].toFixed(2)}m<br/>Lane: ${Math.round(value[1])}`;
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
            text: `${Math.round(xAxis.max)} m`,
            fontSize: 14,
            fontWeight: 700,
            fill: "#000",
            backgroundColor: "#fff",
            borderColor: "#000",
            borderWidth: 1,
            borderRadius: 6,
            padding: [4, 8],
          },
        },
      ],
    },

    series: [
      ...bgSeries,
      { id: "slope-diagonals", type: "custom", renderItem: slopeRenderItem as any, data: slopeTriangles, coordinateSystem: "cartesian2d", silent: true, clip: true, z: 2, zlevel: 0, tooltip: { show: false } },
      markerSeries,
      ...seriesData,
      {
        id: "course-labels",
        type: "scatter",
        data: courseLabelData,
        symbolSize: 0,
        z: 9,
        zlevel: 1,
        animation: false,
        silent: true,
        tooltip: { show: false },
        clip: false,
        labelLayout: { moveOverlap: "shiftY" as const },
      },
      {
        id: "skills-overlay",
        type: "scatter",
        data: skillLabelData,
        symbolSize: 0,
        z: 10,
        zlevel: 1,
        animation: false,
        silent: true,
        tooltip: { show: false },
      },
    ],
    animation: false,
  };

  const clampedRenderTime = clamp(renderTime, startTime, endTime);

  return (
    <div>
      {goalInX > 0 && availableTracks.length > 0 && (
        <div
          className="d-flex align-items-center"
          style={{
            flexWrap: "wrap",
            marginBottom: TOOLBAR_GAP,
          }}
        >
          <div
            className="d-flex align-items-center"
            style={{
              marginRight: TOOLBAR_GAP,
              marginBottom: TOOLBAR_GAP,
            }}
          >
            <Form.Label className="mb-0" style={{ marginRight: TOOLBAR_INLINE_GAP }}>
              Track:
            </Form.Label>
            <Form.Control
              as="select"
              value={selectedTrackId ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedTrackId(e.target.value)
              }
              style={{ width: "auto", maxWidth: 300 }}
            >
              {availableTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Form.Control>
          </div>

          {/* Guess/fallback badges */}
          {guessStatus === "guessed" && (
            <span
              style={{
                color: "green",
                marginRight: TOOLBAR_GAP,
                marginBottom: TOOLBAR_GAP,
              }}
            >
              Guessed track based on CM schedule
            </span>
          )}
          {guessStatus === "fallback" && (
            <span
              style={{
                color: "darkorange",
                marginRight: TOOLBAR_GAP,
                marginBottom: TOOLBAR_GAP,
              }}
            >
              Select track
            </span>
          )}

          {/* Legend (push right on wide screens; still wraps on small) */}
          <div
            className="d-flex align-items-center"
            style={{
              marginLeft: "auto",
              flexWrap: "wrap",
              marginBottom: TOOLBAR_GAP,
            }}
          >
            <LegendItem color={STRAIGHT_FILL} label="Straight" />
            <LegendItem color={STRAIGHT_FINAL_FILL} label="Final straight" />
            <LegendItem color={CORNER_FILL} label="Corner" />
            <LegendItem color={CORNER_FINAL_FILL} label="Final corner" />
          </div>
        </div>
      )}

      <EChartsReactCore
        echarts={echarts}
        option={options}
        style={{ height: "500px" }}
        notMerge={false}
        lazyUpdate={true}
      />

      <div className="d-flex justify-content-center align-items-center">
        <Button onClick={playPause} className="me-3">{isPlaying ? "Pause" : "Play"}</Button>

        <Form.Control
          type="range"
          min={startTime}
          max={endTime}
          step={0.001}
          value={clampedRenderTime}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenderTime(clamp(parseFloat(e.target.value), startTime, endTime))}
          style={{ flexGrow: 1 }}
        />

        <span className="ms-3">{clampedRenderTime.toFixed(2)}s / {endTime.toFixed(2)}s</span>
      </div>
    </div>
  );
};

export default RaceReplay;

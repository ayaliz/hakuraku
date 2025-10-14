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
import React, { useState, useEffect, useMemo, useRef, useReducer } from "react";
import { Button, Form, OverlayTrigger, Popover } from "react-bootstrap";
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
  infoTitle?: string;
  infoContent?: React.ReactNode;
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clampRange = (goal: number, s: number, e: number) => [clamp(s, 0, goal), clamp(e, 0, goal)] as const;
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

const SPEED_BOX_WIDTH = 44;
const SPEED_BOX_HEIGHT = 20;
const SPEED_BOX_BG = "rgba(255,255,255,0.4)";
const SPEED_BOX_BORDER = "rgba(0,0,0,1)";
const SPEED_BOX_TEXT = "#000";
const SPEED_BOX_FONT_SIZE = 12;
const OVERLAY_INSET = 9;
const ACCEL_BOX_GAP_Y = 1;

const DEFAULT_TEAM_PALETTE = [
  "#2563EB","#16A34A","#DC2626","#9333EA","#EA580C","#0891B2",
  "#DB2777","#4F46E5","#059669","#B45309","#0EA5E9","#C026D3",
];

const STRAIGHT_FILL = "rgba(79, 109, 122, 0.32)";
const CORNER_FILL = "rgba(192, 139, 91, 0.30)";
const STRAIGHT_FINAL_FILL = "rgba(14, 42, 71, 0.38)";
const CORNER_FINAL_FILL = "rgba(122, 59, 18, 0.36)";

const SLOPE_UP_FILL = "rgba(255, 221, 221, 0.28)";
const SLOPE_DOWN_FILL = "rgba(221, 221, 255, 0.28)";
const SLOPE_DIAG_LINE = "rgba(0,0,0,0.35)";
const SLOPE_HALF_RATIO = 0.2;

const EXCLUDE_SKILL_RE = /(standard\s*distance|-handed|savvy|days|conditions| runner| racecourse|target in sight|focus|concentration)/i;
const TEMPTATION_TEXT: Record<number, string> = { 1: "Rushed (Late)", 2: "Rushed (Pace)", 3: "Rushed (Front)", 4: "Rushed (Speed up)" };

const TOOLBAR_GAP = 12;
const TOOLBAR_INLINE_GAP = 8;
const LEGEND_ITEM_GAP_X = 12;
const LEGEND_ITEM_GAP_Y = 6;
const LEGEND_SWATCH_GAP = 6;

const ICON_CACHE = new Map<number, string | null>();
const getCharaIcon = (charaId?: number | null) => {
  if (charaId == null) return null;
  if (ICON_CACHE.has(charaId)) return ICON_CACHE.get(charaId)!;
  let url: string | null = null;
  try { url = require(`../data/umamusume_icons/chr_icon_${charaId}.png`); } catch { url = null; }
  ICON_CACHE.set(charaId, url);
  return url;
};

function formatSigned(x: number) { const v = x / 100; const s = v.toFixed(2); return (v > 0 ? "+" : "") + s; }

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

function stackLabels(baseOffset = STACK_BASE_PX, gap = STACK_GAP_PX) {
  let n = 0;
  return (text: string) => ({ ...labelStyle(baseOffset + n++ * gap), formatter: text });
}

type Toggles = { speed: boolean; accel: boolean; skills: boolean; slopes: boolean; blocked: boolean; course: boolean };
function useToggles(initial?: Partial<Toggles>) {
  const [t, set] = useReducer(
    (s: Toggles, a: Partial<Toggles>) => ({ ...s, ...a }),
    { speed: false, accel: false, skills: true, slopes: true, blocked: true, course: true, ...(initial || {}) }
  );
  const bind = (k: keyof Toggles) => ({
    checked: t[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.checked } as Partial<Toggles>),
  });
  return { t, bind };
}

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

function useRafPlayer(start: number, end: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(start);
  const raf = useRef<number>();
  const last = useRef<number>();
  const tRef = useRef(time), sRef = useRef(start), eRef = useRef(end), pRef = useRef(isPlaying);
  useEffect(() => { sRef.current = start; eRef.current = end; }, [start, end]);
  useEffect(() => { pRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { tRef.current = time; }, [time]);
  useEffect(() => {
    const tick = (now: number) => {
      if (last.current == null) last.current = now;
      if (pRef.current) {
        const dt = (now - last.current) / 1000, next = Math.min(tRef.current + dt, eRef.current);
        last.current = now; if (next !== tRef.current) setTime(next); if (next >= eRef.current) setIsPlaying(false);
      } else last.current = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  const playPause = () => { if (!isPlaying && Math.abs(tRef.current - eRef.current) < 1e-6) setTime(sRef.current); setIsPlaying(p => !p); };
  return { time, setTime, isPlaying, setIsPlaying, playPause };
}

type InterpolatedFrame = { time: number; horseFrame: any[]; frameIndex: number };

function useInterpolatedFrame(frames: RaceSimulateData["frame"], renderTime: number): InterpolatedFrame {
  return useMemo<InterpolatedFrame>(() => {
    if (!frames.length) return { time: 0, horseFrame: [] as any[], frameIndex: 0 };
    const i = bisectFrameIndex(frames, renderTime), f0 = frames[i], f1 = frames[i + 1] ?? f0;
    const t0 = f0.time ?? 0, t1 = f1.time ?? 0, a = i < frames.length - 1 ? clamp01((renderTime - t0) / Math.max(1e-9, t1 - t0)) : 0;
    const cnt = Math.min(f0.horseFrame.length, f1.horseFrame.length);
    const horseFrame = Array.from({ length: cnt }, (_, idx) => {
      const h0 = f0.horseFrame[idx], h1 = f1.horseFrame[idx] ?? h0, take1 = a >= 0.5;
      return {
        distance: lerp(h0.distance ?? 0, h1.distance ?? 0, a),
        lanePosition: lerp(h0.lanePosition ?? 0, h1.lanePosition ?? 0, a),
        speed: lerp(h0.speed ?? 0, h1.speed ?? 0, a),
        hp: lerp(h0.hp ?? 0, h1.hp ?? 0, a),
        temptationMode: (take1 ? h1 : h0).temptationMode,
        blockFrontHorseIndex: (take1 ? h1 : h0).blockFrontHorseIndex,
      };
    });
    return { time: lerp(t0, t1, a), horseFrame, frameIndex: i };
  }, [frames, renderTime]);
}

function useCurrentAcceleration(frames: RaceSimulateData["frame"], frameIndex: number) {
  return useMemo(() => {
    if (!frames.length) return {} as Record<number, number>;
    const i = Math.min(frameIndex, frames.length - 1);
    const f0 = frames[i];
    const f1 = frames[i + 1];
    if (!f0 || !f1) {
      const acc: Record<number, number> = {};
      (f0?.horseFrame ?? []).forEach((_, idx) => (acc[idx] = 0));
      return acc;
    }
    const t0 = f0.time ?? 0;
    const t1 = f1.time ?? 0;
    const dt = Math.max(1e-9, t1 - t0);
    const cnt = Math.min(f0.horseFrame.length, f1.horseFrame.length);
    const acc: Record<number, number> = {};
    for (let idx = 0; idx < cnt; idx++) {
      const s0 = f0.horseFrame[idx]?.speed ?? 0;
      const s1 = f1.horseFrame[idx]?.speed ?? 0;
      acc[idx] = (s1 - s0) / dt;
    }
    return acc;
  }, [frames, frameIndex]);
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
    if (!goalInX || !availableTracks.length) { setSelectedTrackId(null); setGuessStatus("none"); return; }
    const now = new Date();
    const relevant = (cups.cups as any[]).filter((c: any) => c.distance === goalInX).map((c: any) => ({ ...c, date: new Date(c.date) })).sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
    const past = relevant.filter(c => c.date <= now);
    let guess: any = null;
    if (past.length) {
      const last = past[past.length - 1];
      if (now.getTime() - last.date.getTime() < 14 * 24 * 60 * 60 * 1000) guess = last;
    }
    if (!guess) guess = relevant.find(c => c.date > now) ?? past[past.length - 1] ?? null;
    if (guess) {
      const entry = Object.entries(trackNames as Record<string, string[]>).find(([, names]) => names[1] === guess.track);
      if (entry) {
        const raceTrackId = parseInt(entry[0], 10);
        const match = availableTracks.find(t => t.raceTrackId === raceTrackId && t.surface === guess.surface);
        if (match) { setSelectedTrackId(match.id); setGuessStatus("guessed"); return; }
      }
    }
    if (availableTracks.length) { setSelectedTrackId(availableTracks[0].id); setGuessStatus("fallback"); }
    else { setSelectedTrackId(null); setGuessStatus("none"); }
  }, [goalInX, availableTracks]);
  return { selectedTrackId, setSelectedTrackId, guessStatus };
}

type AreaPair = [{ xAxis: number; yAxis: number }, { xAxis: number; yAxis: number }];
function useCourseLayers(selectedTrackId: string | null, goalInX: number, yMaxWithHeadroom: number) {
  return useMemo(() => {
    const straights: AreaPair[] = [], corners: AreaPair[] = [], straightsFinal: AreaPair[] = [], cornersFinal: AreaPair[] = [];
    const segMarkers: MarkLine1DDataItemOption[] = [];
    const slopeTriangles: { value: [number, number, 1 | -1] }[] = [];
    const td = selectedTrackId ? (courseData as Record<string, any>)[selectedTrackId] : null;
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

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="d-inline-flex align-items-center" style={{ whiteSpace: "nowrap", marginRight: LEGEND_ITEM_GAP_X, marginBottom: LEGEND_ITEM_GAP_Y }}>
    <span style={{ width: 12, height: 12, background: color, border: "1px solid #888", display: "inline-block", marginRight: LEGEND_SWATCH_GAP, borderRadius: 2 }} />
    <span style={{ fontSize: 12 }}>{label}</span>
  </span>
);

const teamColorFor = (idx: number, info: any, trainerColors?: Record<number, string>) => {
  const trainerId = info?.trainer_id ?? info?.trainerId ?? info?.owner_id ?? info?.team_id ?? null;
  const paletteIndex = (typeof trainerId === "number" ? Math.abs(trainerId) : idx) % DEFAULT_TEAM_PALETTE.length;
  return (trainerId != null && trainerColors?.[trainerId]) || DEFAULT_TEAM_PALETTE[paletteIndex];
};

function buildLegendShadowSeries(displayNames: Record<number, string>, horseInfoByIdx: Record<number, any>, trainerColors?: Record<number, string>) {
  const out: ScatterSeriesOption[] = [];
  Object.entries(displayNames).forEach(([iStr, name]) => {
    const i = +iStr, info = horseInfoByIdx[i] ?? {}, color = teamColorFor(i, info, trainerColors);
    out.push({ id: `legend-shadow-${i}`, name, type: "scatter", data: [], symbolSize: 0, silent: true, tooltip: { show: false }, itemStyle: { color } });
  });
  return out;
}

function buildHorsesCustomSeries(
  interpolated: InterpolatedFrame,
  displayNames: Record<number, string>,
  horseInfoByIdx: Record<number, any>,
  trainerColors: Record<number, string> | undefined,
  legendSelection: Record<string, boolean>,
  showSpeedBox: boolean,
  showAccelBox: boolean,
  accByIdx: Record<number, number>,
  showBlockedIcon: boolean
) {
  const data: Array<{ name: string; value: [number, number, string, string, string, number, number, number] }> = [];
  Object.entries(displayNames).forEach(([iStr, name]) => {
    if (legendSelection && legendSelection[name] === false) return;
    const i = +iStr, h = interpolated.horseFrame[i];
    if (!h) return;
    const info = horseInfoByIdx[i] ?? {}, teamColor = teamColorFor(i, info, trainerColors), iconUrl = getCharaIcon(info?.chara_id) ?? "";
    const isBlocked = showBlockedIcon && h.blockFrontHorseIndex != null && h.blockFrontHorseIndex !== -1 ? 1 : 0;
    const speed = h.speed ?? 0;
    const accel = accByIdx[i] ?? 0;
    data.push({ name, value: [h.distance ?? 0, h.lanePosition ?? 0, name, teamColor, iconUrl, isBlocked, speed, accel] });
  });

  const renderItem = (params: any, api: any) => {
    const vX = api.value(0) as number, vY = api.value(1) as number; const [cx, cy] = api.coord([vX, vY]);
    const teamColor = (api.value(3) as string) || "#000", iconUrl = (api.value(4) as string) || "", isBlocked = !!api.value(5);
    const speedRaw = (api.value(6) as number) || 0;
    const accelRaw = (api.value(7) as number) || 0;
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

function buildSkillLabels(frame: any, skillActivations: RaceReplayProps["skillActivations"], time: number) {
  const items: any[] = [];
  frame.horseFrame.forEach((h: any, i: number) => {
    if (!h) return; const base: [number, number] = [h.distance ?? 0, h.lanePosition ?? 0];
    const next = stackLabels();
    const mode = h.temptationMode ?? 0;
    if (mode) { items.push({ value: base, id: `temptation-${i}-${mode}`, label: next(TEMPTATION_TEXT[mode] ?? "Rushed") }); }
    (skillActivations[i] ?? [])
      .filter(s => { const dur = s.param?.[2]; const secs = dur > 0 ? dur / 10000 : 2; return time >= s.time && time < s.time + secs && !EXCLUDE_SKILL_RE.test(s.name); })
      .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
      .forEach((s) => items.push({ value: base, id: `skill-${i}-${s.time}-${s.name}`, label: next(s.name) }));
  });
  return items;
}

function buildCourseLabelItems(markers: MarkLine1DDataItemOption[], yTop: number) {
  return (markers ?? [])
    .filter((m): m is MarkLine1DDataItemOption & { xAxis: number; name: string } => typeof (m as any).xAxis === "number" && !!(m as any).name)
    .map((m, idx) => ({ id: `course-label-${idx}`, value: [(m as any).xAxis as number, yTop], label: { ...labelStyle(10), position: "top", formatter: (m as any).name } }));
}

function buildMarkLines(goalInX: number, raceData: RaceSimulateData, displayNames: Record<number, string>, segmentMarkers: MarkLine1DDataItemOption[], trackData?: any) {
  const lines: MarkLine1DDataItemOption[] = [];
  if (goalInX > 0) lines.push(
    { xAxis: goalInX, name: "Goal In", lineStyle: { color: "#666", type: [8, 3, 1, 3] } },
    { xAxis: (10 / 24) * goalInX, name: "Position Keep ends", lineStyle: { color: "#777", type: "dashed" } },
    { xAxis: (4 / 24) * goalInX, name: "Mid race", lineStyle: { color: "#999", type: "dashed" } }
  );
  (raceData.horseResult ?? []).forEach((hr, i) => {
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

const noTooltipScatter = (id: string, markArea?: any) => ({ id, type: "scatter" as const, data: [], symbolSize: 0, silent: true, z: 0, tooltip: { show: false }, markArea });

function slopeRenderItemFactory(yMaxWithHeadroom: number) {
  return (params: any, api: any) => {
    const start = api.value(0) as number, end = api.value(1) as number, dir = api.value(2) as 1 | -1;
    const yTopVal = yMaxWithHeadroom * SLOPE_HALF_RATIO;
    const pBL = api.coord([start, 0]), pBR = api.coord([end, 0]), pTLh = api.coord([start, yTopVal]), pTRh = api.coord([end, yTopVal]);
    const isUp = dir === 1, triangle = isUp ? [pBL, pBR, pTRh] : [pBL, pTLh, pBR], diagStart = isUp ? pBL : pTLh, diagEnd = isUp ? pTRh : pBR, fill = isUp ? SLOPE_UP_FILL : SLOPE_DOWN_FILL;
    return {
      type: "group",
      children: [
        { type: "polygon", shape: { points: triangle }, style: api.style({ fill, stroke: null }), silent: true },
        { type: "line", shape: { x1: diagStart[0], y1: diagStart[1], x2: diagEnd[0], y2: diagEnd[1] }, style: { stroke: SLOPE_DIAG_LINE, lineWidth: 2, opacity: 0.9 }, silent: true }
      ]
    };
  };
}

function createOptions(args: {
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
        const accelStr = (accel > 0 ? "+" : "") + accel.toFixed(2);
        return `${has ? name + "<br/>" : ""}Distance: ${value[0].toFixed(2)}m<br/>Lane: ${Math.round(value[1])}<br/>Speed: ${speed.toFixed(2)} m/s<br/>Accel: ${accelStr} m/s²`;
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

const InfoHover: React.FC<{ title?: string; content?: React.ReactNode }> = ({
  title = "Replay info",
  content = (
    <div>
      <ul className="mb-0 ps-3">
        <li>The visualization for the slopes only represents the slope duration.</li>
        <li>Skill labels are shown for the real skill duration, or for 2 seconds if no duration (e.g. Swinging Maestro).</li>
        <li>For skills triggering on frame 0 (e.g. Groundwork), the game does not report a duration so the replay defaults to 2 seconds.</li>
        <li>I can't tell what track we're on directly from packet data. I currently attempt to guess it from the distance of the race and the CM schedule, but you may need to manually select the track outside of that.</li>
        <li>Track selection only matters for displaying straight/corner sections and slopes correctly.</li>
		<li>The replay always looks at a 50m (20L) slice of the race relative to the position of the frontmost Uma.</li>
		<li>Umas with 0 acceleration on frame 0 of the race have a late start.</li>
		<li>Around 2/3 of the way into the race, you'll typically see a lot of course events labeled "Last Spurt". There'll be one of those per Uma, and it's most relevant when an Uma's last spurt event happens significantly later than 2/3 of the distance, indicating they were too low on HP to attempt a full last spurt. </li>
      </ul>
    </div>
  ),
}) => {
  const overlay = (
    <Popover id="race-replay-info"
	style={{ maxWidth: "48ch" }}>
      <div className="popover-header py-2">
        <h3 className="h6 m-0" style={{ color: "#DC2626" }}>{title}</h3>
      </div>
      <div className="popover-body">{content}</div>
    </Popover>
  );

  return (
    <OverlayTrigger placement="top" delay={{ show: 150, hide: 80 }} overlay={overlay} trigger={["hover", "focus"]}>
      <span
        role="button"
        tabIndex={0}
        aria-label="Replay information"
        className="d-inline-flex align-items-center"
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.25)",
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(2px)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "help",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "1px solid #444",
            marginRight: 6,
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          i
        </span>
        Info
      </span>
    </OverlayTrigger>
  );
};

const RaceReplay: React.FC<RaceReplayProps> = ({
  raceData,
  raceHorseInfo,
  displayNames,
  skillActivations,
  trainerColors,
  infoTitle,
  infoContent,
}) => {
  const frames = useMemo(() => raceData.frame ?? [], [raceData]);
  const startTime = frames[0]?.time ?? 0, endTime = frames[frames.length - 1]?.time ?? 0;
  const { time: renderTime, setTime: setRenderTime, isPlaying, playPause } = useRafPlayer(startTime, endTime);

  const goalInX = useMemo(() => {
    let winnerIndex = -1, winnerFinish = Number.POSITIVE_INFINITY;
    (raceData.horseResult ?? []).forEach((hr, idx) => { const t = hr?.finishTimeRaw; if (typeof t === "number" && t > 0 && t < winnerFinish) { winnerFinish = t; winnerIndex = idx; } });
    if (winnerIndex >= 0 && frames.length && isFinite(winnerFinish)) { const i = bisectFrameIndex(frames, winnerFinish); const d0 = frames[i]?.horseFrame?.[winnerIndex]?.distance ?? 0; return Math.round(d0 / 100) * 100; }
    return 0;
  }, [frames, raceData.horseResult]);

  const availableTracks = useAvailableTracks(goalInX);
  const { selectedTrackId, setSelectedTrackId, guessStatus } = useGuessTrack(goalInX, availableTracks);

  const maxLanePosition = useMemo(() => frames.reduce((m, f) => Math.max(m, (f.horseFrame ?? []).reduce((mm: number, h: any) => Math.max(mm, h?.lanePosition ?? 0), 0)), 0), [frames]);
  const interpolatedFrame = useInterpolatedFrame(frames, renderTime);

  const accByIdx = useCurrentAcceleration(frames, interpolatedFrame.frameIndex);

  const frontRunnerDistance = interpolatedFrame.horseFrame.reduce((m: number, h: any) => Math.max(m, h?.distance ?? 0), 0);
  const cameraWindow = 50, cameraLead = 8;
  const xAxis = useMemo(() => ({ min: Math.max(0, Math.max(cameraWindow, frontRunnerDistance + cameraLead) - cameraWindow), max: Math.max(cameraWindow, frontRunnerDistance + cameraLead) }), [frontRunnerDistance]);

  const horseInfoByIdx = useMemo(() => { const map: Record<number, any> = {}; (raceHorseInfo ?? []).forEach((h: any) => { const idx = (h.frame_order ?? h.frameOrder) - 1; if (idx >= 0) map[idx] = h; }); return map; }, [raceHorseInfo]);

  const legendNames = useMemo(() => Object.values(displayNames), [displayNames]);
  const [legendSelection, setLegendSelection] = useState<Record<string, boolean>>({});
  useEffect(() => { setLegendSelection(prev => { const next: Record<string, boolean> = {}; legendNames.forEach(n => { next[n] = prev[n] ?? true; }); return next; }); }, [legendNames]);
  const onEvents = useMemo(() => ({ legendselectchanged: (e: any) => { if (e && e.selected) setLegendSelection(e.selected); } }), []);

  const { t: toggles, bind } = useToggles();

  const legendShadowSeries = useMemo(() => buildLegendShadowSeries(displayNames, horseInfoByIdx, trainerColors), [displayNames, horseInfoByIdx, trainerColors]);
  const horsesSeries = useMemo(
    () =>
      buildHorsesCustomSeries(
        interpolatedFrame,
        displayNames,
        horseInfoByIdx,
        trainerColors,
        legendSelection,
        toggles.speed,
        toggles.accel,
        accByIdx,
        toggles.blocked
      ),
    [interpolatedFrame, displayNames, horseInfoByIdx, trainerColors, legendSelection, toggles.speed, toggles.accel, accByIdx, toggles.blocked]
  );

  const yMaxWithHeadroom = maxLanePosition + 3;
  const skillLabelData = useMemo(() => buildSkillLabels(interpolatedFrame, skillActivations, renderTime), [interpolatedFrame, skillActivations, renderTime]);
  const { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles } = useCourseLayers(selectedTrackId, goalInX, yMaxWithHeadroom);

  const raceMarkers = useMemo(() => { const td = selectedTrackId ? (courseData as Record<string, any>)[selectedTrackId] : undefined; return buildMarkLines(goalInX, raceData, displayNames, segMarkers, td); }, [goalInX, raceData, displayNames, segMarkers, selectedTrackId]);
  const courseLabelData = useMemo(() => buildCourseLabelItems(raceMarkers as MarkLine1DDataItemOption[], yMaxWithHeadroom), [raceMarkers, yMaxWithHeadroom]);

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
    markLine: { animation: false, symbol: "none", label: { show: false }, lineStyle: { type: "solid" }, data: raceMarkers }
  }), [raceMarkers]);

  const seriesList = useMemo(() => {
    const list: any[] = [
      ...bgSeries,
      toggles.slopes ? {
        id: "slope-diagonals",
        type: "custom",
        renderItem: slopeRenderItem as any,
        data: slopeTriangles,
        coordinateSystem: "cartesian2d",
        silent: true,
        clip: true,
        z: 2,
        zlevel: 0,
        tooltip: { show: false }
      } : null,
      toggles.course ? markerSeries : null,
      ...legendShadowSeries,
      horsesSeries as any,
      toggles.course ? {
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
        labelLayout: { moveOverlap: "shiftY" as const }
      } : null,
      toggles.skills ? {
        id: "skills-overlay",
        type: "scatter",
        data: skillLabelData,
        symbolSize: 0,
        z: 10,
        zlevel: 1,
        animation: false,
        silent: true,
        tooltip: { show: false }
      } : null,
    ];
    return list.filter(Boolean);
  }, [bgSeries, toggles.slopes, slopeRenderItem, slopeTriangles, toggles.course, markerSeries, legendShadowSeries, horsesSeries, courseLabelData, toggles.skills, skillLabelData]);

  const options: ECOption = useMemo(() => createOptions({
    xMin: xAxis.min,
    xMax: xAxis.max,
    yMax: yMaxWithHeadroom,
    series: seriesList as ECOption["series"],
    legendNames,
    legendSelection,
  }), [xAxis.min, xAxis.max, yMaxWithHeadroom, seriesList, legendNames, legendSelection]);

  const clampedRenderTime = clamp(renderTime, startTime, endTime);

  const toggleDefs = [
    { id: "skills" as const, label: "Skill labels" },
    { id: "blocked" as const, label: "Block indicator" },
    { id: "slopes" as const, label: "Slopes" },
    { id: "speed" as const, label: "Speed [m/s]" },
    { id: "accel" as const, label: "Acceleration [m/s^2]" },
    { id: "course" as const, label: "Course events" },
  ];

  return (
    <div>
      {goalInX > 0 && availableTracks.length > 0 && (
        <div className="d-flex align-items-start" style={{ flexWrap: "wrap", marginBottom: TOOLBAR_GAP }}>
          <div className="d-flex flex-column" style={{ marginRight: TOOLBAR_GAP, marginBottom: TOOLBAR_GAP, minWidth: 260 }}>
            <div className="d-flex align-items-center">
              <Form.Label className="mb-0 me-2">Track:</Form.Label>
              <Form.Control
                as="select"
                value={selectedTrackId ?? ""}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedTrackId(e.target.value)}
                style={{ width: "auto", maxWidth: 320 }}
              >
                {availableTracks.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </Form.Control>
            </div>
            <div className="mt-2" style={{ minHeight: 20 }}>
              {guessStatus === "guessed" && (
                <span style={{ color: "green" }}>
                  Guessed track based on CM schedule
                </span>
              )}
              {guessStatus === "fallback" && (
                <span style={{ color: "darkorange" }}>
                  Select track
                </span>
              )}
            </div>
          </div>

          <div className="d-flex align-items-start" style={{ marginRight: TOOLBAR_GAP, marginBottom: TOOLBAR_GAP, gap: TOOLBAR_INLINE_GAP }}>
            <Form.Label className="mb-0 me-2 mt-1">Display:</Form.Label>
            <div
              className="d-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(160px, auto))",
                columnGap: TOOLBAR_INLINE_GAP,
                rowGap: 4,
              }}
            >
              {toggleDefs.map(({ id, label }) => (
                <Form.Check
                  key={id}
                  type="checkbox"
                  id={`toggle-${id}`}
                  label={label}
                  {...bind(id)}
                  className="mb-1"
                />
              ))}
            </div>
          </div>

          <div className="d-flex align-items-center" style={{ marginLeft: "auto", flexWrap: "wrap", marginBottom: TOOLBAR_GAP }}>
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
        notMerge={true}
        lazyUpdate={true}
        theme="dark"
        onEvents={onEvents}
      />

      <div className="d-flex align-items-center justify-content-between mt-2">
        <div className="d-flex align-items-center flex-grow-1">
          <Button onClick={playPause} className="me-3">{isPlaying ? "Pause" : "Play"}</Button>
          <Form.Control
            type="range"
            min={startTime}
            max={endTime}
            step={0.001}
            value={clampedRenderTime}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenderTime(clamp(parseFloat(e.target.value), startTime, endTime))}
            className="flex-grow-1"
          />
          <span className="ms-3">{clampedRenderTime.toFixed(2)}s / {endTime.toFixed(2)}s</span>
        </div>
        <div className="ms-3">
          <InfoHover title={infoTitle} content={infoContent} />
        </div>
      </div>
    </div>
  );
};

export default RaceReplay;
import EChartsReactCore from "echarts-for-react/lib/core";
import { ScatterChart, ScatterSeriesOption } from "echarts/charts";
import {
  GridComponent,
  GridComponentOption,
  LegendComponent,
  LegendComponentOption,
  TooltipComponent,
  TooltipComponentOption,
} from "echarts/components";
import * as echarts from "echarts/core";
import { ComposeOption } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import _ from "lodash";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { RaceSimulateData } from "../data/race_data_pb";

echarts.use([ScatterChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer]);

type ECOption = ComposeOption<
  | ScatterSeriesOption
  | TooltipComponentOption
  | GridComponentOption
  | LegendComponentOption
>;

type RaceReplayProps = {
  raceData: RaceSimulateData;
  raceHorseInfo: any[];
  displayNames: Record<number, string>;
  skillActivations: Record<number, { time: number; name: string; param: number[] }[]>;
  trainerColors?: Record<number, string>;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function findFrameIndex(frames: RaceSimulateData["frame"], t: number): number {
  let lo = 0,
    hi = frames.length - 1;
  if (frames.length === 0) return 0;
  if (t <= frames[0].time!) return 0;
  if (t >= frames[hi].time!) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const tm = frames[mid].time!;
    if (tm <= t) {
      if (t < frames[mid + 1].time!) return mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(0, Math.min(frames.length - 1, lo));
}

const STACK_BASE_PX = 24;
const STACK_GAP_PX = 22;
const ICON_SIZE = 64;
const BG_SIZE = 52;
const BG_OFFSET_X_PX = 0;
const BG_OFFSET_Y_PX = 3;
const DOT_SIZE = 52;

const DEFAULT_TEAM_PALETTE = [
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#9333EA",
  "#EA580C",
  "#0891B2",
  "#DB2777",
  "#4F46E5",
  "#059669",
  "#B45309",
  "#0EA5E9",
  "#C026D3",
];

const RaceReplay: React.FC<RaceReplayProps> = ({
  raceData,
  raceHorseInfo,
  displayNames,
  skillActivations,
  trainerColors,
}) => {
  const frames = useMemo(() => raceData.frame ?? [], [raceData]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [renderTime, setRenderTime] = useState(frames[0]?.time ?? 0);

  const startTime = frames[0]?.time ?? 0;
  const endTime = frames[frames.length - 1]?.time ?? 0;

  const maxLanePosition = useMemo(() => {
    let max = 0;
    frames.forEach((frame) => {
      frame.horseFrame.forEach((h) => {
        const lp = h.lanePosition ?? 0;
        if (lp > max) max = lp;
      });
    });
    return max;
  }, [frames]);

  const animationFrameRef = useRef<number>();
  const lastUpdateTimeRef = useRef<number | undefined>(undefined);
  const raceTimeRef = useRef(frames[0]?.time ?? 0);

  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const endTimeRef = useRef(endTime);
  useEffect(() => {
    endTimeRef.current = endTime;
  }, [endTime]);

  const startTimeRef = useRef(startTime);
  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);

  useEffect(() => {
    const tick = (now: number) => {
      if (lastUpdateTimeRef.current == null) {
        lastUpdateTimeRef.current = now;
      }

      if (isPlayingRef.current) {
        const dt = (now - lastUpdateTimeRef.current) / 1000;
        lastUpdateTimeRef.current = now;

        const e = endTimeRef.current;
        const next = Math.min(raceTimeRef.current + dt, e);

        if (next !== raceTimeRef.current) {
          raceTimeRef.current = next;
          setRenderTime(next);
        }

        if (next >= e) {
          isPlayingRef.current = false;
          setIsPlaying(false);
        }
      } else {
        lastUpdateTimeRef.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const interpolatedFrame = useMemo(() => {
    if (frames.length === 0) return { time: 0, horseFrame: [] as any[] };

    const i = findFrameIndex(frames, renderTime);
    const f0 = frames[i];
    const f1 = frames[i + 1] ?? f0;
    const t0 = f0.time!,
      t1 = f1.time!;
    const denom = Math.max(1e-9, t1 - t0);
    const alpha = i < frames.length - 1 ? clamp01((renderTime - t0) / denom) : 0;

    const count = Math.min(f0.horseFrame.length, f1.horseFrame.length);
    const horseFrame = Array.from({ length: count }, (_, idx) => {
      const h0 = f0.horseFrame[idx];
      const h1 = f1.horseFrame[idx] ?? h0;

      const distance = lerp(h0.distance ?? 0, h1.distance ?? 0, alpha);
      const lanePosition = lerp(h0.lanePosition ?? 0, h1.lanePosition ?? 0, alpha);
      const speed = lerp(h0.speed ?? 0, h1.speed ?? 0, alpha);
      const hp = lerp(h0.hp ?? 0, h1.hp ?? 0, alpha);

      const takeH1 = alpha >= 0.5;
      const temptationMode = (takeH1 ? h1 : h0).temptationMode;
      const blockFrontHorseIndex = (takeH1 ? h1 : h0).blockFrontHorseIndex;

      return { distance, lanePosition, speed, hp, temptationMode, blockFrontHorseIndex };
    });

    return { time: lerp(t0, t1, alpha), horseFrame };
  }, [frames, renderTime]);

  const frontRunnerDistance =
    _.max(interpolatedFrame.horseFrame.map((hf) => hf.distance ?? 0)) || 0;

  const cameraWindow = 50;
  const cameraLead = 8;

  const xAxis = useMemo(() => {
    const desiredMax = Math.max(cameraWindow, frontRunnerDistance + cameraLead);
    const desiredMin = Math.max(0, desiredMax - cameraWindow);
    return { min: desiredMin, max: desiredMax };
  }, [frontRunnerDistance, cameraWindow, cameraLead]);

  const getTrainerId = (info: any) =>
    info?.trainer_id ?? info?.trainerId ?? info?.owner_id ?? info?.team_id ?? null;

	const seriesData = useMemo(() => {
	  const arr: any[] = [];
	  Object.entries(displayNames).forEach(([idxStr, name]) => {
		const idx = parseInt(idxStr, 10);
		const horse = interpolatedFrame.horseFrame[idx];
		const point: [number, number] = [horse?.distance ?? 0, horse?.lanePosition ?? 0];

		const horseInfo = raceHorseInfo.find((h) => h.frame_order - 1 === idx) ?? {};
		const charaId = horseInfo?.chara_id;

		const trainerId = getTrainerId(horseInfo);
		const paletteIndex =
		  (typeof trainerId === "number" ? Math.abs(trainerId) : idx) % DEFAULT_TEAM_PALETTE.length;
		const teamColor =
		  (trainerColors && trainerId != null && trainerColors[trainerId]) ||
		  DEFAULT_TEAM_PALETTE[paletteIndex];

		let icon: string | null = null;
		if (charaId != null) {
		  try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			icon = require(`../data/umamusume_icons/chr_icon_${charaId}.png`);
		  } catch {
			icon = null;
		  }
		}

		if (icon) {
		  arr.push({
			id: `horse-bg-${idx}`,
			name,
			type: "scatter" as const,
			symbol: "circle",
			symbolSize: BG_SIZE,
			symbolOffset: [BG_OFFSET_X_PX, BG_OFFSET_Y_PX],
			data: [point],
			itemStyle: { color: teamColor },
			animation: false,
			z: 4,
			silent: true,
			tooltip: { show: false },
		  });

		  arr.push({
			id: `horse-${idx}`,
			name,
			type: "scatter" as const,
			symbol: `image://${icon}`,
			symbolSize: ICON_SIZE,
			data: [point],
			animation: false,
			z: 5,
		  });
		} else {
		  // Fallback: a single, smaller colored dot
		  arr.push({
			id: `horse-dot-${idx}`,
			name,
			type: "scatter" as const,
			symbol: "circle",
			symbolSize: DOT_SIZE,
			data: [point],
			itemStyle: { color: teamColor, borderColor: "#000", borderWidth: 1 },
			animation: false,
			z: 5,
		  });
		}
	  });
	  return arr;
	}, [interpolatedFrame, displayNames, raceHorseInfo, trainerColors]);


  const yMaxWithHeadroom = maxLanePosition + 3;

  const skillLabelData = useMemo(() => {
    const items: any[] = [];
    Object.entries(skillActivations).forEach(([idxStr, skills]) => {
      const idx = parseInt(idxStr, 10);
      const horse = interpolatedFrame.horseFrame[idx];
      if (!horse) return;

      const excludeRe =
        /(standard\s*distance|-handed|savvy|days|conditions| runner| racecourse|target in sight|focus|concentration)/i;
      const active = skills.filter((s) => {
        const skillDurationParam = s.param[2];
        const skillDisplayDuration = skillDurationParam === -1 ? 2 : skillDurationParam / 10000;
        return (
          renderTime >= s.time &&
          renderTime < s.time + skillDisplayDuration &&
          !excludeRe.test(s.name)
        );
      });

      const activeSorted = active
        .slice()
        .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));

      const basePoint: [number, number] = [horse.distance ?? 0, horse.lanePosition ?? 0];

      activeSorted.forEach((s, stackIndex) => {
        items.push({
          value: basePoint,
          id: `skill-${idx}-${s.time}-${s.name}`,
          label: {
            show: true,
            formatter: s.name,
            position: "top",
            offset: [0, -(STACK_BASE_PX + stackIndex * STACK_GAP_PX)],
            padding: [4, 6],
            backgroundColor: "#fff",
            borderColor: "#000",
            borderWidth: 1,
            borderRadius: 5,
            color: "#000",
            fontSize: 12,
          },
        });
      });
    });

    return items;
  }, [interpolatedFrame, skillActivations, renderTime]);

  const options: ECOption = {
    xAxis: {
      type: "value",
      min: xAxis.min,
      max: xAxis.max,
      name: "Distance",
      axisLabel: { show: true, showMinLabel: false, showMaxLabel: false },
      axisTick: { show: false },
      splitLine: { show: true },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: yMaxWithHeadroom,
      name: "Lane Position",
    },
    legend: {
      show: true,
      data: Object.values(displayNames),
    },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (params: any) => {
        const { name, value } = params;
        const hasName = typeof name === "string" && name.length > 0;
        return `${hasName ? name + "<br/>" : ""}Distance: ${value[0].toFixed(
          2
        )}m<br/>Lane: ${Math.round(value[1])}`;
      },
    },
    grid: { top: 40, right: 16, bottom: 40, left: 50, containLabel: false },
    series: [
      ...seriesData,
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

  const clampedRenderTime = Math.min(Math.max(renderTime, startTime), endTime);

  return (
    <div>
      <EChartsReactCore
        echarts={echarts}
        option={options}
        style={{ height: "500px" }}
        notMerge={false}
        // @ts-ignore
        replaceMerge={["series"]}
        lazyUpdate={false}
      />
      <div className="d-flex justify-content-center align-items-center">
        <Button
          onClick={() => {
            if (!isPlaying && raceTimeRef.current >= endTimeRef.current - 1e-6) {
              raceTimeRef.current = startTimeRef.current;
              setRenderTime(startTimeRef.current);
              lastUpdateTimeRef.current = undefined;
            }
            setIsPlaying((p) => !p);
          }}
          className="me-3"
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>

        <Form.Control
          type="range"
          min={startTime}
          max={endTime}
          step={0.001}
          value={clampedRenderTime}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const t = Math.min(Math.max(parseFloat(e.target.value), startTime), endTime);
            raceTimeRef.current = t;
            setRenderTime(t);
            lastUpdateTimeRef.current = undefined;
          }}
          style={{ flexGrow: 1 }}
        />

        <span className="ms-3">
          {clampedRenderTime.toFixed(2)}s / {endTime.toFixed(2)}s
        </span>
      </div>
    </div>
  );
};

export default RaceReplay;

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
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
};

// helpers
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Find i such that frames[i].time <= t < frames[i+1].time. Returns last index if t >= last. */
function findFrameIndex(frames: RaceSimulateData["frame"], t: number): number {
  let lo = 0,
    hi = frames.length - 1;
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

const RaceReplay: React.FC<RaceReplayProps> = ({ raceData, raceHorseInfo, displayNames }) => {
  const frames = raceData.frame;
  const [isPlaying, setIsPlaying] = useState(false);

  // renderTime = the *continuous* replay clock (seconds)
  const [renderTime, setRenderTime] = useState(frames[0]?.time ?? 0);

  // Kept only for any UI that still needs the discrete index; it auto-syncs from renderTime
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  // camera smoothing state
  const cameraXRef = useRef<number>(0);
  const xMinRef = useRef<number>(0);
  const xMaxRef = useRef<number>(50);
  const prevTimeRef = useRef<number>(performance.now());

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
  const lastUpdateTimeRef = useRef<number>();
  const raceTimeRef = useRef(frames[0]?.time ?? 0);

  // RAF loop: always running; only advances clock while playing
  const loop = useCallback(() => {
    const now = performance.now();
    if (!lastUpdateTimeRef.current) lastUpdateTimeRef.current = now;
    const elapsedSec = (now - lastUpdateTimeRef.current) / 1000;
    lastUpdateTimeRef.current = now;

    if (isPlaying) {
      // Advance the replay clock in *real time* while playing
      raceTimeRef.current += elapsedSec;
      setRenderTime(raceTimeRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(loop);
  }, [isPlaying]);

  useEffect(() => {
    // (Re)start or stop the RAF loop whenever the loop function identity changes
    lastUpdateTimeRef.current = undefined;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [loop]);

  // Keep the discrete index synced to the true source of truth (renderTime)
  useEffect(() => {
    setCurrentFrameIndex(findFrameIndex(frames, renderTime));
  }, [frames, renderTime]);

  // Build an interpolated frame directly from renderTime
  const interpolatedFrame = useMemo(() => {
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

  // Front runner (interpolated)
  const frontRunnerDistance = _.max(interpolatedFrame.horseFrame.map((hf) => hf.distance ?? 0)) || 0;

  // --- Camera & x-axis: always keep the leader in view ---
  const cameraWindow = 50; // width of the visible distance window (meters)
  const cameraLead = 8; // how much space to show *ahead* of the leader
  const kFollow = 10; // follow speed (1/s), higher = snappier

  const xAxis = useMemo(() => {
    const now = performance.now();
    const dt = Math.max(0, (now - prevTimeRef.current) / 1000);
    prevTimeRef.current = now;

    // Desired window ends a bit ahead of the leader
    const desiredMax = Math.max(cameraWindow, frontRunnerDistance + cameraLead);
    const desiredMin = Math.max(0, desiredMax - cameraWindow);

    // Critically-damped-like smoothing toward desired window
    const a = 1 - Math.exp(-kFollow * dt);
    xMaxRef.current += (desiredMax - xMaxRef.current) * a;
    xMinRef.current += (desiredMin - xMinRef.current) * a;

    return { min: xMinRef.current, max: xMaxRef.current };
  }, [frontRunnerDistance]);

  // One series per horse, with stable ids (helps ECharts reuse & update smoothly)
  const seriesData = useMemo(() => {
    return Object.entries(displayNames).map(([idxStr, name]) => {
      const idx = parseInt(idxStr, 10);
      const horse = interpolatedFrame.horseFrame[idx];
      const point: [number, number] = [horse?.distance ?? 0, horse?.lanePosition ?? 0];

      const horseInfo = raceHorseInfo.find(h => h.frame_order - 1 === idx);
      const charaId = horseInfo?.chara_id;
      const icon = charaId ? require(`../data/umamusume_icons/chr_icon_${charaId}.png`) : null;

      return {
        id: `horse-${idx}`, // stable id
        name,
        type: "scatter" as const,
        symbol: icon ? `image://${icon}` : 'circle',
        symbolSize: 64,
        data: [point],
        animation: false,
      };
    });
  }, [interpolatedFrame, displayNames, raceHorseInfo]);

  const options: ECOption = {
    xAxis: {
      type: "value",
      min: xAxis.min,
      max: xAxis.max,
      name: "Distance",
    },
    yAxis: {
      type: "value",
      min: 0,
      max: maxLanePosition,
      name: "Lane Position",
    },
    legend: {
      show: true,
      data: Object.values(displayNames),
    },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const { name, value } = params;
        return `${name}<br/>Distance: ${value[0].toFixed(2)}m<br/>Lane: ${Math.round(value[1])}`;
      },
    },
    series: seriesData,
    animation: false, // we drive motion with RAF + interpolation
  };

  // End-of-race handling (stop when clock passes final time)
  useEffect(() => {
    const end = frames[frames.length - 1]?.time ?? 0;
    if (renderTime >= end && isPlaying) {
      setIsPlaying(false);
      setRenderTime(end);
      raceTimeRef.current = end;
    }
  }, [renderTime, frames, isPlaying]);

  // Slider time bounds
  const startTime = frames[0]?.time ?? 0;
  const endTime = frames[frames.length - 1]?.time ?? 0;

  return (
    <div>
      <EChartsReactCore
        echarts={echarts}
        option={options}
        style={{ height: "500px" }}
        notMerge={false}
        lazyUpdate={false}
      />
      <div className="d-flex justify-content-center align-items-center">
        <Button
          onClick={() => {
            // Toggle play/pause without touching the clock
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
          step={0.001} // 1 ms resolution; adjust as you like
          value={Math.min(Math.max(renderTime, startTime), endTime)} // clamp just in case
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const t = parseFloat(e.target.value);
            // seek by time (NOT by index)
            raceTimeRef.current = t;
            setRenderTime(t);
            // index auto-syncs via the effect watching renderTime
          }}
          style={{ flexGrow: 1 }}
        />

        <span className="ms-3">
          {renderTime!.toFixed(2)}s / {endTime.toFixed(2)}s
        </span>
      </div>
    </div>
  );
};

export default RaceReplay;

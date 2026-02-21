import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import EChartsReactCore from "echarts-for-react/lib/core";
import {
    ScatterChart,
    CustomChart,
} from "echarts/charts";
import {
    GridComponent,
    LegendComponent,
    TooltipComponent,
    MarkLineComponent,
    MarkAreaComponent,
    GraphicComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { Button, Form, OverlayTrigger, Tooltip } from "react-bootstrap";
type MarkLine1DDataItemOption = { xAxis?: number | string; name?: string; label?: object; lineStyle?: object };

import { RaceReplayProps } from "./RaceReplay.types";
import "./RaceReplay.css";
import InfoHover from "./components/InfoHover";
import {
    STRAIGHT_FILL,
    CORNER_FILL,
    STRAIGHT_FINAL_FILL,
    CORNER_FINAL_FILL,
    TOOLBAR_GAP,
} from "./RaceReplay.constants";
import { clamp } from "./RaceReplay.utils";
import { useRafPlayer } from "./hooks/useRafPlayer";
import { useInterpolatedFrame } from "./hooks/useInterpolatedFrame";
import { useCanvasOverlay } from "./hooks/useCanvasOverlay";
import { useAvailableTracks } from "./hooks/useAvailableTracks";
import { useGuessTrack } from "./hooks/useGuessTrack";
import { useCourseLayers, slopeRenderItemFactory } from "./hooks/useCourseLayers";
import { useToggles } from "./hooks/useToggles";
import { useRaceDerivedData } from "./hooks/useRaceDerivedData";
import { useRaceExport } from "./hooks/useRaceExport";
import LegendItem from "./components/LegendItem";
import ClipMaker from "./components/ClipMaker";
import HorseTooltip from "./components/HorseTooltip";
import { toggleDefs } from "./components/ToggleDefs";
import {
    createOptions,
    buildLegendShadowSeries,
    buildCourseLabelItems,
    buildMarkLines,
    noTooltipScatter,
    teamColorFor,
    ECOption,
} from "./utils/chartBuilders";
import GameDataLoader from "../../data/GameDataLoader";

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

const RaceReplay: React.FC<RaceReplayProps> = ({
    raceData,
    raceHorseInfo,
    displayNames,
    skillActivations,
    otherEvents,
    trainerColors,
    detectedCourseId,
    raceType,
    trackDetails,
    onTrackChange,
}) => {
    const frames = useMemo(() => raceData.frame ?? [], [raceData]);
    const startTime = frames[0]?.time ?? 0, endTime = frames[frames.length - 1]?.time ?? 0;
    // Stable forwarding callback so useRafPlayer can be declared before useRafChartUpdate
    const tickRef = useRef<((t: number) => void) | undefined>(undefined);
    const onFrame = useCallback((t: number) => tickRef.current?.(t), []);
    const { time: renderTime, setTime: setRenderTime, isPlaying, setIsPlaying, playPause, setPlaybackRate } = useRafPlayer(startTime, endTime, onFrame);



    const goalInX = useMemo(() => {
        let winnerIndex = -1, winnerFinish = Number.POSITIVE_INFINITY;
        (raceData.horseResult ?? []).forEach((hr, idx) => { const t = hr?.finishTimeRaw; if (typeof t === "number" && t > 0 && t < winnerFinish) { winnerFinish = t; winnerIndex = idx; } });
        if (winnerIndex >= 0 && frames.length && isFinite(winnerFinish)) { const i = (frames as any).findIndex((f: any) => f.time >= winnerFinish); const d0 = frames[i]?.horseFrame?.[winnerIndex]?.distance ?? 0; return Math.round(d0 / 100) * 100; }
        return 0;
    }, [frames, raceData.horseResult]);

    const availableTracks = useAvailableTracks(goalInX);
    const { selectedTrackId, setSelectedTrackId, guessStatus } = useGuessTrack(detectedCourseId, goalInX, availableTracks);

    // Notify parent when track selection changes
    useEffect(() => {
        if (onTrackChange) {
            onTrackChange(selectedTrackId ? parseInt(selectedTrackId, 10) : undefined);
        }
    }, [selectedTrackId, onTrackChange]);

    const maxLanePosition = useMemo(() => frames.reduce((m, f) => Math.max(m, (f.horseFrame ?? []).reduce((mm: number, h: any) => Math.max(mm, h?.lanePosition ?? 0), 0)), 0), [frames]);
    // Used only for frame counter display and keyboard handler — throttled to ~15fps via React state
    const interpolatedFrame = useInterpolatedFrame(frames, renderTime);

    const [cameraWindow, setCameraWindow] = useState(80);

    const horseInfoByIdx = useMemo(() => { const map: Record<number, any> = {}; (raceHorseInfo ?? []).forEach((h: any) => { const idx = (h.frame_order ?? h.frameOrder) - 1; if (idx >= 0) map[idx] = h; }); return map; }, [raceHorseInfo]);

    const { t: toggles, bind } = useToggles();

    const {
        maxHpByIdx,
        trainedCharaByIdx,
        oonigeByIdx,
        lastSpurtStartDistances,
        trackSlopes,
        passiveStatModifiers,
        combinedOtherEvents
    } = useRaceDerivedData(
        raceData,
        frames,
        raceHorseInfo,
        skillActivations,
        otherEvents,
        goalInX,
        selectedTrackId,
        toggles,
        raceType,
    );

    const legendNames = useMemo(() => Object.values(displayNames), [displayNames]);
    type VisibilityState = 0 | 1 | 2; // 0=visible, 1=dim, 2=hidden
    const [characterVisibility, setCharacterVisibility] = useState<Record<string, VisibilityState>>({});
    useEffect(() => { setCharacterVisibility(prev => { const next: Record<string, VisibilityState> = {}; legendNames.forEach(n => { next[n] = prev[n] ?? 0; }); return next; }); }, [legendNames]);
    const cycleVisibility = useCallback((name: string) => {
        setCharacterVisibility(prev => ({ ...prev, [name]: ((prev[name] ?? 0) + 1) % 3 as VisibilityState }));
    }, []);
    const [hoveredLegendName, setHoveredLegendName] = useState<string | null>(null);

    const startDelayByIdx = useMemo(() => {
        const map: Record<number, number> = {};
        (raceData.horseResult ?? []).forEach((hr, idx) => { if (hr) map[idx] = hr.startDelayTime ?? 0; });
        return map;
    }, [raceData.horseResult]);

    const echartsRef = React.useRef<any>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const { isExporting, handleExport } = useRaceExport(echartsRef, canvasRef, renderTime, isPlaying, playPause, setRenderTime);
    const legendShadowSeries = useMemo(() => buildLegendShadowSeries(displayNames, horseInfoByIdx, trainerColors), [displayNames, horseInfoByIdx, trainerColors]);

    const yMaxWithHeadroom = Math.max(6000, maxLanePosition);

    const { tick, interpolatedFrameRef, xAxisRef, horseHoverDataRef } = useCanvasOverlay(echartsRef, canvasRef, {
        frames,
        displayNames,
        horseInfoByIdx,
        trainerColors,
        characterVisibility,
        hoveredLegendName,
        toggles,
        maxHpByIdx,
        goalInX,
        trainedCharaByIdx,
        oonigeByIdx,
        lastSpurtStartDistances,
        trackSlopes,
        skillActivations,
        passiveStatModifiers,
        combinedOtherEvents,
        selectedTrackId,
        startDelayByIdx,
        cameraWindow,
        yMaxWithHeadroom,
    });
    tickRef.current = tick;

    useEffect(() => {
        if (frames.length > 0) tick(frames[0].time ?? 0);
    }, [frames, tick]);

    useEffect(() => {
        if (!isPlaying) tick(renderTime);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toggles, characterVisibility, hoveredLegendName]);

    const { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles } = useCourseLayers(selectedTrackId, goalInX, yMaxWithHeadroom);

    const raceMarkers = useMemo(() => { const td = selectedTrackId ? (GameDataLoader.courseData as Record<string, any>)[selectedTrackId] : undefined; return buildMarkLines(goalInX, raceData, displayNames, segMarkers, td); }, [goalInX, raceData, displayNames, segMarkers, selectedTrackId]);
    const courseLabelData = useMemo(() => buildCourseLabelItems(raceMarkers as MarkLine1DDataItemOption[], yMaxWithHeadroom), [raceMarkers, yMaxWithHeadroom]);

    const sectionTickSeries = useMemo(() => {
        if (!goalInX) return null;
        return {
            id: "section-ticks",
            type: "scatter" as const,
            silent: true,
            z: 3,
            clip: false,
            tooltip: { show: false },
            symbol: "rect",
            symbolSize: [2, 10],
            symbolOffset: [0, 5],
            itemStyle: { color: "#888" },
            label: {
                show: true,
                position: "bottom" as const,
                distance: 8,
                fontSize: 9,
                color: "#888",
                formatter: (params: any) => String(params.dataIndex + 1),
            },
            data: Array.from({ length: 24 }, (_, i) => [i * goalInX / 24, 0]),
        };
    }, [goalInX]);

    // Placeholder series for React options — imperative path updates markArea data every frame
    const positionKeepSeries = useMemo(() => {
        if (!toggles.positionKeep || !goalInX) return null;
        return { id: "position-keep-areas", type: "scatter" as const, silent: true, data: [], markArea: { silent: true, data: [] } };
    }, [toggles.positionKeep, goalInX]);

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
            sectionTickSeries,
            positionKeepSeries,
            ...legendShadowSeries,
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
        ];
        return list.filter(Boolean);
    }, [bgSeries, toggles.slopes, slopeRenderItem, slopeTriangles, toggles.course, markerSeries, sectionTickSeries, positionKeepSeries, legendShadowSeries, courseLabelData]);

    const options: ECOption = useMemo(() => createOptions({
        xMin: xAxisRef.current.min,
        xMax: xAxisRef.current.max,
        yMax: yMaxWithHeadroom,
        series: seriesList as ECOption["series"],
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [cameraWindow, yMaxWithHeadroom, seriesList]);

    const clampedRenderTime = clamp(renderTime, startTime, endTime);

    const [hoveredHorse, setHoveredHorse] = useState<{ idx: number; x: number; y: number; containerW: number } | null>(null);

    const [isEditingFrame, setIsEditingFrame] = useState(false);
    const [tempFrameInput, setTempFrameInput] = useState("");

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEditingFrame) return;
            if (e.key === "ArrowUp") {
                e.preventDefault();
                const currentIdx = interpolatedFrameRef.current.frameIndex;
                if (currentIdx < frames.length - 1) {
                    setRenderTime(frames[currentIdx + 1].time ?? 0);
                }
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const currentIdx = interpolatedFrameRef.current.frameIndex;
                if (currentIdx > 0) {
                    setRenderTime(frames[currentIdx - 1].time ?? 0);
                }
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setPlaybackRate(0.5);
                setIsPlaying(true);
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                setPlaybackRate(-0.5);
                setIsPlaying(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (isEditingFrame) return;
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                setIsPlaying(false);
                setPlaybackRate(1);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [frames, interpolatedFrameRef, isEditingFrame, setIsPlaying, setPlaybackRate, setRenderTime]);

    // Frame jumping and edit logic
    const handleFrameJump = () => {
        const frameIdx = parseInt(tempFrameInput, 10);
        if (!isNaN(frameIdx) && frameIdx >= 0 && frameIdx < frames.length) {
            const t = frames[frameIdx].time ?? 0;
            setRenderTime(t);
            if (isPlaying) playPause();
        }
        setIsEditingFrame(false);
    };

    return (
        <div>
            {goalInX > 0 && availableTracks.length > 0 && (
                <div className="d-flex align-items-start" style={{ flexWrap: "wrap", marginBottom: TOOLBAR_GAP, gap: 24, rowGap: 16 }}>

                    {/* LEFT SECTION: Track Info & View Window */}
                    <div className="d-flex flex-column" style={{ flex: "0 1 auto" }}>
                        <div className="d-flex align-items-center">
                            <Form.Label className="mb-0 me-2" style={{ fontWeight: 600 }}>Track:</Form.Label>
                            <Form.Control
                                as="select"
                                size="sm"
                                value={selectedTrackId ?? ""}
                                onChange={(e) => setSelectedTrackId(e.target.value)}
                                style={{ width: "auto", maxWidth: 240 }}
                            >
                                {availableTracks.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                                {guessStatus === "detected" && selectedTrackId && !availableTracks.some(t => t.id === selectedTrackId) && (
                                    <option key={selectedTrackId} value={selectedTrackId}>
                                        {`Detected Track (${selectedTrackId})`}
                                    </option>
                                )}
                            </Form.Control>
                        </div>

                        <div style={{ fontSize: "0.85em", minHeight: 18, marginTop: 2 }}>
                            {guessStatus === "detected" && <span style={{ color: "#28a745" }}>Detected track from race data</span>}
                            {guessStatus === "guessed" && <span style={{ color: "#28a745" }}>Guessed track based on CM schedule</span>}
                            {guessStatus === "fallback" && <span style={{ color: "darkorange" }}>Select track manually</span>}
                        </div>

                        <div className="d-flex align-items-center mt-2">
                            <Form.Label className="mb-0" style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: "0.95em" }}>
                                View window:
                                <OverlayTrigger
                                    placement="top"
                                    overlay={
                                        <Tooltip id="camera-window-tooltip">
                                            Controls how many metres of the track are visible at once.
                                        </Tooltip>
                                    }
                                >
                                    <span className="toggle-info-icon ms-1">ⓘ</span>
                                </OverlayTrigger>
                            </Form.Label>
                            <Form.Control
                                type="number"
                                size="sm"
                                min={20}
                                max={400}
                                step={10}
                                value={cameraWindow}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!isNaN(v) && v >= 20 && v <= 400) setCameraWindow(v);
                                }}
                                style={{ width: 65, marginLeft: 8, marginRight: 4 }}
                            />
                            <span style={{ color: "#aaa", fontSize: "0.9em" }}>m</span>
                            {trackDetails && (
                                <div className="d-flex align-items-center ms-3" style={{ gap: 8 }}>
                                    {trackDetails.season && <img src={`${import.meta.env.BASE_URL}assets/track_details/${trackDetails.season}.webp`} alt={trackDetails.season} height={22} title={trackDetails.season} />}
                                    {trackDetails.weather && <img src={`${import.meta.env.BASE_URL}assets/track_details/${trackDetails.weather}.webp`} alt={trackDetails.weather} height={22} title={trackDetails.weather} />}
                                    {/* {trackDetails.condition && <img src={`${import.meta.env.BASE_URL}assets/track_details/${trackDetails.condition}.webp`} alt={trackDetails.condition} height={22} title={trackDetails.condition} />} */}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* MIDDLE SECTION: Toggles */}
                    <div className="d-flex flex-column justify-content-center" style={{ flex: "1 1 350px", marginTop: 4 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px 12px" }}>
                            {toggleDefs.map(({ id, label }) => (
                                <Form.Check
                                    key={id}
                                    type="checkbox"
                                    id={`toggle-${id}`}
                                    label={<span style={{ fontSize: "0.85em", whiteSpace: "nowrap" }}>{label}</span>}
                                    {...bind(id)}
                                    className="mb-0"
                                />
                            ))}
                        </div>
                    </div>

                    {/* RIGHT SECTION: Legends, Frame, ClipMaker */}
                    <div className="d-flex flex-column align-items-end ms-auto" style={{ flex: "0 1 auto" }}>
                        <div className="d-flex align-items-center mb-2" style={{ gap: 10, fontSize: "0.85em" }}>
                            <LegendItem color={STRAIGHT_FILL} label="Straight" />
                            <LegendItem color={STRAIGHT_FINAL_FILL} label="Final straight" />
                            <LegendItem color={CORNER_FILL} label="Corner" />
                            <LegendItem color={CORNER_FINAL_FILL} label="Final corner" />
                        </div>

                        <div className="mb-2" style={{ fontSize: "0.95em", color: "#ccc", whiteSpace: "nowrap" }}>
                            Frame: {isEditingFrame ? (
                                <input
                                    autoFocus
                                    type="number"
                                    value={tempFrameInput}
                                    onChange={(e) => setTempFrameInput(e.target.value)}
                                    onBlur={() => setIsEditingFrame(false)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleFrameJump();
                                        if (e.key === "Escape") setIsEditingFrame(false);
                                    }}
                                    className="frame-input-inline"
                                />
                            ) : (
                                <span
                                    onClick={() => {
                                        setTempFrameInput(interpolatedFrame.frameIndex.toString());
                                        setIsEditingFrame(true);
                                    }}
                                    className="frame-number-clickable"
                                    title="Click to jump to frame"
                                >
                                    {interpolatedFrame.frameIndex}
                                </span>
                            )} / {frames.length}
                            <OverlayTrigger
                                placement="top"
                                overlay={
                                    <Tooltip id="frame-interpolation-tooltip">
                                        For most of the race, we only receive new race frames from the server every second; both this replay (and the game client) interpolate between them to display the race.
                                    </Tooltip>
                                }
                            >
                                <span className="toggle-info-icon ms-1">ⓘ</span>
                            </OverlayTrigger>
                        </div>

                        {/* Clip Maker */}
                        <ClipMaker
                            minTime={startTime}
                            maxTime={endTime}
                            currentTime={clampedRenderTime}
                            onExport={handleExport}
                            isExporting={isExporting}
                        />
                    </div>
                </div>
            )}

            {legendNames.length > 0 && (
                <div className="char-vis-list">
                    {Object.entries(displayNames).map(([iStr, name]) => {
                        const idx = +iStr;
                        const state = characterVisibility[name] ?? 0;
                        const color = teamColorFor(idx, horseInfoByIdx[idx] ?? {}, trainerColors);
                        const stateClass = state === 1 ? " char-vis-dim" : state === 2 ? " char-vis-hidden" : "";
                        const stateTitle = state === 0 ? "Click to dim" : state === 1 ? "Click to hide" : "Click to show";
                        return (
                            <button key={name} className={`char-vis-btn${stateClass}`} onClick={() => cycleVisibility(name)} title={stateTitle} onMouseEnter={() => setHoveredLegendName(name)} onMouseLeave={() => setHoveredLegendName(null)}>
                                <span className="char-vis-dot" style={{ background: color }} />
                                {name}
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                style={{ position: "relative", height: "500px" }}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mx = e.clientX - rect.left;
                    const my = e.clientY - rect.top;
                    const containerW = e.currentTarget.offsetWidth;
                    const HIT_R2 = 32 * 32;
                    let nearest: { idx: number; x: number; y: number; containerW: number } | null = null;
                    let nearestD2 = HIT_R2;
                    for (const entry of horseHoverDataRef.current) {
                        const dx = mx - entry.cx, dy = my - entry.cy;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < nearestD2) { nearestD2 = d2; nearest = { idx: entry.idx, x: mx, y: my, containerW }; }
                    }
                    setHoveredHorse(nearest);
                }}
                onMouseLeave={() => setHoveredHorse(null)}
            >
                <EChartsReactCore
                    ref={echartsRef}
                    echarts={echarts}
                    option={options}
                    style={{ height: "500px", width: "100%" }}
                    notMerge={true}
                    theme="dark"
                />
                <canvas
                    ref={canvasRef}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                />
                {hoveredHorse !== null && (
                    <HorseTooltip
                        hoveredHorse={hoveredHorse}
                        entry={horseHoverDataRef.current.find(e => e.idx === hoveredHorse.idx)}
                        name={displayNames[hoveredHorse.idx] ?? ""}
                    />
                )}
            </div>

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
                    <InfoHover />
                </div>
            </div>
        </div>
    );
};

export default RaceReplay;

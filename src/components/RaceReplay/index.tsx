import React, { useMemo, useState, useEffect } from "react";
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
import type { MarkLine1DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";

import { RaceReplayProps } from "./RaceReplay.types";
import {
    STRAIGHT_FILL,
    CORNER_FILL,
    STRAIGHT_FINAL_FILL,
    CORNER_FINAL_FILL,
    TOOLBAR_GAP,
    TOOLBAR_INLINE_GAP,
} from "./RaceReplay.constants";
import { clamp } from "./RaceReplay.utils";
import { useRafPlayer } from "./hooks/useRafPlayer";
import { useInterpolatedFrame } from "./hooks/useInterpolatedFrame";
import { useCurrentAcceleration } from "./hooks/useCurrentAcceleration";
import { useAvailableTracks } from "./hooks/useAvailableTracks";
import { useGuessTrack } from "./hooks/useGuessTrack";
import { useCourseLayers, slopeRenderItemFactory } from "./hooks/useCourseLayers";
import { useToggles } from "./hooks/useToggles";
import { useRaceDerivedData } from "./hooks/useRaceDerivedData";
import { useRaceExport } from "./hooks/useRaceExport";
import InfoHover from "./components/InfoHover";
import LegendItem from "./components/LegendItem";
import ClipMaker from "./components/ClipMaker";
import {
    createOptions,
    buildLegendShadowSeries,
    buildHorsesCustomSeries,
    buildSkillLabels,
    buildCourseLabelItems,
    buildMarkLines,
    noTooltipScatter,
    buildPositionKeepSeries,
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
    infoTitle,
    infoContent,
    detectedCourseId,
    onTrackChange,
}) => {
    const frames = useMemo(() => raceData.frame ?? [], [raceData]);
    const startTime = frames[0]?.time ?? 0, endTime = frames[frames.length - 1]?.time ?? 0;
    const { time: renderTime, setTime: setRenderTime, isPlaying, setIsPlaying, playPause, setPlaybackRate } = useRafPlayer(startTime, endTime);



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
    const interpolatedFrame = useInterpolatedFrame(frames, renderTime);

    const accByIdx = useCurrentAcceleration(frames, interpolatedFrame.frameIndex);

    const frontRunnerDistance = interpolatedFrame.horseFrame.reduce((m: number, h: any) => Math.max(m, h?.distance ?? 0), 0);
    const cameraWindow = 80, cameraLead = 8;
    const xAxis = useMemo(() => ({ min: Math.max(0, Math.max(cameraWindow, Math.min(frontRunnerDistance, goalInX) + cameraLead) - cameraWindow), max: Math.max(cameraWindow, Math.min(frontRunnerDistance, goalInX) + cameraLead) }), [frontRunnerDistance, goalInX]);

    const horseInfoByIdx = useMemo(() => { const map: Record<number, any> = {}; (raceHorseInfo ?? []).forEach((h: any) => { const idx = (h.frame_order ?? h.frameOrder) - 1; if (idx >= 0) map[idx] = h; }); return map; }, [raceHorseInfo]);

    const { t: toggles, bind } = useToggles();

    const {
        maxHpByIdx,
        consumptionRateByIdx,
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
        interpolatedFrame,
        toggles
    );

    const legendNames = useMemo(() => Object.values(displayNames), [displayNames]);
    const [legendSelection, setLegendSelection] = useState<Record<string, boolean>>({});
    useEffect(() => { setLegendSelection(prev => { const next: Record<string, boolean> = {}; legendNames.forEach(n => { next[n] = prev[n] ?? true; }); return next; }); }, [legendNames]);
    const onEvents = useMemo(() => ({ legendselectchanged: (e: any) => { if (e && e.selected) setLegendSelection(e.selected); } }), []);

    const startDelayByIdx = useMemo(() => {
        const map: Record<number, number> = {};
        (raceData.horseResult ?? []).forEach((hr, idx) => { if (hr) map[idx] = hr.startDelayTime ?? 0; });
        return map;
    }, [raceData.horseResult]);

    const echartsRef = React.useRef<any>(null);
    const { isExporting, handleExport } = useRaceExport(echartsRef, renderTime, isPlaying, playPause, setRenderTime);
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
                toggles.blocked,
                toggles.hp,
                maxHpByIdx,
                goalInX,
                consumptionRateByIdx,
                trainedCharaByIdx,
                oonigeByIdx,
                lastSpurtStartDistances,
                trackSlopes,
                skillActivations,
                passiveStatModifiers,
                combinedOtherEvents,
                selectedTrackId ? +selectedTrackId : undefined,
                startDelayByIdx
            ),
        [interpolatedFrame, displayNames, horseInfoByIdx, trainerColors, legendSelection, toggles.speed, toggles.accel, accByIdx, toggles.blocked, toggles.hp, maxHpByIdx, goalInX, consumptionRateByIdx, trainedCharaByIdx, oonigeByIdx, lastSpurtStartDistances, trackSlopes, skillActivations, passiveStatModifiers, combinedOtherEvents, selectedTrackId, startDelayByIdx]
    );

    const yMaxWithHeadroom = maxLanePosition + 3;
    const skillLabelData = useMemo(() => buildSkillLabels(
        interpolatedFrame,
        skillActivations,
        combinedOtherEvents,
        renderTime,
        horseInfoByIdx,
        trainerColors,
        displayNames,
        legendSelection,
        toggles.heuristics,
        trainedCharaByIdx,
        oonigeByIdx,
        trackSlopes,
        passiveStatModifiers,
        goalInX,
        accByIdx,
        consumptionRateByIdx
    ), [interpolatedFrame, skillActivations, combinedOtherEvents, renderTime, horseInfoByIdx, trainerColors, displayNames, legendSelection, toggles.heuristics, trainedCharaByIdx, oonigeByIdx, trackSlopes, passiveStatModifiers, goalInX, accByIdx, consumptionRateByIdx]);
    const { straights, corners, straightsFinal, cornersFinal, segMarkers, slopeTriangles } = useCourseLayers(selectedTrackId, goalInX, yMaxWithHeadroom);

    const raceMarkers = useMemo(() => { const td = selectedTrackId ? (GameDataLoader.courseData as Record<string, any>)[selectedTrackId] : undefined; return buildMarkLines(goalInX, raceData, displayNames, segMarkers, td); }, [goalInX, raceData, displayNames, segMarkers, selectedTrackId]);
    const courseLabelData = useMemo(() => buildCourseLabelItems(raceMarkers as MarkLine1DDataItemOption[], yMaxWithHeadroom), [raceMarkers, yMaxWithHeadroom]);

    const positionKeepSeries = useMemo(() => {
        if (!toggles.positionKeep || !goalInX) return null;
        if (frontRunnerDistance >= (10 / 24) * goalInX) return null;
        return buildPositionKeepSeries(frontRunnerDistance, goalInX, yMaxWithHeadroom);
    }, [toggles.positionKeep, goalInX, frontRunnerDistance, yMaxWithHeadroom]);

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
            positionKeepSeries,
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
    }, [bgSeries, toggles.slopes, slopeRenderItem, slopeTriangles, toggles.course, markerSeries, positionKeepSeries, legendShadowSeries, horsesSeries, courseLabelData, toggles.skills, skillLabelData]);

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
        {
            id: "skills" as const,
            label: (
                <span>
                    Skill labels
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="skills-info-tooltip">
                                Toggles popups above Umas' heads to display skill procs and assorted race events like dueling.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "hp" as const,
            label: (
                <span>
                    HP Bar
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="hp-info-tooltip">
                                Toggles an HP bar to visualize remaining HP; displays numeric values and estimates for time to live during late-race.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "blocked" as const,
            label: (
                <span>
                    Block indicator
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="blocked-info-tooltip">
                                Directly received from the server, but due to the low frequency of race frames during most of the race, short blocks can be missed.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "slopes" as const,
            label: (
                <span>
                    Slopes
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="slopes-info-tooltip">
                                Visualizes uphills and downhills on the replay; the visuals are not to scale - refer to the value displayed at the start of each slope for its angle.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "speed" as const,
            label: (
                <span>
                    Speed [m/s]
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="speed-info-tooltip">
                                Directly received from the server for each race frame; inter-frame values are interpolated.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "accel" as const,
            label: (
                <span>
                    Acceleration [m/s^2]
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="accel-info-tooltip">
                                Not directly received from the server, derived via the speed change between the current and next race frame.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "heuristics" as const,
            label: (
                <span>
                    Mode heuristics
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="heuristics-info-tooltip">
                                Attempts to display when Umas are in Pace Up, Pace Down, Overtake, or Speed Up mode during Position Keep.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "course" as const,
            label: (
                <span>
                    Course events
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="course-events-info-tooltip">
                                Toggles display for assorted information like corners, straights, slopes, and race sections.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
        {
            id: "positionKeep" as const,
            label: (
                <span>
                    Position Keep
                    <OverlayTrigger
                        placement="top"
                        overlay={
                            <Tooltip id="position-keep-info-tooltip">
                                Displays position keep zones for each style: when you're ahead of the displayed area you are hit with Pace Down, if you're behind it you roll Wit checks for Pace Up.
                            </Tooltip>
                        }
                    >
                        <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                    </OverlayTrigger>
                </span>
            )
        },
    ];

    const [isEditingFrame, setIsEditingFrame] = useState(false);
    const [tempFrameInput, setTempFrameInput] = useState("");

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEditingFrame) return;
            if (e.key === "ArrowUp") {
                e.preventDefault();
                const currentIdx = interpolatedFrame.frameIndex;
                if (currentIdx < frames.length - 1) {
                    setRenderTime(frames[currentIdx + 1].time ?? 0);
                }
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const currentIdx = interpolatedFrame.frameIndex;
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
    }, [frames, interpolatedFrame.frameIndex, isEditingFrame, setIsPlaying, setPlaybackRate, setRenderTime]);

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
                                {guessStatus === "detected" && selectedTrackId && !availableTracks.some(t => t.id === selectedTrackId) && (
                                    <option key={selectedTrackId} value={selectedTrackId}>
                                        {`Detected Track (${selectedTrackId})`}
                                    </option>
                                )}
                            </Form.Control>
                        </div>
                        <div className="mt-2" style={{ minHeight: 20 }}>
                            {guessStatus === "detected" && (
                                <span style={{ color: "green" }}>
                                    Detected track from race data
                                </span>
                            )}
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

                    <div className="d-flex flex-column" style={{ marginRight: TOOLBAR_GAP, marginBottom: TOOLBAR_GAP }}>
                        <div className="d-flex align-items-start" style={{ gap: TOOLBAR_INLINE_GAP }}>
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

                    </div>


                    <div className="d-flex flex-column align-items-end" style={{ marginLeft: "auto", marginBottom: TOOLBAR_GAP }}>
                        <div className="d-flex align-items-center" style={{ flexWrap: "wrap", marginBottom: 4 }}>
                            <LegendItem color={STRAIGHT_FILL} label="Straight" />
                            <LegendItem color={STRAIGHT_FINAL_FILL} label="Final straight" />
                            <LegendItem color={CORNER_FILL} label="Corner" />
                            <LegendItem color={CORNER_FINAL_FILL} label="Final corner" />
                        </div>
                        <span className="mt-1" style={{ fontSize: "0.9em", color: "#aaa", whiteSpace: "nowrap" }}>
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
                                    style={{
                                        width: "60px",
                                        backgroundColor: "#333",
                                        color: "#fff",
                                        border: "1px solid #555",
                                        borderRadius: "4px",
                                        padding: "0 4px",
                                        fontSize: "inherit",
                                    }}
                                />
                            ) : (
                                <span
                                    onClick={() => {
                                        setTempFrameInput(interpolatedFrame.frameIndex.toString());
                                        setIsEditingFrame(true);
                                    }}
                                    style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
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
                                <span style={{ marginLeft: 5, cursor: "help", borderBottom: "1px dotted #aaa" }}>ⓘ</span>
                            </OverlayTrigger>
                        </span>

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

            <EChartsReactCore
                ref={echartsRef}
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

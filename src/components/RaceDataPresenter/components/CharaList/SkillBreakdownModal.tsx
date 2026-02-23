import React from 'react';
import { Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { CharaTableData } from './types';
import AssetLoader from "../../../../data/AssetLoader";
import GameDataLoader from "../../../../data/GameDataLoader";
import { getSkillDef } from "../../../RaceReplay/utils/SkillDataUtils";
import './SkillBreakdownModal.css';

interface SkillBreakdownModalProps {
    show: boolean;
    onHide: () => void;
    charaData: CharaTableData;
    courseId?: number;
}

const TrackVisualization: React.FC<{
    courseId?: number;
    totalDistance: number;
}> = ({ courseId, totalDistance }) => {
    if (!courseId) return null;
    let courseData: any;
    try {
        courseData = GameDataLoader.courseData[courseId];
    } catch {
        return null;
    }
    if (!courseData) return null;

    const p1 = totalDistance / 6;
    const p2 = totalDistance * 2 / 3;
    const p3 = totalDistance * 5 / 6;

    const criticalPoints = new Set([0, totalDistance]);
    (courseData.slopes || []).forEach((s: any) => {
        criticalPoints.add(Math.min(totalDistance, s.start));
        criticalPoints.add(Math.min(totalDistance, Math.max(0, s.start + s.length)));
    });
    const sortedPoints = Array.from(criticalPoints).sort((a, b) => a - b);

    let elevation = 0;
    const pathObj = [{ x: 0, y: 0 }];
    let maxElevation = 0;
    let minElevation = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const mid = (start + end) / 2;
        const activeSlope = (courseData.slopes || []).find((s: any) => mid >= s.start && mid <= s.start + s.length);
        const slopeVal = activeSlope ? activeSlope.slope / 10000 : 0;

        elevation += (end - start) * slopeVal;
        pathObj.push({ x: end, y: elevation });
        if (elevation > maxElevation) maxElevation = elevation;
        if (elevation < minElevation) minElevation = elevation;
    }

    const h = 40;
    const range = Math.max(1, maxElevation - minElevation);
    const getY = (y: number) => ((maxElevation - y) / range) * (h - 10) + 5;

    const pathD = `M 0 ${h} ` + pathObj.map(p => `L ${(p.x / totalDistance) * 100} ${getY(p.y)}`).join(" ") + ` L 100 ${h} Z`;

    const markers = [p1, p2, p3];

    return (
        <div className="sbm-vis-wrapper">
            <div className="sbm-phase-map">
                <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none" className="sbm-phase-svg">
                    <defs>
                        <clipPath id={`track-clip-${courseId}`}>
                            <path d={pathD} />
                        </clipPath>
                    </defs>
                    <g clipPath={`url(#track-clip-${courseId})`}>
                        <rect x="0" y="0" width={`${(p1 / totalDistance) * 100}`} height="40" fill="#3B82F6" opacity="0.8" />
                        <rect x={`${(p1 / totalDistance) * 100}`} y="0" width={`${((p2 - p1) / totalDistance) * 100}`} height="40" fill="#10B981" opacity="0.8" />
                        <rect x={`${(p2 / totalDistance) * 100}`} y="0" width={`${((p3 - p2) / totalDistance) * 100}`} height="40" fill="#F59E0B" opacity="0.8" />
                        <rect x={`${(p3 / totalDistance) * 100}`} y="0" width={`${((totalDistance - p3) / totalDistance) * 100}`} height="40" fill="#EF4444" opacity="0.8" />
                    </g>
                </svg>
                {markers.map((m, i) => (
                    <React.Fragment key={i}>
                        <div className="sbm-marker-line" style={{ left: `${(m / totalDistance) * 100}%` }} />
                        <div className="sbm-marker-text" style={{ left: `${(m / totalDistance) * 100}%` }}>{Math.round(m)}m</div>
                    </React.Fragment>
                ))}
                {sortedPoints.filter(p => p > 0 && p < totalDistance).map((p, i) => {
                    const slopesAround = (courseData.slopes || []).filter((s: any) => s.start === p || s.start + s.length === p);
                    if (slopesAround.length === 0) return null;
                    const validSlope = slopesAround.find((s: any) => s.slope !== 0);
                    if (!validSlope) return null;
                    const isUp = validSlope.slope > 0;
                    const color = isUp ? '#fbbf24' : '#60a5fa'; // Blue for downhill, orange for uphill
                    const icon = isUp ? '↑' : '↓';

                    return (
                        <React.Fragment key={`slope-${i}`}>
                            <div className="sbm-slope-line" style={{ left: `${(p / totalDistance) * 100}%`, backgroundColor: isUp ? 'rgba(251,191,36,0.6)' : 'rgba(96,165,250,0.6)' }} />
                            <div className="sbm-slope-text" style={{ left: `${(p / totalDistance) * 100}%`, color }}>{icon}{Math.round(p)}m</div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

const SkillBreakdownModal: React.FC<SkillBreakdownModalProps> = ({ show, onHide, charaData, courseId }) => {
    const totalDistance = charaData.raceDistance;
    const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

    // Sort events by time
    const rawEvents = (charaData.skillEvents ?? [])
        .slice()
        .sort((a, b) => a.time - b.time);

    let validEvents: any[] = [];
    const zeroMEvents = rawEvents.filter(e => e.startDistance === 0 && e.durationSecs === 0);
    const otherEvents = rawEvents.filter(e => !(e.startDistance === 0 && e.durationSecs === 0));

    if (zeroMEvents.length > 1) {
        validEvents.push({
            isGroupedZeroM: true,
            name: `${zeroMEvents.length} Start Skills`,
            events: zeroMEvents,
            startDistance: 0,
            endDistance: Math.max(...zeroMEvents.map(e => e.endDistance)),
            durationSecs: Math.max(...zeroMEvents.map(e => e.durationSecs)),
            isInstant: false,
            isMode: false,
            time: 0
        });
        validEvents.push(...otherEvents);
    } else {
        validEvents = rawEvents;
    }

    return (
        <Modal show={show} onHide={onHide} size="lg" centered>
            <Modal.Header closeButton>
                <Modal.Title>Skill Activation Breakdown</Modal.Title>
            </Modal.Header>
            <div className="sbm-header-container">
                {/* Left Labels Column */}
                <div className="sbm-labels">
                    <div className="sbm-label-course">
                        Course Layout
                    </div>
                    {charaData.positionHistory && charaData.positionHistory.length > 0 && (
                        <div className="sbm-label-pos">
                            Current Position
                        </div>
                    )}
                </div>

                <div className="sbm-visualizer">
                    <TrackVisualization courseId={courseId} totalDistance={totalDistance} />
                    {(() => {
                        let courseData: any;
                        try { courseData = GameDataLoader.courseData[courseId!]; } catch { return null; }
                        const segments: { start: number; end: number; type: 'straight' | 'corner'; label: string; fullLabel: string }[] = [];
                        const corners = courseData?.corners || [];
                        corners.forEach((c: any, index: number) => {
                            const isFinal = index === corners.length - 1;
                            const label = isFinal ? 'FC' : `C${index + 1}`;
                            const fullLabel = isFinal ? 'Final Corner' : `Corner ${index + 1}`;
                            segments.push({ start: c.start, end: c.start + c.length, type: 'corner', label, fullLabel });
                        });
                        const straights = courseData?.straights || [];
                        straights.forEach((s: any, index: number) => {
                            const isFinal = index === straights.length - 1;
                            const label = isFinal ? 'FS' : `S${index + 1}`;
                            const fullLabel = isFinal ? 'Final Straight' : `Straight ${index + 1}`;
                            segments.push({ start: s.start, end: s.end, type: 'straight', label, fullLabel });
                        });
                        segments.sort((a, b) => a.start - b.start);
                        const validSegments = segments.filter(s => s.start < totalDistance).map(s => ({ ...s, end: Math.min(s.end, totalDistance) }));
                        return (
                            <div className="sbm-segments-container">
                                <div className="sbm-segments-bar">
                                    {validSegments.map((s, i) => {
                                        const widthPct = ((s.end - s.start) / totalDistance) * 100;
                                        if (widthPct <= 0) return null;
                                        return (
                                            <div key={i} className="sbm-segment" style={{
                                                width: `${widthPct}%`,
                                                backgroundColor: s.type === 'straight' ? '#A3E635' : '#10B981',
                                                borderRight: i < validSegments.length - 1 ? '1px solid rgba(0,0,0,0.2)' : 'none',
                                            }} title={`${s.fullLabel} (${Math.round(s.start)}m - ${Math.round(s.end)}m)`}>
                                                {s.label}
                                            </div>
                                        );
                                    })}
                                </div>
                                {validSegments.filter(s => s.start > 0).map((s, i) => (
                                    <div key={`m-${i}`} className="sbm-segment-label" style={{ left: `${(s.start / totalDistance) * 100}%` }}>
                                        {Math.round(s.start)}m
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {charaData.positionHistory && charaData.positionHistory.length > 0 && (
                        <div className="sbm-pos-container">
                            {charaData.positionHistory.map((p, i) => {
                                const widthPct = ((p.endDistance - p.startDistance) / totalDistance) * 100;
                                if (widthPct <= 0) return null;

                                const rankColors = [
                                    '#fbbf24', '#cbd5e1', '#b45309', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#ef4444',
                                    '#f97316', '#84cc16', '#14b8a6', '#0ea5e9', '#6366f1', '#d946ef', '#f43f5e', '#8b5cf6',
                                    '#059669', '#dc2626'
                                ];
                                const rankColor = p.rank === 1 ? '#fbbf24' : rankColors[(p.rank - 1) % rankColors.length];

                                return (
                                    <div key={`pos-${i}`} className="sbm-pos-segment" style={{
                                        width: `${widthPct}%`,
                                        backgroundColor: rankColor,
                                        borderRight: i < charaData.positionHistory!.length - 1 ? '1px solid rgba(0,0,0,0.2)' : 'none',
                                    }} title={`Rank ${p.rank} (${Math.round(p.startDistance)}m - ${Math.round(p.endDistance)}m)`}>
                                        {widthPct > 2 && p.rank}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {hoveredIdx !== null && validEvents[hoveredIdx] && (() => {
                        const evt = validEvents[hoveredIdx];
                        if (evt.isGroupedZeroM) {
                            return evt.events.map((subEvt: any, sIdx: number) => {
                                const startPct = 0;
                                const endPct = Math.min(100, Math.max(0, (subEvt.endDistance / totalDistance) * 100));
                                const widthPct = Math.max(0, endPct - startPct);
                                return (widthPct > 0 ?
                                    <div key={`hov-sub-${sIdx}`} className="sbm-highlight-box" style={{
                                        left: `${startPct}%`,
                                        width: `${widthPct}%`,
                                    }} />
                                    : null
                                );
                            });
                        }

                        if (evt.segments) {
                            return evt.segments.map((seg: any, sIdx: number) => {
                                const startPct = Math.min(100, Math.max(0, (seg.startDistance / totalDistance) * 100));
                                const endPct = Math.min(100, Math.max(0, (seg.endDistance / totalDistance) * 100));
                                const widthPct = Math.max(0, endPct - startPct);
                                return (
                                    <div key={`hov-${sIdx}`} className="sbm-highlight-box" style={{
                                        left: `${startPct}%`,
                                        width: `${widthPct}%`,
                                    }} />
                                );
                            });
                        }

                        if (evt.isMode) return null;

                        const startPct = Math.min(100, Math.max(0, (evt.startDistance / totalDistance) * 100));
                        const endPct = Math.min(100, Math.max(0, (evt.endDistance / totalDistance) * 100));
                        const widthPct = Math.max(0, endPct - startPct);
                        return (
                            <div className="sbm-highlight-box" style={{
                                left: `${startPct}%`,
                                width: `${widthPct}%`,
                            }} />
                        );
                    })()}
                </div>
            </div>
            <Modal.Body style={{ maxHeight: '60vh', overflowY: 'scroll', overflowX: 'hidden', padding: 0 }}>
                <div className="sbm-list-container">
                    {validEvents.map((evt, idx) => {
                        if (evt.isGroupedZeroM) {
                            return (
                                <div
                                    key={idx}
                                    onMouseEnter={() => setHoveredIdx(idx)}
                                    onMouseLeave={() => setHoveredIdx(null)}
                                    className="sbm-list-item"
                                >
                                    <div className="sbm-item-left">
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {evt.events.map((e: any, i: number) => {
                                                const skillDef = getSkillDef(e.skillId);
                                                const iconUrl = e.iconId ? AssetLoader.getSkillIcon(e.iconId) : (skillDef?.iconid ? AssetLoader.getSkillIcon(skillDef.iconid) : null);
                                                return iconUrl ? (
                                                    <OverlayTrigger key={i} placement="top" overlay={<Tooltip id={`tt-${idx}-${i}`}>{e.name}</Tooltip>}>
                                                        <img src={iconUrl} alt="skill" className="sbm-item-icon" style={{ margin: 0, width: '24px', height: '24px' }} />
                                                    </OverlayTrigger>
                                                ) : (
                                                    <OverlayTrigger key={i} placement="top" overlay={<Tooltip id={`tt-${idx}-${i}`}>{e.name}</Tooltip>}>
                                                        <span style={{ fontSize: '10px', display: 'inline-block', padding: '2px', backgroundColor: '#eee', borderRadius: '2px', cursor: 'help' }}>{e.name}</span>
                                                    </OverlayTrigger>
                                                );
                                            })}
                                        </div>
                                        <span className="sbm-item-name" style={{ marginLeft: '8px' }}>
                                            {evt.name}
                                        </span>
                                    </div>
                                    <div className="sbm-item-right">
                                        <div className="sbm-item-desc">
                                            Activation: 0m (0%)
                                        </div>
                                        <div className="sbm-item-track-container">
                                            <div className="sbm-item-track-bg">
                                                {evt.events.map((e: any, i: number) => {
                                                    const sPct = 0;
                                                    const ePct = Math.min(100, Math.max(0, (e.endDistance / totalDistance) * 100));
                                                    const wPct = Math.max(0, ePct - sPct);
                                                    const skillDef = getSkillDef(e.skillId);
                                                    const isGold = skillDef?.rarity === 2 || skillDef?.rarity === 3;

                                                    return wPct > 0 ? (
                                                        <div key={`gseg-${i}`} style={{
                                                            position: 'absolute',
                                                            left: `${sPct}%`,
                                                            width: `${wPct}%`,
                                                            height: '100%',
                                                            backgroundColor: isGold ? '#fbbf24' : '#65D283',
                                                            opacity: 0.5
                                                        }} />
                                                    ) : null;
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        const skillDef = getSkillDef(evt.skillId);
                        const isGold = skillDef?.rarity === 2 || skillDef?.rarity === 3;
                        const iconUrl = evt.iconId ? AssetLoader.getSkillIcon(evt.iconId) : (skillDef?.iconid ? AssetLoader.getSkillIcon(skillDef.iconid) : null);

                        const startPct = Math.min(100, Math.max(0, (evt.startDistance / totalDistance) * 100));
                        const endPct = Math.min(100, Math.max(0, (evt.endDistance / totalDistance) * 100));
                        const widthPct = Math.max(0.5, endPct - startPct);

                        return (
                            <div
                                key={idx}
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                className="sbm-list-item"
                            >
                                <div className="sbm-item-left">
                                    {iconUrl && <img src={iconUrl} alt="skill" className="sbm-item-icon" />}
                                    <span className="sbm-item-name" title={evt.name}>
                                        {evt.name}
                                    </span>
                                    {evt.name === "Pace Up Mode" && (
                                        <OverlayTrigger
                                            placement="top"
                                            overlay={
                                                <Tooltip id={`tooltip-pace-${idx}`}>
                                                    For front runners, both speed up mode and overtake mode are treated as pace up mode here
                                                </Tooltip>
                                            }
                                        >
                                            <span className="sbm-item-info">
                                                ⓘ
                                            </span>
                                        </OverlayTrigger>
                                    )}
                                </div>
                                <div className="sbm-item-right">
                                    <div className="sbm-item-desc">
                                        {evt.isMode ? (
                                            `Total Duration: ${evt.durationSecs.toFixed(1)}s`
                                        ) : (
                                            <>
                                                {evt.isInstant ? (
                                                    `Activation: ${Math.round(evt.startDistance)}m (${Math.round(startPct)}%)`
                                                ) : (
                                                    `Activation: ${Math.round(evt.startDistance)}m-${Math.round(evt.endDistance)}m (${Math.round(startPct)}%-${Math.round(endPct)}%)`
                                                )}
                                                {!evt.isInstant && (
                                                    <span className="sbm-item-dur">{evt.durationSecs.toFixed(1)}s duration</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    {(evt.segments || !evt.isMode) && (
                                        <div className="sbm-item-track-container">
                                            <div className="sbm-item-track-bg">
                                                {evt.segments ? (
                                                    evt.segments.map((seg: any, sIdx: number) => {
                                                        const sPct = Math.min(100, Math.max(0, (seg.startDistance / totalDistance) * 100));
                                                        const ePct = Math.min(100, Math.max(0, (seg.endDistance / totalDistance) * 100));
                                                        const wPct = Math.max(0, ePct - sPct);
                                                        return (
                                                            <div key={`seg-${sIdx}`} style={{
                                                                position: 'absolute',
                                                                left: `${sPct}%`,
                                                                width: `${wPct}%`,
                                                                height: '100%',
                                                                backgroundColor: '#65D283'
                                                            }} />
                                                        );
                                                    })
                                                ) : (
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: `${startPct}%`,
                                                        width: `${widthPct}%`,
                                                        height: '100%',
                                                        backgroundColor: isGold ? '#fbbf24' : '#65D283'
                                                    }} />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {validEvents.length === 0 && (
                        <div className="sbm-empty">
                            No skill activations recorded.
                        </div>
                    )}
                </div>
            </Modal.Body>
        </Modal>
    );
};

export default SkillBreakdownModal;

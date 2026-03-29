import React, { useEffect, useMemo, useState } from "react";
import CourseShapeLoader, { CourseShapeEntry, CourseShapePoint } from "../../../data/CourseShapeLoader";
import GameDataLoader from "../../../data/GameDataLoader";

interface VisibleRange {
    min: number;
    max: number;
}

interface CourseMinimapProps {
    trackId: string | null;
    visibleRange: VisibleRange | null;
}

type LoadState = "idle" | "loading" | "ready" | "missing" | "error";

const VIEWBOX_WIDTH = 184;
const VIEWBOX_HEIGHT = 124;
const PADDING = 5;
const SLOPE_MARKER_DISTANCE_OFFSET = 12;
const SLOPE_TRANSITION_MERGE_DISTANCE = 5;
const SLOPE_MARKER_DEDUPE_DISTANCE = 5;
const SLOPE_MARKER_DEDUPE_PIXEL_DISTANCE = 8;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function pointToString([x, y]: CourseShapePoint) {
    return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function clampRange(start: number, end: number, max: number): [number, number] {
    return [clamp(start, 0, max), clamp(end, 0, max)];
}

function interpolateTrackPoint(points: CourseShapePoint[], ratio: number) {
    const maxIndex = points.length - 1;
    const scaledIndex = clamp(ratio, 0, 1) * maxIndex;
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(maxIndex, Math.ceil(scaledIndex));
    const alpha = scaledIndex - lowerIndex;
    const lower = points[lowerIndex];
    const upper = points[upperIndex];
    const point: CourseShapePoint = [
        lower[0] + (upper[0] - lower[0]) * alpha,
        lower[1] + (upper[1] - lower[1]) * alpha,
    ];
    const prev = points[Math.max(0, lowerIndex - 1)];
    const next = points[Math.min(maxIndex, upperIndex + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;
    const tangentX = dx / length;
    const tangentY = dy / length;
    const normalX = -dy / length;
    const normalY = dx / length;
    return {
        x: point[0],
        y: point[1],
        tangentX,
        tangentY,
        normalX,
        normalY,
    };
}

function buildSegmentPoints(points: CourseShapePoint[], startRatio: number, endRatio: number) {
    const maxIndex = points.length - 1;
    const startScaled = clamp(startRatio, 0, 1) * maxIndex;
    const endScaled = clamp(endRatio, 0, 1) * maxIndex;
    if (endScaled <= startScaled) return [];

    const startPoint = interpolateTrackPoint(points, startRatio);
    const endPoint = interpolateTrackPoint(points, endRatio);
    const segmentPoints: CourseShapePoint[] = [[startPoint.x, startPoint.y]];

    const firstInteriorIndex = Math.ceil(startScaled);
    const lastInteriorIndex = Math.floor(endScaled);
    for (let index = firstInteriorIndex; index <= lastInteriorIndex; index++) {
        if (index > 0 && index < maxIndex) {
            segmentPoints.push(points[index]);
        }
    }

    segmentPoints.push([endPoint.x, endPoint.y]);
    return segmentPoints;
}

function detectLoopSplitRatio(points: CourseShapePoint[]) {
    if (points.length < 8) return null;

    const startPoint = points[0];
    const startSearchIndex = Math.floor(points.length * 0.35);
    const endSearchIndex = Math.floor(points.length * 0.95);
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = startSearchIndex; index <= endSearchIndex; index++) {
        const point = points[index];
        const distance = Math.hypot(point[0] - startPoint[0], point[1] - startPoint[1]);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }

    if (bestIndex === -1 || bestDistance > 10) return null;
    return bestIndex / (points.length - 1);
}

const CourseMinimap: React.FC<CourseMinimapProps> = ({ trackId, visibleRange }) => {
    const [shape, setShape] = useState<CourseShapeEntry | null>(null);
    const [loadState, setLoadState] = useState<LoadState>("idle");

    useEffect(() => {
        let disposed = false;

        if (!trackId) {
            setShape(null);
            setLoadState("idle");
            return () => {
                disposed = true;
            };
        }

        setLoadState("loading");

        void CourseShapeLoader.initialize()
            .then(() => {
                if (disposed) return;
                const nextShape = CourseShapeLoader.getCourseShape(trackId) ?? null;
                setShape(nextShape);
                setLoadState(nextShape ? "ready" : "missing");
            })
            .catch(() => {
                if (disposed) return;
                setShape(null);
                setLoadState("error");
            });

        return () => {
            disposed = true;
        };
    }, [trackId]);

    const derivedShape = useMemo(() => {
        if (!shape || shape.points.length < 2) return null;

        const xs = shape.points.map(([x]) => x);
        const zs = shape.points.map(([, z]) => z);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        const spanX = Math.max(1, maxX - minX);
        const spanZ = Math.max(1, maxZ - minZ);
        const innerWidth = VIEWBOX_WIDTH - PADDING * 2;
        const innerHeight = VIEWBOX_HEIGHT - PADDING * 2;
        const scale = Math.min(innerWidth / spanX, innerHeight / spanZ);
        const offsetX = PADDING + (innerWidth - spanX * scale) / 2;
        const offsetY = PADDING + (innerHeight - spanZ * scale) / 2;

        const points: CourseShapePoint[] = shape.points.map(([x, z]) => [
            VIEWBOX_WIDTH - (offsetX + (x - minX) * scale),
            offsetY + (z - minZ) * scale,
        ]);

        return {
            points,
            path: points.map(pointToString).join(" "),
        };
    }, [shape]);

    const loopSplitRatio = useMemo(() => {
        if (!derivedShape) return null;
        return detectLoopSplitRatio(derivedShape.points);
    }, [derivedShape]);

    const highlight = useMemo(() => {
        if (!shape || !derivedShape || !visibleRange) return null;

        const startRatio = clamp(visibleRange.min / shape.distance, 0, 1);
        const endRatio = clamp(visibleRange.max / shape.distance, 0, 1);
        const segment = buildSegmentPoints(derivedShape.points, startRatio, endRatio);
        const marker = interpolateTrackPoint(derivedShape.points, endRatio);

        if (segment.length < 2) return null;

        return {
            path: segment.map(pointToString).join(" "),
            marker: [marker.x, marker.y] as CourseShapePoint,
        };
    }, [derivedShape, shape, visibleRange]);

    const currentLoopPass = useMemo(() => {
        if (!shape || !visibleRange || loopSplitRatio == null) return 1;
        const ratio = clamp(visibleRange.max / shape.distance, 0, 1);
        return ratio >= loopSplitRatio ? 2 : 1;
    }, [loopSplitRatio, shape, visibleRange]);

    const segmentPaths = useMemo(() => {
        if (!shape || !derivedShape || !trackId) return [];

        const td = (GameDataLoader.courseData as Record<string, any>)[trackId];
        if (!td) return [];

        const segments: { key: string; kind: "straight" | "corner"; path: string; active: boolean }[] = [];

        const loopBounds = loopSplitRatio == null
            ? [{ start: 0, end: shape.distance, pass: 1 as const }]
            : [
                { start: 0, end: loopSplitRatio * shape.distance, pass: 1 as const },
                { start: loopSplitRatio * shape.distance, end: shape.distance, pass: 2 as const },
            ];

        const pushSegment = (kind: "straight" | "corner", start: number, end: number, key: string) => {
            const [clampedStart, clampedEnd] = clampRange(start, end, shape.distance);
            if (clampedEnd <= clampedStart) return;

            loopBounds.forEach((loopBound, loopIndex) => {
                const segStart = Math.max(clampedStart, loopBound.start);
                const segEnd = Math.min(clampedEnd, loopBound.end);
                if (segEnd <= segStart) return;

                const points = buildSegmentPoints(
                    derivedShape.points,
                    segStart / shape.distance,
                    segEnd / shape.distance
                );
                if (points.length < 2) return;

                segments.push({
                    key: `${key}-loop-${loopIndex}`,
                    kind,
                    path: points.map(pointToString).join(" "),
                    active: loopSplitRatio == null || loopBound.pass === currentLoopPass,
                });
            });
        };

        (td.straights ?? []).forEach((segment: any, index: number) => {
            pushSegment("straight", segment.start, segment.end, `straight-${index}`);
        });

        (td.corners ?? []).forEach((segment: any, index: number) => {
            pushSegment("corner", segment.start, segment.start + segment.length, `corner-${index}`);
        });

        return segments;
    }, [currentLoopPass, derivedShape, loopSplitRatio, shape, trackId]);

    const slopeMarkers = useMemo(() => {
        if (!shape || !derivedShape || !trackId) return [];

        const td = (GameDataLoader.courseData as Record<string, any>)[trackId];
        if (!td) return [];

        const markers: { key: string; x: number; y: number; normalX: number; normalY: number; dir: "up" | "down"; isEnd: boolean; endArrow?: "\u2190" | "\u2192"; distance: number; iconKey: string }[] = [];
        const activeSlopes: Array<{ start: number; end: number; slope: number; index: number }> = [];

        (td.slopes ?? []).forEach((segment: any, index: number) => {
            const [start, end] = clampRange(segment.start, segment.start + segment.length, shape.distance);
            const span = end - start;
            if (span <= 0) return;
            if (loopSplitRatio != null) {
                const midRatio = ((start + end) / 2) / shape.distance;
                const pass = midRatio >= loopSplitRatio ? 2 : 1;
                if (pass !== currentLoopPass) return;
            }

            activeSlopes.push({ start, end, slope: segment.slope, index });
        });

        activeSlopes.sort((a, b) => a.start - b.start);

        activeSlopes.forEach((segment, activeIndex) => {
            const nextSegment = activeSlopes[activeIndex + 1];
            const skipEndMarker = !!nextSegment && nextSegment.start <= segment.end + SLOPE_TRANSITION_MERGE_DISTANCE;

            const shiftedStart = clamp(segment.start + SLOPE_MARKER_DISTANCE_OFFSET, 0, shape.distance);
            const shiftedEnd = clamp(segment.end + SLOPE_MARKER_DISTANCE_OFFSET, 0, shape.distance);
            const startSample = interpolateTrackPoint(derivedShape.points, shiftedStart / shape.distance);
            const endSample = interpolateTrackPoint(derivedShape.points, shiftedEnd / shape.distance);
            const dir = segment.slope > 0 ? "up" : "down";

            markers.push({
                key: `slope-${segment.index}-start`,
                x: startSample.x + startSample.normalX * 6,
                y: startSample.y + startSample.normalY * 6,
                normalX: startSample.normalX,
                normalY: startSample.normalY,
                dir,
                isEnd: false,
                distance: segment.start,
                iconKey: `start-${dir}`,
            });

            if (!skipEndMarker) {
                const endArrow = endSample.tangentX >= 0 ? "\u2192" : "\u2190";
                markers.push({
                    key: `slope-${segment.index}-end`,
                    x: endSample.x + endSample.normalX * 6,
                    y: endSample.y + endSample.normalY * 6,
                    normalX: endSample.normalX,
                    normalY: endSample.normalY,
                    dir,
                    isEnd: true,
                    endArrow,
                    distance: segment.end,
                    iconKey: `end-${dir}-${endArrow}`,
                });
            }
        });

        const dedupedMarkers: typeof markers = [];
        for (const marker of markers) {
            const isDuplicate = dedupedMarkers.some((existing) =>
                existing.iconKey === marker.iconKey &&
                (
                    Math.abs(existing.distance - marker.distance) <= SLOPE_MARKER_DEDUPE_DISTANCE ||
                    Math.hypot(existing.x - marker.x, existing.y - marker.y) <= SLOPE_MARKER_DEDUPE_PIXEL_DISTANCE
                )
            );
            if (!isDuplicate) dedupedMarkers.push(marker);
        }

        return dedupedMarkers;
    }, [currentLoopPass, derivedShape, loopSplitRatio, shape, trackId]);

    if (!shape || !derivedShape || loadState !== "ready") {
        return null;
    }

    return (
        <div className="course-minimap-card" aria-hidden="true">
            <svg
                className="course-minimap-svg"
                viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                role="img"
                aria-label={`Course outline for track ${trackId ?? "unknown"}`}
            >
                <polyline
                    className="course-minimap-outline"
                    points={derivedShape.path}
                />
                {segmentPaths.map((segment) => (
                    <polyline
                        key={segment.key}
                        className={
                            segment.kind === "straight"
                                ? (segment.active ? "course-minimap-segment-straight" : "course-minimap-segment-straight-inactive")
                                : (segment.active ? "course-minimap-segment-corner" : "course-minimap-segment-corner-inactive")
                        }
                        points={segment.path}
                    />
                ))}
                {slopeMarkers.map((marker) => (
                    <text
                        key={marker.key}
                        className={
                            marker.isEnd
                                ? (marker.dir === "up" ? "course-minimap-slope-end-up" : "course-minimap-slope-end-down")
                                : marker.dir === "up"
                                    ? "course-minimap-slope-up"
                                    : "course-minimap-slope-down"
                        }
                        x={marker.x}
                        y={marker.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                    >
                        {marker.isEnd ? marker.endArrow : (marker.dir === "up" ? "\u2191" : "\u2193")}
                    </text>
                ))}
                {highlight && (
                    <>
                        <polyline
                            className="course-minimap-highlight"
                            points={highlight.path}
                        />
                        <circle
                            className="course-minimap-marker"
                            cx={highlight.marker[0]}
                            cy={highlight.marker[1]}
                            r={3.5}
                        />
                    </>
                )}
            </svg>
        </div>
    );
};

export default CourseMinimap;

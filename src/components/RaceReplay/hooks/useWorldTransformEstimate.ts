import { useEffect, useMemo, useState } from "react";
import CourseShapeLoader from "../../../data/CourseShapeLoader";
import GameDataLoader from "../../../data/GameDataLoader";
import { RaceSimulateFrameData } from "../../../data/race_data_pb";

const BASE_LANE_WIDTH_METERS = 11.25;
const LANE_POSITION_MAX = 9999;

type CoursePoint = [number, number];

export type WorldTransformEstimate = {
    baseRatio: number;
    cumulativeLossByFrame: number[][];
    laneMaxMeters: number;
    ratioByFrame: number[][];
};

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function computeSignedArea(points: CoursePoint[]) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[(index + 1) % points.length];
        area += x1 * y2 - x2 * y1;
    }
    return area / 2;
}

function interpolateTrackPoint(points: CoursePoint[], ratio: number) {
    const maxIndex = points.length - 1;
    const scaledIndex = clamp(ratio, 0, 1) * maxIndex;
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(maxIndex, Math.ceil(scaledIndex));
    const alpha = scaledIndex - lowerIndex;
    const lower = points[lowerIndex];
    const upper = points[upperIndex];
    const x = lower[0] + (upper[0] - lower[0]) * alpha;
    const y = lower[1] + (upper[1] - lower[1]) * alpha;
    const prev = points[Math.max(0, lowerIndex - 1)];
    const next = points[Math.min(maxIndex, upperIndex + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;

    return {
        leftNormalX: -dy / length,
        leftNormalY: dx / length,
        x,
        y,
    };
}

function lanePositionToMeters(lanePosition: number, laneMaxMeters: number) {
    return laneMaxMeters * clamp(lanePosition, 0, LANE_POSITION_MAX) / LANE_POSITION_MAX;
}

function courseDistanceFromSpeed(previousSpeed: number, currentSpeed: number, dt: number) {
    return (Math.min(previousSpeed, currentSpeed) / 100) * dt;
}

export function useWorldTransformEstimate(
    frames: RaceSimulateFrameData[],
    selectedTrackId: string | null,
    laneDistanceMax: number | undefined,
) {
    const [shapeVersion, setShapeVersion] = useState(0);

    useEffect(() => {
        let cancelled = false;
        void CourseShapeLoader.initialize()
            .then(() => {
                if (!cancelled) setShapeVersion((version) => version + 1);
            })
            .catch((error) => {
                console.error("Failed to initialize course data for world transform estimate", error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return useMemo<WorldTransformEstimate | null>(() => {
        void shapeVersion;

        if (!selectedTrackId || frames.length === 0) return null;

        const shape = CourseShapeLoader.getCourseShape(selectedTrackId);
        const baseRatio = CourseShapeLoader.getBaseRatio(selectedTrackId);
        if (!shape || !baseRatio || shape.points.length < 2) return null;

        const trackData = (GameDataLoader.courseData as Record<string, any>)[selectedTrackId];
        const laneMaxMeters = typeof laneDistanceMax === "number" && laneDistanceMax > 0
            ? (laneDistanceMax > 3 ? laneDistanceMax : BASE_LANE_WIDTH_METERS * laneDistanceMax)
            : (typeof trackData?.laneMax === "number" && trackData.laneMax > 0
                ? trackData.laneMax / 1000
                : BASE_LANE_WIDTH_METERS);
        const outwardSign = computeSignedArea(shape.points) < 0 ? 1 : -1;
        const horseCount = frames[0]?.horseFrame?.length ?? 0;
        const cumulativeLossByFrame = frames.map(() => Array.from({ length: horseCount }, () => 0));
        const ratioByFrame = frames.map(() => Array.from({ length: horseCount }, () => baseRatio));

        for (let frameIndex = 1; frameIndex < frames.length; frameIndex++) {
            const previousFrame = frames[frameIndex - 1];
            const currentFrame = frames[frameIndex];
            const dt = Math.max(0, (currentFrame.time ?? 0) - (previousFrame.time ?? 0));

            for (let horseIndex = 0; horseIndex < horseCount; horseIndex++) {
                cumulativeLossByFrame[frameIndex][horseIndex] = cumulativeLossByFrame[frameIndex - 1][horseIndex];

                const previousHorse = previousFrame.horseFrame[horseIndex];
                const currentHorse = currentFrame.horseFrame[horseIndex];
                if (!previousHorse || !currentHorse || dt <= 0) {
                    ratioByFrame[frameIndex][horseIndex] = ratioByFrame[frameIndex - 1][horseIndex];
                    continue;
                }

                const previousRatio = clamp(previousHorse.distance / shape.distance, 0, 1);
                const currentRatio = clamp(currentHorse.distance / shape.distance, 0, 1);
                const previousPoint = interpolateTrackPoint(shape.points, previousRatio);
                const currentPoint = interpolateTrackPoint(shape.points, currentRatio);
                const previousLaneMeters = lanePositionToMeters(previousHorse.lanePosition ?? 0, laneMaxMeters);
                const currentLaneMeters = lanePositionToMeters(currentHorse.lanePosition ?? 0, laneMaxMeters);

                const previousWorldX = previousPoint.x + previousPoint.leftNormalX * outwardSign * previousLaneMeters;
                const previousWorldY = previousPoint.y + previousPoint.leftNormalY * outwardSign * previousLaneMeters;
                const currentWorldX = currentPoint.x + currentPoint.leftNormalX * outwardSign * currentLaneMeters;
                const currentWorldY = currentPoint.y + currentPoint.leftNormalY * outwardSign * currentLaneMeters;

                const courseDelta = Math.max(0, (currentHorse.distance ?? 0) - (previousHorse.distance ?? 0));
                const worldPathLength = Math.hypot(currentWorldX - previousWorldX, currentWorldY - previousWorldY);
                const ratio = courseDelta > 1e-6 ? worldPathLength / courseDelta : baseRatio;
                ratioByFrame[frameIndex][horseIndex] = ratio;

                const baselineCourseDistance = courseDistanceFromSpeed(previousHorse.speed ?? 0, currentHorse.speed ?? 0, dt);
                const loss = Math.max(0, baselineCourseDistance - courseDelta);
                cumulativeLossByFrame[frameIndex][horseIndex] += loss;
            }
        }

        return {
            baseRatio,
            cumulativeLossByFrame,
            laneMaxMeters,
            ratioByFrame,
        };
    }, [frames, laneDistanceMax, selectedTrackId, shapeVersion]);
}

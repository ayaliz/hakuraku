import { applyNormalization, applyPreRaceAdjustments, buildFrontendRoom, encodeRoom } from "./featureBuilder";
import { loadRaceRoomModel } from "./loader";
import { getRaceRoomModelForCourse } from "./registry";
import { predictEncodedRoom } from "./runtime";
import type { RaceRoomModelSpec, RaceRoomPredictionResult } from "./types";

export type { RaceRoomModelSpec, RaceRoomPrediction, RaceRoomPredictionResult } from "./types";

export function getSupportedRaceRoomModel(courseId: number | undefined): RaceRoomModelSpec | null {
    return getRaceRoomModelForCourse(courseId);
}

export async function predictRaceRoom(
    raceHorseInfo: any[],
    effectiveCourseId: number | undefined,
): Promise<RaceRoomPredictionResult | null> {
    const modelSpec = getRaceRoomModelForCourse(effectiveCourseId);
    if (!modelSpec || effectiveCourseId === undefined) {
        return null;
    }

    const model = await loadRaceRoomModel(modelSpec);
    const rawRoom = buildFrontendRoom(raceHorseInfo, effectiveCourseId, modelSpec);
    if (!rawRoom) {
        return null;
    }

    const adjustedRoom = applyPreRaceAdjustments(rawRoom, model);
    const encoded = encodeRoom(adjustedRoom, model);
    const normalized = encoded.features.map((team) =>
        team.map((horse) => applyNormalization(horse, model.normalization.mean, model.normalization.std))
    );

    return {
        modelId: modelSpec.id,
        predictions: predictEncodedRoom(normalized, encoded.orderedHorses, model),
    };
}

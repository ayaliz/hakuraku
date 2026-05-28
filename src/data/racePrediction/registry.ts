import type { RaceRoomModelSpec } from "./types";

const ROOM_MODEL_REGISTRY: RaceRoomModelSpec[] = [
    {
        id: "cm14",
        label: "CM14 model",
        courseId: 10602,
        artifactPath: "data/cm14-room-model.json.gz?rev=surrogate-context-target-mix-skill210061-2026-05-27",
        teamCount: 3,
        horsesPerTeam: 3,
    },
];

export function getRaceRoomModelForCourse(courseId: number | undefined): RaceRoomModelSpec | null {
    if (courseId === undefined) {
        return null;
    }
    return ROOM_MODEL_REGISTRY.find((model) => model.courseId === courseId) ?? null;
}

export function listRaceRoomModels(): RaceRoomModelSpec[] {
    return ROOM_MODEL_REGISTRY.slice();
}

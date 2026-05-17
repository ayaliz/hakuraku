import type { RaceRoomModelSpec } from "./types";

const ROOM_MODEL_REGISTRY: RaceRoomModelSpec[] = [
    {
        id: "cm13",
        label: "CM13 model",
        courseId: 10606,
        artifactPath: "data/cm13-room-model.json.gz?rev=surrogate-context-target-mix-skill210061-full-2026-05-14",
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

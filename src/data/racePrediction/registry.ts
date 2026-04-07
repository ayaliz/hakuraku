import type { RaceRoomModelSpec } from "./types";

const ROOM_MODEL_REGISTRY: RaceRoomModelSpec[] = [
    {
        id: "cm12",
        label: "CM12 model",
        courseId: 10504,
        artifactPath: "data/cm12-room-model.json.gz?rev=surrogate-context-target-mix-skill210061-2026-04-07",
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

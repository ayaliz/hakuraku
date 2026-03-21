import type { RaceRoomModelSpec } from "./types";

const ROOM_MODEL_REGISTRY: RaceRoomModelSpec[] = [
    {
        id: "cm11",
        label: "CM11 model",
        courseId: 10914,
        artifactPath: "data/cm11-room-model.json.gz?rev=oppstyles-gatesummary",
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

export const EMPTY_TRAINED_CHARA_DATA_WARNING =
    "The race dumping method you're using does not appear to dump trainedCharaData correctly, which may make some features unavailable.";

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

/** Detect incomplete HorseACT player entries, not formats that never export training objects. */
export function hasEmptyTrainedCharaData(capture: unknown): boolean {
    const root = record(capture);
    const horses = root?.raceHorse ?? root?.["<RaceHorse>k__BackingField"];
    if (!Array.isArray(horses)) return false;

    return horses.some(value => {
        const horse = record(value);
        if (!horse) return false;
        const response = record(horse.responseHorseData ?? horse._responseHorseData
            ?? horse["<ResponseHorseData>k__BackingField"]);
        // NPC fillers can legitimately have no training record.
        if (Number(response?.mob_id) > 0 || Number(response?.chara_id ?? horse.charaId) === 1) return false;
        if (typeof response?.npc_type === "number" && ![11, 20, 21, 22].includes(response.npc_type)) return false;

        const key = ["trainedCharaData", "TrainedCharaData", "<TrainedCharaData>k__BackingField"]
            .find(key => Object.prototype.hasOwnProperty.call(horse, key));
        if (!key) return false;
        const training = horse[key];
        return training === null || (record(training) !== null && Object.keys(training as object).length === 0);
    });
}

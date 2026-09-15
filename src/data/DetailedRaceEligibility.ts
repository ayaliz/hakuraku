export const CURRENT_CM_DETAILED_RACE_COURSE_ID = 10808;
export const NEXT_CM_DETAILED_RACE_COURSE_ID = 10506;

export type DetailedRaceConfiguration = {
    courseId: number;
    season: number;
    weather: number;
    groundCondition: number;
};

export const DETAILED_RACE_CONFIGURATIONS: readonly DetailedRaceConfiguration[] = [
    // Kyoto 2200m, Sunny / Good / Fall (current CM).
    { courseId: CURRENT_CM_DETAILED_RACE_COURSE_ID, season: 3, weather: 1, groundCondition: 1 },
    // Nakayama 2500m, Cloudy / Good / Winter (next CM).
    { courseId: NEXT_CM_DETAILED_RACE_COURSE_ID, season: 4, weather: 2, groundCondition: 2 },
];

export const DETAILED_RACE_INELIGIBLE_MESSAGE =
    "Detailed simulation is only available for 3v3v3 races matching the current or next Champions Meeting configuration.";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as UnknownRecord
        : null;
}

function firstValue(record: UnknownRecord, keys: string[]): unknown {
    for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null) return record[key];
    }
    return undefined;
}

function readInteger(value: unknown): number | null {
    const number = Number(value);
    return Number.isInteger(number) ? number : null;
}

function readEnumInteger(value: unknown, labels: Record<string, number>): number | null {
    const integer = readInteger(value);
    if (integer !== null) return integer;
    if (typeof value !== "string") return null;
    return labels[value.trim().toLowerCase()] ?? null;
}

function unwrapHorse(value: unknown): UnknownRecord | null {
    const horse = asRecord(value);
    if (!horse) return null;
    return asRecord(firstValue(horse, ["_responseHorseData", "responseHorseData"])) ?? horse;
}

function isLegacyHorseActCapture(record: UnknownRecord): boolean {
    return Array.isArray(firstValue(record, [
        "raceHorse",
        "<RaceHorse>k__BackingField",
    ])) && (record.simDataBase64 !== undefined
        || record["<SimDataBase64>k__BackingField"] !== undefined);
}

export function hasThreeTeamsOfThree(horses: readonly unknown[]): boolean {
    if (horses.length !== 9) return false;
    const counts = new Map<number, number>();
    for (const value of horses) {
        const horse = unwrapHorse(value);
        if (!horse) return false;
        const teamId = readInteger(firstValue(horse, ["team_id", "teamId", "TeamId"]));
        if (teamId === null) return false;
        counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
    return counts.size === 3 && [...counts.values()].every(count => count === 3);
}

export function getDetailedRaceCaptureHorses(capture: unknown): unknown[] | null {
    const record = asRecord(capture);
    if (!record) return null;
    const horses = firstValue(record, [
        "race_horse_data_array",
        "raceHorseDataArray",
        "<RaceHorse>k__BackingField",
        "raceHorse",
        "horses",
    ]);
    return Array.isArray(horses) ? horses : null;
}

export function getDetailedRaceCaptureCourseId(capture: unknown): number | null {
    const record = asRecord(capture);
    if (!record) return null;
    const course = asRecord(firstValue(record, [
        "race_course_set",
        "raceCourseSet",
        "RaceCourseSet",
        "<RaceCourseSet>k__BackingField",
    ]));
    if (course) {
        return readInteger(firstValue(course, ["id", "Id", "course_id", "courseId", "<Id>k__BackingField"]));
    }
    return readInteger(firstValue(record, ["course_id", "courseId", "CourseId"]));
}

export function getDetailedRaceCaptureSeed(capture: unknown): number | null {
    const record = asRecord(capture);
    if (!record) return null;
    const seed = readInteger(firstValue(record, [
        "random_seed",
        "randomSeed",
        "RandomSeed",
        "<RandomSeed>k__BackingField",
    ]));
    return seed !== null && seed >= -2147483648 && seed <= 2147483647 ? seed : null;
}

export function getDetailedRaceCaptureRaceInstanceId(capture: unknown): number | null {
    const record = asRecord(capture);
    if (!record) return null;
    const roomInfo = asRecord(firstValue(record, ["room_info", "roomInfo"]));
    const raceInstanceMaster = asRecord(firstValue(record, [
        "race_instance_master",
        "raceInstanceMaster",
        "RaceInstanceMaster",
        "<RaceInstanceMaster>k__BackingField",
    ]));
    const value = readInteger(firstValue(record, [
        "race_instance_id",
        "raceInstanceId",
        "RaceInstanceId",
        "<RaceInstanceId>k__BackingField",
    ])
        ?? (roomInfo ? firstValue(roomInfo, ["race_instance_id", "raceInstanceId"]) : undefined)
        ?? (raceInstanceMaster ? firstValue(raceInstanceMaster, ["id", "Id", "race_instance_id", "raceInstanceId"]) : undefined));
    return value !== null && value >= 0 && value <= 0xffffffff ? value : null;
}

export function getDetailedRaceCaptureStartTimeType(capture: unknown): number | null {
    const record = asRecord(capture);
    if (!record) return null;
    const value = readInteger(firstValue(record, [
        "start_time_type",
        "startTimeType",
        "StartTimeType",
        "<StartTimeType>k__BackingField",
    ]));
    return value !== null && value >= 0 && value <= 0xff ? value : null;
}

function hasScalarValue(record: UnknownRecord, keys: string[]): boolean {
    const value = firstValue(record, keys);
    return (typeof value === "number" && Number.isFinite(value))
        || (typeof value === "string" && value.trim().length > 0);
}

export function hasDetailedRaceCaptureConditions(capture: unknown): boolean {
    const record = asRecord(capture);
    if (!record) return false;
    return hasScalarValue(record, ["season", "Season", "<Season>k__BackingField"])
        && hasScalarValue(record, ["weather", "Weather", "<Weather>k__BackingField"])
        && hasScalarValue(record, [
            "ground_condition",
            "groundCondition",
            "GroundCondition",
            "<GroundCondition>k__BackingField",
        ]);
}

export function getDetailedRaceCaptureConfiguration(capture: unknown): Omit<DetailedRaceConfiguration, "courseId"> | null {
    const record = asRecord(capture);
    if (!record) return null;
    const season = readEnumInteger(firstValue(record, ["season", "Season", "<Season>k__BackingField"]), {
        spring: 1,
        summer: 2,
        fall: 3,
        autumn: 3,
        winter: 4,
    });
    const weather = readEnumInteger(firstValue(record, ["weather", "Weather", "<Weather>k__BackingField"]), {
        sunny: 1,
        cloudy: 2,
        rainy: 3,
        rain: 3,
        snow: 4,
        snowy: 4,
    });
    const groundValue = firstValue(record, [
        "ground_condition",
        "groundCondition",
        "GroundCondition",
        "<GroundCondition>k__BackingField",
    ]);
    const legacyHorseActCapture = isLegacyHorseActCapture(record);
    let groundCondition = readEnumInteger(groundValue, legacyHorseActCapture
        // horseACT's legacy enum names predate the Global UI terminology:
        // Good / Soft / Hard / Bad = Firm / Good / Soft / Heavy.
        ? { good: 1, firm: 1, soft: 2, yielding: 2, hard: 3, bad: 4, heavy: 4 }
        // Raw API values and normalized simulator names use the newer enum.
        : { good: 1, firm: 1, yielding: 2, soft: 3, hard: 3, heavy: 4, bad: 4 });
    // The normalized SimData race input serializes the simulator enum itself
    // (Good = 0), while captured race packets use the API's 1-based value.
    if (Array.isArray(record.horses)
        && record.ground_condition === undefined
        && typeof groundValue === "number"
        && groundCondition !== null
        && groundCondition >= 0
        && groundCondition <= 3) {
        groundCondition += 1;
    }
    return season === null || weather === null || groundCondition === null
        ? null
        : { season, weather, groundCondition };
}

function replaceConditionValues(
    target: UnknownRecord,
    keys: readonly string[],
    fallbackKey: string,
    value: number,
) {
    let replaced = false;
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
        target[key] = value;
        replaced = true;
    }
    if (!replaced) target[fallbackKey] = value;
}

/**
 * Converts horseACT's legacy condition names to the unambiguous 1-based IDs
 * accepted by uma.moe. The uploaded capture is never mutated.
 */
export function normalizeDetailedRaceCaptureForSimulation(capture: unknown): unknown {
    const record = asRecord(capture);
    if (!record || !isLegacyHorseActCapture(record)) return capture;
    const configuration = getDetailedRaceCaptureConfiguration(record);
    if (!configuration) return capture;

    const normalized: UnknownRecord = { ...record };
    replaceConditionValues(normalized,
        ["season", "Season", "<Season>k__BackingField"], "season", configuration.season);
    replaceConditionValues(normalized,
        ["weather", "Weather", "<Weather>k__BackingField"], "weather", configuration.weather);
    replaceConditionValues(normalized, [
        "ground_condition",
        "groundCondition",
        "GroundCondition",
        "<GroundCondition>k__BackingField",
    ], "groundCondition", configuration.groundCondition);
    return normalized;
}

/** Returns a cloned capture with its deterministic seed replaced. */
export function withDetailedRaceCaptureSeed(capture: unknown, seed: number): unknown {
    const record = asRecord(capture);
    if (!record || !Number.isInteger(seed) || seed < -2147483648 || seed > 2147483647) return capture;
    const seeded: UnknownRecord = { ...record };
    replaceConditionValues(seeded, [
        "random_seed",
        "randomSeed",
        "RandomSeed",
        "<RandomSeed>k__BackingField",
    ], "random_seed", seed);
    return seeded;
}

export function normalizeDetailedRacePayloadForSimulation(payload: unknown): unknown {
    const request = asRecord(payload);
    if (!request || request.capture === undefined) return payload;
    const capture = normalizeDetailedRaceCaptureForSimulation(request.capture);
    return capture === request.capture ? payload : { ...request, capture };
}

export function isDetailedRaceCourseSupported(courseId: unknown): boolean {
    const parsedCourseId = readInteger(courseId);
    return parsedCourseId !== null
        && DETAILED_RACE_CONFIGURATIONS.some(configuration => configuration.courseId === parsedCourseId);
}

export function isDetailedRaceConfigurationEligible(courseId: unknown, capture: unknown): boolean {
    const parsedCourseId = readInteger(courseId);
    const conditions = getDetailedRaceCaptureConfiguration(capture);
    if (parsedCourseId === null || !conditions) return false;
    return DETAILED_RACE_CONFIGURATIONS.some(configuration =>
        configuration.courseId === parsedCourseId
        && configuration.season === conditions.season
        && configuration.weather === conditions.weather
        && configuration.groundCondition === conditions.groundCondition);
}

export function buildDetailedRaceCaptureFromSharedData(data: {
    raceHorseInfo: unknown;
    raceScenario: unknown;
    detectedCourseId?: unknown;
    laneDistanceMax?: unknown;
    randomSeed?: unknown;
    raceType?: unknown;
    trackDetails?: { condition?: unknown; weather?: unknown; season?: unknown } | null;
}): UnknownRecord | null {
    let horses = data.raceHorseInfo;
    if (typeof horses === "string") {
        try { horses = JSON.parse(horses); }
        catch { return null; }
    }
    if (!Array.isArray(horses) || typeof data.raceScenario !== "string" || !data.raceScenario) return null;

    const courseId = readInteger(data.detectedCourseId);
    const randomSeed = readInteger(data.randomSeed);
    const laneDistanceMax = Number(data.laneDistanceMax);
    const groundCondition = readEnumInteger(data.trackDetails?.condition, {
        // Shared TrackDetails historically retain horseACT's legacy labels.
        good: 1, firm: 1, soft: 2, yielding: 2, hard: 3, bad: 4, heavy: 4,
    });
    const weather = readEnumInteger(data.trackDetails?.weather, {
        sunny: 1, cloudy: 2, rainy: 3, snow: 4, snowy: 4,
    });
    const season = readEnumInteger(data.trackDetails?.season, {
        spring: 1, cherryblossom: 1, "cherry_blossom": 1, "cherry blossom": 1,
        summer: 2, fall: 3, autumn: 3, winter: 4,
    });
    if (groundCondition === null || weather === null || season === null) return null;
    return {
        archive_format: "shared-race-v1",
        race_horse_data_array: horses,
        race_scenario: data.raceScenario,
        ...(courseId === null ? {} : {
            race_course_set: {
                id: courseId,
                ...(Number.isFinite(laneDistanceMax) ? { lane_distance_max: laneDistanceMax } : {}),
            },
        }),
        ...(randomSeed === null ? {} : { random_seed: randomSeed }),
        ground_condition: groundCondition,
        weather,
        season,
    };
}

export function isDetailedRaceEligible(
    courseId: unknown,
    horses: readonly unknown[] | undefined,
    capture: unknown,
): boolean {
    return isDetailedRaceConfigurationEligible(courseId, capture)
        && Array.isArray(horses)
        && hasThreeTeamsOfThree(horses);
}

export function isDetailedRacePayloadEligible(payload: unknown): boolean {
    const request = asRecord(payload);
    if (!request || !isDetailedRaceCourseSupported(request.courseId)) return false;
    if (request.seed !== undefined) {
        const seed = readInteger(request.seed);
        if (seed === null || seed < -2147483648 || seed > 2147483647) return false;
    }
    const embeddedCourseId = getDetailedRaceCaptureCourseId(request.capture);
    if (embeddedCourseId !== null && embeddedCourseId !== Number(request.courseId)) return false;
    if (getDetailedRaceCaptureSeed(request.capture) === null) return false;
    if (!isDetailedRaceConfigurationEligible(request.courseId, request.capture)) return false;
    const horses = getDetailedRaceCaptureHorses(request.capture);
    return horses !== null && hasThreeTeamsOfThree(horses);
}

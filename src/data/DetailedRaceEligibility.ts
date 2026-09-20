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

type KnownRaceInstance = { id?: number; courseSetId?: number };

function isG1RaceInstanceId(raceInstanceId: number): boolean {
    // The bundled UMDB omits grade fields. Its 100xxx race-instance range is G1,
    // including the 110xxx dirt G1 instances.
    return raceInstanceId >= 100000 && raceInstanceId < 200000;
}

/**
 * Returns explicit capture metadata when available, otherwise associates the
 * detected course with a known race instance. G1 instances are preferred so
 * grade-sensitive simulator conditions receive the least surprising fallback.
 */
export function resolveDetailedRaceInstanceId(
    capture: unknown,
    courseId: unknown,
    knownRaceInstances: Readonly<Record<number, KnownRaceInstance>> = {},
): number | null {
    const explicit = getDetailedRaceCaptureRaceInstanceId(capture);
    if (explicit !== null) return explicit;
    const parsedCourseId = readInteger(courseId) ?? getDetailedRaceCaptureCourseId(capture);
    if (parsedCourseId === null) return null;
    const candidates = Object.values(knownRaceInstances)
        .filter(instance => readInteger(instance.courseSetId) === parsedCourseId)
        .map(instance => readInteger(instance.id))
        .filter((id): id is number => id !== null && id >= 0 && id <= 0xffffffff)
        .sort((left, right) => Number(isG1RaceInstanceId(right)) - Number(isG1RaceInstanceId(left))
            || left - right);
    return candidates[0] ?? null;
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

export function getDetailedRaceCaptureRaceType(capture: unknown): number | null {
    const record = asRecord(capture);
    if (!record) return null;
    const value = readInteger(firstValue(record, ["race_type", "raceTypeCode", "raceType", "RaceType", "<RaceType>k__BackingField"]));
    return value !== null && value >= 0 && value <= 0xff ? value : null;
}

/** Retain simulator-relevant presence without exposing an anonymous runner's identity. */
export function anonymizeSharedRaceHorse(horse: UnknownRecord): UnknownRecord {
    return { ...horse,
        has_viewer_id: typeof horse.has_viewer_id === "boolean" ? horse.has_viewer_id
            : Number(horse.viewer_id ?? horse.viewerId ?? 0) !== 0,
        viewer_id: 0,
        ...(horse.viewerId === undefined ? {} : { viewerId: 0 }),
    };
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
 * Normalizes seed, fan counts and condition IDs for uma.moe, including lobby
 * simulator inputs. The uploaded capture is never mutated or given invented fans.
 */
export function normalizeDetailedRaceCaptureForSimulation(capture: unknown): unknown {
    const record = asRecord(capture);
    if (!record) return capture;
    const configuration = getDetailedRaceCaptureConfiguration(record);
    if (!configuration) return capture;

    const normalized: UnknownRecord = { ...record };
    const seed = getDetailedRaceCaptureSeed(record);
    if (seed !== null) normalized.random_seed = seed;
    if (Array.isArray(record.horses) && record.schemaVersion !== undefined) {
        const aptitude = (value: unknown) => typeof value === "number"
            ? 8 - value : "GFEDCBAS".indexOf(String(value).toUpperCase()) + 1;
        const courseId = getDetailedRaceCaptureCourseId(record);
        const distanceIndex = courseId === NEXT_CM_DETAILED_RACE_COURSE_ID ? 3 : 2;
        normalized.course_id = courseId;
        normalized.ground_condition = configuration.groundCondition;
        normalized.race_horse_data_array = record.horses.map(value => {
            const horse = asRecord(value) ?? {};
            const identity = asRecord(horse.identity) ?? {};
            const stats = asRecord(horse.rawStats) ?? {};
            const distance = [1, 1, 1, 1];
            distance[distanceIndex] = aptitude(horse.distanceAptitude);
            const styleIndex = Number(horse.runningStyle) === 4 ? 0 : Number(horse.runningStyle);
            const styles = [1, 1, 1, 1];
            styles[styleIndex] = aptitude(horse.strategyAptitude);
            return {
                frame_order: horse.gateNumber,
                popularity: horse.popularity,
                team_id: horse.teamId,
                team_member_id: horse.teamMemberId,
                team_rank: horse.singleModeTeamRank,
                single_mode_win_count: horse.singleModeWinCount,
                fan_count: horse.fanCount,
                viewer_id: Number(identity.viewerId ?? 0) === 0 ? 0 : 1,
                chara_id: identity.charaId, card_id: identity.cardId, mob_id: identity.mobId,
                running_style: styleIndex + 1,
                speed: stats.speed, stamina: stats.stamina, pow: stats.power,
                guts: stats.guts, wiz: stats.wisdom, motivation: horse.motivation,
                proper_distance_short: distance[0], proper_distance_mile: distance[1],
                proper_distance_middle: distance[2], proper_distance_long: distance[3],
                proper_ground_turf: aptitude(horse.surfaceAptitude), proper_ground_dirt: 1,
                proper_running_style_nige: styles[0], proper_running_style_senko: styles[1],
                proper_running_style_sashi: styles[2], proper_running_style_oikomi: styles[3],
                item_id_array: horse.itemIds,
                skill_array: (Array.isArray(horse.skills) ? horse.skills : []).map(value => {
                    const skill = asRecord(value) ?? {};
                    return { skill_id: skill.skillId, level: skill.level };
                }),
            };
        });
        // Do not let the upstream select the normalized .NET input schema instead.
        delete normalized.horses;
        delete normalized.schemaVersion;
    } else {
        const horses = getDetailedRaceCaptureHorses(record);
        if (horses) {
            const key = ["race_horse_data_array", "raceHorseDataArray", "<RaceHorse>k__BackingField", "raceHorse"]
                .find(key => Array.isArray(record[key]))!;
            const trained = Array.isArray(record.trained_chara_array) ? record.trained_chara_array : [];
            normalized[key] = horses.map(value => {
                const wrapper = asRecord(value);
                const horse = unwrapHorse(value);
                if (!wrapper || !horse) return value;
                const training = asRecord(firstValue(wrapper, ["trainedCharaData", "<TrainedCharaData>k__BackingField"]))
                    ?? trained.map(asRecord).find(candidate => candidate && (
                        candidate.viewer_id === horse.viewer_id && candidate.card_id === horse.card_id
                        && horse.viewer_id !== undefined && horse.card_id !== undefined))
                    ?? trained.map(asRecord).find(candidate => candidate && horse.trained_chara_id !== undefined
                        && candidate.trained_chara_id === horse.trained_chara_id);
                const fans = firstValue(horse, ["fan_count", "fanCount", "fans"])
                    ?? (training && firstValue(training, ["fan_count", "fanCount", "fans", "Fans", "<Fans>k__BackingField"]));
                if (fans === undefined || fans === null || !Number.isInteger(Number(fans)) || Number(fans) < 0) return value;
                const enriched = { ...horse, fan_count: Number(fans) };
                if (horse === wrapper) return enriched;
                const responseKey = wrapper._responseHorseData !== undefined ? "_responseHorseData" : "responseHorseData";
                return { ...wrapper, [responseKey]: enriched };
            });
        }
    }
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

/** Keeps the recorded capture seed intact so the Worker can identify what-if requests. */
export function buildDetailedRaceSimulationRequest(
    capture: unknown,
    courseId: number | undefined,
    seedOverride?: number,
    knownRaceInstances: Readonly<Record<number, KnownRaceInstance>> = {},
) {
    const raceInstanceId = resolveDetailedRaceInstanceId(capture, courseId, knownRaceInstances);
    return {
        capture: normalizeDetailedRaceCaptureForSimulation(capture),
        courseId,
        grade: 100,
        time: 2,
        recordedSeed: getDetailedRaceCaptureSeed(capture),
        ...(raceInstanceId === null ? {} : { raceInstanceId }),
        ...(seedOverride === undefined ? {} : { seed: seedOverride }),
    };
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
    raceInstanceId?: unknown;
    startTimeType?: unknown;
    raceType?: unknown;
    raceTypeCode?: unknown;
    trackDetails?: { condition?: unknown; weather?: unknown; season?: unknown } | null;
}, knownRaceInstances: Readonly<Record<number, KnownRaceInstance>> = {}): UnknownRecord | null {
    let horses = data.raceHorseInfo;
    if (typeof horses === "string") {
        try { horses = JSON.parse(horses); }
        catch { return null; }
    }
    if (!Array.isArray(horses) || typeof data.raceScenario !== "string" || !data.raceScenario) return null;

    const courseId = readInteger(data.detectedCourseId);
    const randomSeed = readInteger(data.randomSeed);
    const raceInstanceId = resolveDetailedRaceInstanceId(data, courseId, knownRaceInstances);
    const startTimeType = getDetailedRaceCaptureStartTimeType(data);
    const raceTypeCode = getDetailedRaceCaptureRaceType({ raceTypeCode: data.raceTypeCode });
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
        race_horse_data_array: horses.map(value => {
            const horse = asRecord(value);
            if (!horse || typeof horse.has_viewer_id !== "boolean") return value;
            // The capture endpoint expects viewer_id; use only a non-identifying presence marker.
            return { ...horse, viewer_id: horse.has_viewer_id ? Number(horse.viewer_id || 1) : 0 };
        }),
        race_scenario: data.raceScenario,
        ...(courseId === null ? {} : {
            race_course_set: {
                id: courseId,
                ...(Number.isFinite(laneDistanceMax) ? { lane_distance_max: laneDistanceMax } : {}),
            },
        }),
        ...(randomSeed === null ? {} : { random_seed: randomSeed }),
        ...(raceInstanceId === null ? {} : { race_instance_id: raceInstanceId }),
        ...(startTimeType === null ? {} : { start_time_type: startTimeType }),
        ...(raceTypeCode === null ? {} : { race_type: raceTypeCode }),
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

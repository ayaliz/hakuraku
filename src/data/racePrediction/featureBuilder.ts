import GameDataLoader from "../GameDataLoader";
import UMDatabaseWrapper from "../UMDatabaseWrapper";
import { fromRaceHorseData } from "../TrainedCharaData";
import { getDistanceCategory } from "../../components/RaceReplay/utils/speedCalculations";
import type { FrontendHorse, FrontendModel, FrontendRoom, FrontendTeam, RaceRoomModelSpec } from "./types";

const RUNAWAY_TRIGGER_SKILL_ID = 202051;
const STAT_CAP = 1200;
const TRACK_STAT_THRESHOLD_HIGH = 900;
const TRACK_STAT_MODIFIER_HIGH = 1.2;
const TRACK_STAT_THRESHOLD_MID = 600;
const TRACK_STAT_MODIFIER_MID = 1.15;
const TRACK_STAT_THRESHOLD_LOW = 300;
const TRACK_STAT_MODIFIER_LOW = 1.1;
const TRACK_STAT_MODIFIER_BASE = 1.05;

const MOOD_MODIFIER: Record<number, number> = {
    5: 1.04,
    4: 1.02,
    3: 1.0,
    2: 0.98,
    1: 0.96,
};

const RUNNING_STYLE_TO_APTITUDE_FIELD: Record<number, string> = {
    1: "proper_running_style_nige",
    2: "proper_running_style_senko",
    3: "proper_running_style_sashi",
    4: "proper_running_style_oikomi",
    5: "proper_running_style_nige",
};

const TRACK_STAT_FIELD_MAP: Record<string, keyof FrontendHorse> = {
    speed: "speed",
    stamina: "stamina",
    power: "pow",
    guts: "guts",
    wisdom: "wiz",
};

function adjustStat(stat: number, mood: number, bonus = 0): number {
    let value = stat;
    if (value > STAT_CAP) {
        value = STAT_CAP + (value - STAT_CAP) / 2;
    }
    return value * (MOOD_MODIFIER[mood] ?? 1.0) + bonus;
}

function computeGroundPowerBonus(surface: number, condition: number): number {
    if (surface === 2) {
        return condition === 2 ? -50 : -100;
    }
    if (surface === 1) {
        return condition === 1 ? 0 : -50;
    }
    return 0;
}

function computeGroundSpeedBonus(condition: number): number {
    return condition === 4 ? -50 : 0;
}

function computeTrackStatThresholdModifier(courseContext: FrontendModel["courseContext"], horse: FrontendHorse, mood: number): number {
    const thresholdStats = courseContext.track_stat_thresholds ?? [];
    if (thresholdStats.length === 0) {
        return 1.0;
    }

    const moodMod = MOOD_MODIFIER[mood] ?? 1.0;
    let total = 0;
    let count = 0;
    for (const statName of thresholdStats) {
        const field = TRACK_STAT_FIELD_MAP[statName];
        if (!field) continue;
        const adjusted = Number(horse[field] ?? 0) * moodMod;
        let modifier = TRACK_STAT_MODIFIER_BASE;
        if (adjusted > TRACK_STAT_THRESHOLD_HIGH) modifier = TRACK_STAT_MODIFIER_HIGH;
        else if (adjusted > TRACK_STAT_THRESHOLD_MID) modifier = TRACK_STAT_MODIFIER_MID;
        else if (adjusted > TRACK_STAT_THRESHOLD_LOW) modifier = TRACK_STAT_MODIFIER_LOW;
        total += modifier;
        count += 1;
    }

    return count > 0 ? total / count : 1.0;
}

function parseConditionToken(token: string, context: Record<string, number | Set<number>>): boolean {
    const trimmed = token.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("is_exist_chara_id==")) {
        const rhs = Number(trimmed.split("==", 2)[1] ?? 0);
        const ids = context._room_chara_ids;
        return ids instanceof Set ? ids.has(rhs) : false;
    }

    const match = trimmed.match(/^([a-zA-Z0-9_]+)\s*(==|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) return false;
    const [, variable, operator, rhsRaw] = match;
    const lhs = context[variable];
    if (typeof lhs !== "number") return false;
    const rhs = Number(rhsRaw);
    switch (operator) {
        case "==": return lhs === rhs;
        case "<=": return lhs <= rhs;
        case ">=": return lhs >= rhs;
        case "<": return lhs < rhs;
        case ">": return lhs > rhs;
        default: return false;
    }
}

function evaluateCondition(condition: string, context: Record<string, number | Set<number>>): boolean {
    if (!condition) return false;
    return condition.split("@").some((orPart) =>
        orPart.split("&").every((token) => parseConditionToken(token, context))
    );
}

function buildHorseRoomContext(
    room: FrontendRoom,
    horse: FrontendHorse,
    skillId: number,
    courseContext: FrontendModel["courseContext"],
): Record<string, number | Set<number>> {
    const allHorses = room.teams.flatMap((team) => team.horses);
    const sameStyleCount = allHorses.filter((other) => other.strategy === horse.strategy).length;
    const sameSkillCount = allHorses.filter((other) => other.learned_skill_ids.includes(skillId)).length;
    const roomCharaIds = new Set(allHorses.map((other) => other.chara_id));
    return {
        always: 1,
        track_id: courseContext.track_id,
        ground_condition: courseContext.ground_condition,
        rotation: courseContext.rotation,
        season: courseContext.season,
        weather: courseContext.weather,
        is_basis_distance: courseContext.is_basis_distance,
        running_style: horse.strategy,
        post_number: horse.frame_order + 1,
        running_style_count_same: sameStyleCount,
        running_style_count_same_rate: (sameStyleCount / Math.max(allHorses.length, 1)) * 100,
        same_skill_horse_count: sameSkillCount,
        _room_chara_ids: roomCharaIds,
    };
}

export function buildFrontendRoom(
    raceHorseInfo: any[],
    effectiveCourseId: number,
    modelSpec: RaceRoomModelSpec,
): FrontendRoom | null {
    const courseData = (GameDataLoader.courseData as Record<string, any>)[String(effectiveCourseId)];
    if (!courseData) {
        return null;
    }

    const distanceCategory = getDistanceCategory(Number(courseData.distance ?? 0));
    const surface = Number(courseData.surface ?? 0);
    const aptDistanceField =
        distanceCategory === 1 ? "proper_distance_short" :
            distanceCategory === 2 ? "proper_distance_mile" :
                distanceCategory === 3 ? "proper_distance_middle" :
                    "proper_distance_long";
    const aptGroundField = surface === 1 ? "proper_ground_turf" : "proper_ground_dirt";

    const teams = new Map<number, FrontendTeam>();
    raceHorseInfo.forEach((data, index) => {
        const teamId = Number(data.team_id ?? 0);
        if (teamId <= 0) {
            return;
        }

        const trainedChara = fromRaceHorseData(data);
        const learnedSkillIds = (trainedChara.skills ?? []).map((skill) => Number(skill.skillId));
        const rawStrategy = Number(data.running_style ?? trainedChara.rawData?.param?.runningStyle ?? 1);
        const strategy = rawStrategy === 1 && learnedSkillIds.includes(RUNAWAY_TRIGGER_SKILL_ID) ? 5 : rawStrategy;
        const motivation = Number(data.motivation ?? 3);
        const wiz = Number(trainedChara.wiz ?? data.wiz ?? 300);
        const baseWiz = wiz * (MOOD_MODIFIER[motivation] ?? 1.0);
        const activationChance = Math.max(100 - 9000 / Math.max(baseWiz, 1), 20) / 100;
        const frameOrder = Number(data.frame_order ?? (index + 1)) - 1;
        const aptStyleField = RUNNING_STYLE_TO_APTITUDE_FIELD[strategy] ?? RUNNING_STYLE_TO_APTITUDE_FIELD[1];

        const horse: FrontendHorse = {
            frame_order: frameOrder,
            chara_id: Number(trainedChara.charaId ?? data.chara_id ?? 0),
            chara_name: UMDatabaseWrapper.charas[trainedChara.charaId ?? 0]?.name ?? "",
            card_id: Number(trainedChara.cardId ?? data.card_id ?? 0),
            strategy,
            learned_skill_ids: learnedSkillIds,
            speed: Number(trainedChara.speed ?? data.speed ?? 0),
            stamina: Number(trainedChara.stamina ?? data.stamina ?? 0),
            pow: Number(trainedChara.pow ?? data.pow ?? data.power ?? 0),
            guts: Number(trainedChara.guts ?? data.guts ?? 0),
            wiz: Number(trainedChara.wiz ?? data.wiz ?? 0),
            rank_score: Number(trainedChara.rankScore ?? data.rank_score ?? 0),
            career_win_count: Number(data.single_mode_win_count ?? 0),
            motivation,
            activation_chance: activationChance,
            apt_ground: Number(data[aptGroundField] ?? 0),
            apt_distance: Number(data[aptDistanceField] ?? 0),
            apt_style: Number(data[aptStyleField] ?? 0),
            team_id: teamId,
        };

        if (!teams.has(teamId)) {
            teams.set(teamId, { team_id: teamId, horses: [] });
        }
        teams.get(teamId)!.horses.push(horse);
    });

    const roomTeams = Array.from(teams.values());
    if (
        roomTeams.length !== modelSpec.teamCount ||
        roomTeams.some((team) => team.horses.length !== modelSpec.horsesPerTeam)
    ) {
        return null;
    }

    return {
        race_id: "racedata-upload",
        course_id: effectiveCourseId,
        track_label: "",
        timestamp_ms: Date.now(),
        teams: roomTeams,
    };
}

export function applyPreRaceAdjustments(room: FrontendRoom, model: FrontendModel): FrontendRoom {
    const courseContext = model.courseContext;
    const surface = courseContext.surface;
    const groundCondition = courseContext.ground_condition;
    const groundSpeedBonus = computeGroundSpeedBonus(groundCondition);
    const groundPowerBonus = computeGroundPowerBonus(surface, groundCondition);
    const skillMap = new Map(model.passiveSkills.map((skill) => [skill.skillId, skill]));

    return {
        ...room,
        teams: room.teams.map((team) => ({
            ...team,
            horses: team.horses.map((horse) => {
                const modifiers = { speed: 0, stamina: 0, power: 0, guts: 0, wisdom: 0 };
                const matchedPassiveSkillIds: number[] = [];
                for (const skillId of horse.learned_skill_ids) {
                    const skillEntry = skillMap.get(skillId);
                    if (!skillEntry) continue;
                    const context = buildHorseRoomContext(room, horse, skillId, courseContext);
                    let matchedAny = false;
                    for (const group of skillEntry.groups) {
                        if (!evaluateCondition(group.condition, context)) continue;
                        modifiers.speed += group.effects.speed ?? 0;
                        modifiers.stamina += group.effects.stamina ?? 0;
                        modifiers.power += group.effects.power ?? 0;
                        modifiers.guts += group.effects.guts ?? 0;
                        modifiers.wisdom += group.effects.wisdom ?? 0;
                        matchedAny = true;
                    }
                    if (matchedAny) {
                        matchedPassiveSkillIds.push(skillId);
                    }
                }

                const mood = horse.motivation;
                const speedCourseModifier = computeTrackStatThresholdModifier(courseContext, horse, mood);
                const speedBonus = modifiers.speed + groundSpeedBonus;
                return {
                    ...horse,
                    base_speed: horse.speed,
                    base_stamina: horse.stamina,
                    base_pow: horse.pow,
                    base_guts: horse.guts,
                    base_wiz: horse.wiz,
                    matched_passive_skill_ids: matchedPassiveSkillIds,
                    passive_stat_modifiers: modifiers,
                    speed_course_modifier: speedCourseModifier,
                    speed: Math.round(adjustStat(horse.speed, mood, 0) * speedCourseModifier + speedBonus),
                    stamina: Math.round(adjustStat(horse.stamina, mood, modifiers.stamina)),
                    pow: Math.round(adjustStat(horse.pow, mood, modifiers.power + groundPowerBonus)),
                    guts: Math.round(adjustStat(horse.guts, mood, modifiers.guts)),
                    wiz: Math.round(adjustStat(horse.wiz, mood, modifiers.wisdom)),
                };
            }),
        })),
    };
}

function canonicalizeRoom(room: FrontendRoom): FrontendRoom {
    return {
        ...room,
        teams: [...room.teams]
            .sort((a, b) => a.team_id - b.team_id)
            .map((team) => ({
                ...team,
                horses: [...team.horses].sort((a, b) =>
                    (a.frame_order - b.frame_order) ||
                    (a.card_id - b.card_id) ||
                    (a.strategy - b.strategy)
                ),
            })),
    };
}

function numericHorseField(horse: FrontendHorse, field: string): number {
    return Number((horse as unknown as Record<string, unknown>)[field] ?? 0);
}

function baseFeatureCount(model: FrontendModel): number {
    const styleIds = model.schema.styleIds;
    const gateNumbers = model.schema.gateNumbers ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return model.schema.numericFields.length
        + styleIds.length
        + gateNumbers.length
        + model.schema.aptitudeFields.length
        + styleIds.length
        + styleIds.length
        + model.schema.rankFields.length;
}

function getExtraFeatureNames(model: FrontendModel): string[] {
    const featureNames = model.schema.featureNames;
    if (!featureNames || featureNames.length === 0) {
        return [];
    }
    const extrasStart = baseFeatureCount(model);
    const extrasEnd = Math.max(extrasStart, featureNames.length - model.schema.skillVocab.length);
    return featureNames.slice(extrasStart, extrasEnd);
}

function computeRankPct(values: number[]): Map<number, number> {
    const ordered = [...values].sort((a, b) => b - a);
    const count = Math.max(1, ordered.length - 1);
    const result = new Map<number, number>();
    ordered.forEach((value, index) => {
        if (!result.has(value)) {
            result.set(value, index / count);
        }
    });
    return result;
}

export function encodeRoom(room: FrontendRoom, model: FrontendModel): { features: number[][][]; orderedHorses: FrontendHorse[] } {
    const canonical = canonicalizeRoom(room);
    const allHorses = canonical.teams.flatMap((team) => team.horses);
    const styleIds = model.schema.styleIds;
    const gateNumbers = model.schema.gateNumbers ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const skillVocab = model.schema.skillVocab;
    const extraFeatureNames = getExtraFeatureNames(model);
    const skillIndex = new Map(skillVocab.map((skillId, index) => [skillId, index]));

    const roomStyleCounts = new Map<number, number>();
    styleIds.forEach((styleId) => roomStyleCounts.set(styleId, 0));
    allHorses.forEach((horse) => {
        roomStyleCounts.set(horse.strategy, (roomStyleCounts.get(horse.strategy) ?? 0) + 1);
    });

    const rankLookup = new Map<string, Map<number, number>>();
    model.schema.rankFields.forEach((field) => {
        const values = allHorses.map((horse) => numericHorseField(horse, field));
        rankLookup.set(field, computeRankPct(values));
    });
    const roomMaxLookup = new Map<string, number>();
    model.schema.rankFields.forEach((field) => {
        roomMaxLookup.set(field, Math.max(...allHorses.map((horse) => numericHorseField(horse, field))));
    });
    const roomMeanLookup = new Map<string, number>();
    model.schema.rankFields.forEach((field) => {
        const values = allHorses.map((horse) => numericHorseField(horse, field));
        roomMeanLookup.set(field, values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1));
    });

    const features = canonical.teams.map((team) => {
        const teamStyleCounts = new Map<number, number>();
        styleIds.forEach((styleId) => teamStyleCounts.set(styleId, 0));
        team.horses.forEach((horse) => {
            teamStyleCounts.set(horse.strategy, (teamStyleCounts.get(horse.strategy) ?? 0) + 1);
        });
        const teamRankLookup = new Map<string, Map<number, number>>();
        model.schema.rankFields.forEach((field) => {
            const values = team.horses.map((horse) => numericHorseField(horse, field));
            teamRankLookup.set(field, computeRankPct(values));
        });
        const teamMeanLookup = new Map<string, number>();
        model.schema.rankFields.forEach((field) => {
            const values = team.horses.map((horse) => numericHorseField(horse, field));
            teamMeanLookup.set(field, values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1));
        });
        const teamMaxLookup = new Map<string, number>();
        model.schema.rankFields.forEach((field) => {
            teamMaxLookup.set(field, Math.max(...team.horses.map((horse) => numericHorseField(horse, field))));
        });
        const teamGateNumbers = team.horses.map((horse) => horse.frame_order + 1);
        const teamGateMean = teamGateNumbers.reduce((sum, value) => sum + value, 0) / Math.max(teamGateNumbers.length, 1);
        const teamGateSpread = teamGateNumbers.length > 0
            ? Math.max(...teamGateNumbers) - Math.min(...teamGateNumbers)
            : 0;

        return team.horses.map((horse) => {
            const row: number[] = [];
            const gateNumber = horse.frame_order + 1;
            model.schema.numericFields.forEach((field) => {
                row.push(numericHorseField(horse, field));
            });
            styleIds.forEach((styleId) => {
                row.push(horse.strategy === styleId ? 1 : 0);
            });
            gateNumbers.forEach((gateNumber) => {
                row.push(horse.frame_order + 1 === gateNumber ? 1 : 0);
            });
            model.schema.aptitudeFields.forEach((field) => {
                row.push(numericHorseField(horse, field));
            });
            styleIds.forEach((styleId) => {
                row.push(Number(teamStyleCounts.get(styleId) ?? 0));
            });
            styleIds.forEach((styleId) => {
                row.push(Number(roomStyleCounts.get(styleId) ?? 0));
            });
            model.schema.rankFields.forEach((field) => {
                const value = numericHorseField(horse, field);
                row.push(rankLookup.get(field)?.get(value) ?? 1);
            });
            extraFeatureNames.forEach((featureName) => {
                if (featureName.startsWith("team_mean_")) {
                    const field = featureName.replace("team_mean_", "");
                    row.push(teamMeanLookup.get(field) ?? 0);
                    return;
                }
                if (featureName.startsWith("gap_to_room_max_")) {
                    const field = featureName.replace("gap_to_room_max_", "");
                    row.push((roomMaxLookup.get(field) ?? 0) - numericHorseField(horse, field));
                    return;
                }
                if (featureName.startsWith("gap_to_team_max_")) {
                    const field = featureName.replace("gap_to_team_max_", "");
                    row.push((teamMaxLookup.get(field) ?? 0) - numericHorseField(horse, field));
                    return;
                }
                if (featureName.startsWith("gap_to_room_mean_")) {
                    const field = featureName.replace("gap_to_room_mean_", "");
                    row.push((roomMeanLookup.get(field) ?? 0) - numericHorseField(horse, field));
                    return;
                }
                if (featureName.startsWith("team_rank_pct_")) {
                    const field = featureName.replace("team_rank_pct_", "");
                    const value = numericHorseField(horse, field);
                    row.push(teamRankLookup.get(field)?.get(value) ?? 1);
                    return;
                }
                if (featureName.startsWith("opp_style_count_")) {
                    const styleId = Number(featureName.replace("opp_style_count_", ""));
                    row.push((roomStyleCounts.get(styleId) ?? 0) - (teamStyleCounts.get(styleId) ?? 0));
                    return;
                }
                if (featureName === "learned_skill_count") {
                    row.push(horse.learned_skill_ids.length);
                    return;
                }
                if (featureName === "matched_passive_count") {
                    row.push(horse.matched_passive_skill_ids?.length ?? 0);
                    return;
                }
                if (featureName === "adjusted_stat_sum") {
                    row.push(horse.speed + horse.stamina + horse.pow + horse.guts + horse.wiz);
                    return;
                }
                if (featureName === "speed_stamina_sum") {
                    row.push(horse.speed + horse.stamina);
                    return;
                }
                if (featureName === "capped_core_stat_count") {
                    row.push([horse.speed, horse.stamina, horse.pow, horse.guts, horse.wiz].filter((stat) => stat >= 1200).length);
                    return;
                }
                if (featureName === "gate_number_norm") {
                    row.push(gateNumber > 0 ? gateNumber / 9 : 0);
                    return;
                }
                if (featureName === "gate_bucket_inner") {
                    row.push(gateNumber >= 1 && gateNumber <= 3 ? 1 : 0);
                    return;
                }
                if (featureName === "gate_bucket_middle") {
                    row.push(gateNumber >= 4 && gateNumber <= 6 ? 1 : 0);
                    return;
                }
                if (featureName === "gate_bucket_outer") {
                    row.push(gateNumber >= 7 && gateNumber <= 9 ? 1 : 0);
                    return;
                }
                if (featureName === "team_gate_mean") {
                    row.push(teamGateMean);
                    return;
                }
                if (featureName === "team_gate_spread") {
                    row.push(teamGateSpread);
                    return;
                }
                row.push(0);
            });

            const skillFlags = new Array(skillVocab.length).fill(0);
            for (const skillId of horse.learned_skill_ids) {
                const index = skillIndex.get(skillId);
                if (index !== undefined) skillFlags[index] = 1;
            }
            row.push(...skillFlags);
            return row;
        });
    });

    return {
        features,
        orderedHorses: canonical.teams.flatMap((team) => team.horses),
    };
}

export function applyNormalization(row: number[], mean: number[], std: number[]): number[] {
    return row.map((value, index) => (value - mean[index]) / std[index]);
}

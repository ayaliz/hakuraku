import GameDataLoader from "../GameDataLoader";
import UMDatabaseWrapper from "../UMDatabaseWrapper";
import { fromRaceHorseData } from "../TrainedCharaData";
import { getDistanceCategory } from "../../components/RaceReplay/utils/speedCalculations";
import type { FrontendHorse, FrontendModel, FrontendRoom, FrontendTeam, RaceRoomModelSpec, TensorPayload } from "./types";

const RUNAWAY_TRIGGER_SKILL_ID = 202051;
const STAT_CAP = 1200;
const BASE_SPEED_CONSTANT = 20.0;
const BASE_SPEED_COURSE_OFFSET = 2000.0;
const BASE_SPEED_COURSE_SCALE = 1000.0;
const SPEED_TERM_COEFF = 500.0;
const SPEED_TERM_SCALE = 0.002;
const GUTS_TERM_BASE = 450.0;
const GUTS_TERM_EXPONENT = 0.597;
const GUTS_TERM_SCALE = 0.0001;
const LAST_SPURT_MULTIPLIER = 1.05;
const LAST_SPURT_BASE_RATIO = 0.01;
const TRACK_STAT_THRESHOLD_HIGH = 900;
const TRACK_STAT_MODIFIER_HIGH = 1.2;
const TRACK_STAT_THRESHOLD_MID = 600;
const TRACK_STAT_MODIFIER_MID = 1.15;
const TRACK_STAT_THRESHOLD_LOW = 300;
const TRACK_STAT_MODIFIER_LOW = 1.1;
const TRACK_STAT_MODIFIER_BASE = 1.05;
const HP_STRATEGY_COEFFICIENT: Record<number, number> = {
    1: 0.95,
    2: 0.89,
    3: 1.0,
    4: 0.995,
    5: 0.86,
};
const ACCEL_PHASE_COEFFS: Record<number, number[]> = {
    1: [1.0, 1.0, 0.996],
    2: [0.985, 1.0, 0.996],
    3: [0.975, 1.0, 1.0],
    4: [0.945, 1.0, 0.997],
    5: [1.17, 0.94, 0.956],
};
const GROUND_ACCEL_PROFICIENCY_MODIFIER: Record<number, number> = {
    8: 1.05,
    7: 1.0,
    6: 0.9,
    5: 0.8,
    4: 0.7,
    3: 0.5,
    2: 0.3,
    1: 0.1,
};
const ACCEL_DISTANCE_PROFICIENCY_MODIFIER: Record<number, number> = {
    8: 1.0,
    7: 1.0,
    6: 1.0,
    5: 1.0,
    4: 1.0,
    3: 0.6,
    2: 0.5,
    1: 0.4,
};
const GROUND_HP_CONSUMPTION_MODIFIER: Record<number, Record<number, number>> = {
    1: { 1: 1.0, 2: 1.0, 3: 1.02, 4: 1.02 },
    2: { 1: 1.0, 2: 1.0, 3: 1.01, 4: 1.02 },
};

const MOOD_MODIFIER: Record<number, number> = {
    5: 1.04,
    4: 1.02,
    3: 1.0,
    2: 0.98,
    1: 0.96,
};

const STRATEGY_PHASE_COEFFS: Record<number, number[]> = {
    1: [1.0, 0.98, 0.962],
    2: [0.978, 0.991, 0.975],
    3: [0.938, 0.998, 0.994],
    4: [0.931, 1.0, 1.0],
};

const OONIGE_COEFFS = [1.063, 0.962, 0.95];
const TARGET_SPEED_PHASE_COEFFS: Record<number, number[]> = {
    ...STRATEGY_PHASE_COEFFS,
    5: OONIGE_COEFFS,
};

const DISTANCE_PROFICIENCY_MODIFIER: Record<number, number> = {
    8: 1.05,
    7: 1.0,
    6: 0.9,
    5: 0.8,
    4: 0.6,
    3: 0.4,
    2: 0.2,
    1: 0.1,
};

const RUNNING_STYLE_TO_APTITUDE_FIELD: Record<number, string> = {
    1: "proper_running_style_nige",
    2: "proper_running_style_senko",
    3: "proper_running_style_sashi",
    4: "proper_running_style_oikomi",
    5: "proper_running_style_nige",
};
const SURROGATE_RECOVERY_BUCKETS = [150, 350, 550];

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

function computeLastSpurtTargetSpeed(courseContext: FrontendModel["courseContext"], horse: FrontendHorse): number {
    const courseDistance = Number(courseContext.distance ?? 0);
    if (courseDistance <= 0) return 0;

    const strategyCoeffs = horse.strategy === 5
        ? OONIGE_COEFFS
        : (STRATEGY_PHASE_COEFFS[horse.strategy] ?? STRATEGY_PHASE_COEFFS[1]);
    const distMod = DISTANCE_PROFICIENCY_MODIFIER[horse.apt_distance] ?? 1.0;
    const adjustedSpeed = Number(horse.speed ?? 0);
    const adjustedGuts = Number(horse.guts ?? 0);
    const baseSpeed = BASE_SPEED_CONSTANT - (courseDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;
    const speedTerm = Math.sqrt(SPEED_TERM_COEFF * Math.max(adjustedSpeed, 0)) * distMod * SPEED_TERM_SCALE;
    const phase2BaseSpeed = baseSpeed * strategyCoeffs[2];
    const lateRaceBaseSpeed = phase2BaseSpeed + speedTerm;
    const gutsTerm = Math.pow(GUTS_TERM_BASE * Math.max(adjustedGuts, 0), GUTS_TERM_EXPONENT) * GUTS_TERM_SCALE;
    return (lateRaceBaseSpeed + LAST_SPURT_BASE_RATIO * baseSpeed) * LAST_SPURT_MULTIPLIER + speedTerm + gutsTerm;
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
                    last_spurt_target_speed: 0,
                };
            }).map((adjustedHorse) => ({
                ...adjustedHorse,
                last_spurt_target_speed: computeLastSpurtTargetSpeed(courseContext, adjustedHorse),
            })),
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

function computeRankPctAgainst(values: number[], candidate: number): number {
    const ordered = [...values].sort((a, b) => b - a);
    const count = Math.max(1, ordered.length - 1);
    const higherCount = ordered.filter((value) => value > candidate).length;
    return higherCount / count;
}

function relu(values: number[]): number[] {
    return values.map((value) => (value > 0 ? value : 0));
}

function sigmoid(value: number): number {
    if (value >= 0) {
        const z = Math.exp(-value);
        return 1 / (1 + z);
    }
    const z = Math.exp(value);
    return z / (1 + z);
}

function linear(row: number[], weight: TensorPayload | undefined, bias: TensorPayload | undefined): number[] {
    if (!weight || !bias || weight.shape.length !== 2 || bias.shape.length !== 1) {
        return [];
    }
    const [outDim, inDim] = weight.shape;
    const result = new Array(outDim).fill(0);
    for (let outIndex = 0; outIndex < outDim; outIndex++) {
        let sum = bias.data[outIndex] ?? 0;
        for (let inIndex = 0; inIndex < inDim; inIndex++) {
            sum += (weight.data[outIndex * inDim + inIndex] ?? 0) * (row[inIndex] ?? 0);
        }
        result[outIndex] = sum;
    }
    return result;
}

function countRecoveryBuckets(
    learnedSkillIds: number[],
    recoveryValueBySkillId: Record<string, number>,
): Record<number, number> {
    const counts = Object.fromEntries(SURROGATE_RECOVERY_BUCKETS.map((bucket) => [bucket, 0])) as Record<number, number>;
    learnedSkillIds.forEach((skillId) => {
        const value = Number(recoveryValueBySkillId[String(skillId)] ?? 0);
        if (SURROGATE_RECOVERY_BUCKETS.includes(value)) {
            counts[value] += 1;
        }
    });
    return counts;
}

function buildSurrogateInputVector(
    horse: FrontendHorse,
    inputFeatureNames: string[],
    recoveryValueBySkillId: Record<string, number>,
): number[] {
    const recoveryCounts = countRecoveryBuckets(horse.learned_skill_ids, recoveryValueBySkillId);
    const learnedSkillIds = new Set(horse.learned_skill_ids.map((skillId) => Number(skillId)));
    return inputFeatureNames.map((featureName) => {
        switch (featureName) {
            case "speed":
                return Number(horse.speed ?? 0);
            case "stamina":
                return Number(horse.stamina ?? 0);
            case "pow":
                return Number(horse.pow ?? 0);
            case "guts":
                return Number(horse.guts ?? 0);
            case "wiz":
                return Number(horse.wiz ?? 0);
            default:
                break;
        }

        if (featureName.startsWith("style_is_")) {
            const styleId = Number(featureName.slice("style_is_".length));
            return horse.strategy === styleId ? 1 : 0;
        }
        if (featureName.startsWith("recovery_count_")) {
            const bucket = Number(featureName.slice("recovery_count_".length));
            return Number(recoveryCounts[bucket] ?? 0);
        }
        if (featureName.startsWith("has_skill_")) {
            const skillId = Number(featureName.slice("has_skill_".length));
            return learnedSkillIds.has(skillId) ? 1 : 0;
        }
        return 0;
    });
}

function computeSurrogateOutputs(horse: FrontendHorse, model: FrontendModel): Record<string, number> {
    const surrogate = model.surrogateSpurtModel;
    if (!surrogate) {
        return {};
    }
    const input = buildSurrogateInputVector(horse, surrogate.inputFeatureNames, surrogate.recoveryValueBySkillId);
    const normalizedInput = input.map((value, index) => {
        const mean = surrogate.normalization.mean[index] ?? 0;
        const std = surrogate.normalization.std[index] ?? 1;
        return (value - mean) / std;
    });
    const first = relu(linear(normalizedInput, surrogate.weights["net.0.weight"], surrogate.weights["net.0.bias"]));
    const second = relu(linear(first, surrogate.weights["net.3.weight"], surrogate.weights["net.3.bias"]));
    const logits = linear(second, surrogate.weights["net.6.weight"], surrogate.weights["net.6.bias"]);
    const result: Record<string, number> = {};
    surrogate.outputFeatureNames.forEach((featureName, index) => {
        const value = logits[index] ?? 0;
        result[featureName] = featureName === "surrogate_full_spurt_prob" || featureName === "surrogate_no_spurt_prob"
            ? sigmoid(value)
            : value;
    });
    return result;
}

function computeSurrogateContextFeatureMap(
    horse: FrontendHorse,
    model: FrontendModel,
    mechanics: Record<string, number>,
): Record<string, number> {
    const outputs = computeSurrogateOutputs(horse, model);
    const fullSpurtProb = Number(outputs.surrogate_full_spurt_prob ?? 0);
    const noSpurtProb = Number(outputs.surrogate_no_spurt_prob ?? 0);
    const delayRatio = Math.max(0, Math.min(1, Number(outputs.surrogate_spurt_delay_ratio ?? 0)));
    const speedRatio = Math.max(0, Math.min(1.25, Number(outputs.surrogate_spurt_speed_ratio ?? 0)));
    const hpMarginRatio = Math.max(-1.5, Math.min(1.5, Number(outputs.surrogate_hp_margin_ratio ?? 0)));
    const hpShortfall = Math.max(0, -hpMarginRatio);
    const speedShortfall = Math.max(0, 1 - Math.min(speedRatio, 1));
    const failureRisk = Math.max(1 - fullSpurtProb, noSpurtProb);
    const lastSpurtTargetSpeed = Number(horse.last_spurt_target_speed ?? 0);
    const projectedSpeedFactor = Math.max(
        0,
        Math.min(speedRatio, 1) * (1 - 0.75 * delayRatio) * (1 - 0.35 * hpShortfall),
    );
    const projectedLateSpeed = lastSpurtTargetSpeed * projectedSpeedFactor;
    const mechMarginRatio = Number(mechanics.mech_spurt_hp_margin_ratio ?? 0);
    const frontStyleFailureRisk = horse.strategy === 1 || horse.strategy === 5 ? failureRisk : 0;
    const mechFalseFeasibleFlag = hpMarginRatio < -0.05 && mechMarginRatio >= 0 ? 1 : 0;
    return {
        surrogate_spurt_failure_risk: failureRisk,
        surrogate_no_spurt_high_risk_flag: noSpurtProb >= 0.1 ? 1 : 0,
        surrogate_low_full_spurt_flag: fullSpurtProb < 0.5 ? 1 : 0,
        surrogate_hp_shortfall: hpShortfall,
        surrogate_hp_shortfall_flag: hpMarginRatio < -0.05 ? 1 : 0,
        surrogate_spurt_speed_shortfall: speedShortfall,
        surrogate_spurt_delay_ratio: delayRatio,
        surrogate_projected_late_speed: projectedLateSpeed,
        surrogate_projected_late_speed_gap: lastSpurtTargetSpeed - projectedLateSpeed,
        surrogate_front_style_failure_risk: frontStyleFailureRisk,
        surrogate_mech_false_feasible_flag: mechFalseFeasibleFlag,
    };
}

function computeRaceMechanicsFeatureMap(
    horse: FrontendHorse,
    courseContext: FrontendModel["courseContext"],
): Record<string, number> {
    const courseDistance = Number(courseContext.distance ?? 0);
    const courseSurface = Number(courseContext.surface ?? 0);
    const groundCondition = Number(courseContext.ground_condition ?? 0);
    const baseSpeed = courseDistance > 0
        ? BASE_SPEED_CONSTANT - (courseDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE
        : 0;
    const hpGroundModifier = GROUND_HP_CONSUMPTION_MODIFIER[courseSurface]?.[groundCondition] ?? 1.0;
    const remainingDistanceFromLateStart = Math.max(courseDistance / 3 - 60, 0);
    const strategy = TARGET_SPEED_PHASE_COEFFS[horse.strategy] ? horse.strategy : 1;
    const distSpeedMod = DISTANCE_PROFICIENCY_MODIFIER[horse.apt_distance] ?? 1.0;
    const groundAccelMod = GROUND_ACCEL_PROFICIENCY_MODIFIER[horse.apt_ground] ?? 1.0;
    const distAccelMod = ACCEL_DISTANCE_PROFICIENCY_MODIFIER[horse.apt_distance] ?? 1.0;
    const targetPhaseCoeffs = TARGET_SPEED_PHASE_COEFFS[strategy] ?? TARGET_SPEED_PHASE_COEFFS[1];
    const accelPhaseCoeffs = ACCEL_PHASE_COEFFS[strategy] ?? ACCEL_PHASE_COEFFS[1];
    const speedTerm = Math.sqrt(500 * Math.max(horse.speed, 0)) * distSpeedMod * 0.002;
    const earlyTargetSpeed = baseSpeed * targetPhaseCoeffs[0];
    const midTargetSpeed = baseSpeed * targetPhaseCoeffs[1];
    const lateTargetSpeed = baseSpeed * targetPhaseCoeffs[2] + speedTerm;
    const lateAcceleration = 0.0006
        * Math.sqrt(500 * Math.max(horse.pow, 0))
        * accelPhaseCoeffs[2]
        * groundAccelMod
        * distAccelMod;
    const maxHp = 0.8 * (HP_STRATEGY_COEFFICIENT[strategy] ?? 1.0) * horse.stamina + courseDistance;
    const minSpeed = 0.85 * baseSpeed + Math.sqrt(200 * Math.max(horse.guts, 0)) * 0.001;
    const wizRandomMaxPct = horse.wiz / 5500 * Math.log10(Math.max(horse.wiz * 0.1, 1));
    const wizRandomMinPct = wizRandomMaxPct - 0.65;
    const spurtWisdomChance = (15 + 0.05 * horse.wiz) / 100;
    const gutsHpModifier = 1 + (200 / Math.max(Math.sqrt(600 * Math.max(horse.guts, 1)), 1e-6));
    const lastSpurtTargetSpeed = Number(horse.last_spurt_target_speed ?? 0);
    const spurtHpPerSecond = 20
        * (((lastSpurtTargetSpeed - baseSpeed + 12) ** 2) / 144)
        * hpGroundModifier
        * gutsHpModifier;
    const spurtHpPerMeter = spurtHpPerSecond / Math.max(lastSpurtTargetSpeed, 1e-6);
    const spurtHpRequired = spurtHpPerMeter * remainingDistanceFromLateStart;
    const spurtHpMargin = maxHp - spurtHpRequired;
    const spurtHpMarginRatio = spurtHpMargin / Math.max(maxHp, 1);
    return {
        mech_max_hp: maxHp,
        mech_min_speed: minSpeed,
        mech_early_target_speed: earlyTargetSpeed,
        mech_mid_target_speed: midTargetSpeed,
        mech_late_target_speed: lateTargetSpeed,
        mech_late_acceleration: lateAcceleration,
        mech_wiz_random_max_pct: wizRandomMaxPct,
        mech_wiz_random_min_pct: wizRandomMinPct,
        mech_spurt_wisdom_chance: spurtWisdomChance,
        mech_spurt_hp_per_meter: spurtHpPerMeter,
        mech_spurt_hp_required: spurtHpRequired,
        mech_spurt_hp_margin: spurtHpMargin,
        mech_spurt_hp_margin_ratio: spurtHpMarginRatio,
        mech_immediate_spurt_feasible: spurtHpMargin >= 0 ? 1 : 0,
    };
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
        const opponentHorses = canonical.teams
            .filter((otherTeam) => otherTeam.team_id !== team.team_id)
            .flatMap((otherTeam) => otherTeam.horses);
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
        const opponentMeanLookup = new Map<string, number>();
        model.schema.rankFields.forEach((field) => {
            const values = opponentHorses.map((horse) => numericHorseField(horse, field));
            opponentMeanLookup.set(field, values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1));
        });
        const opponentMaxLookup = new Map<string, number>();
        model.schema.rankFields.forEach((field) => {
            opponentMaxLookup.set(field, Math.max(...opponentHorses.map((horse) => numericHorseField(horse, field))));
        });
        const teamGateNumbers = team.horses.map((horse) => horse.frame_order + 1);
        const teamGateMean = teamGateNumbers.reduce((sum, value) => sum + value, 0) / Math.max(teamGateNumbers.length, 1);
        const teamGateSpread = teamGateNumbers.length > 0
            ? Math.max(...teamGateNumbers) - Math.min(...teamGateNumbers)
            : 0;

        return team.horses.map((horse) => {
            const row: number[] = [];
            const gateNumber = horse.frame_order + 1;
            const mechanics = computeRaceMechanicsFeatureMap(horse, model.courseContext);
            const surrogateContext = computeSurrogateContextFeatureMap(horse, model, mechanics);
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
                if (featureName.startsWith("opponent_rank_pct_")) {
                    const field = featureName.replace("opponent_rank_pct_", "");
                    row.push(computeRankPctAgainst(opponentHorses.map((otherHorse) => numericHorseField(otherHorse, field)), numericHorseField(horse, field)));
                    return;
                }
                if (featureName.startsWith("gap_to_opponent_max_")) {
                    const field = featureName.replace("gap_to_opponent_max_", "");
                    row.push((opponentMaxLookup.get(field) ?? 0) - numericHorseField(horse, field));
                    return;
                }
                if (featureName.startsWith("gap_to_opponent_mean_")) {
                    const field = featureName.replace("gap_to_opponent_mean_", "");
                    row.push((opponentMeanLookup.get(field) ?? 0) - numericHorseField(horse, field));
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
                if (featureName === "last_spurt_target_speed") {
                    row.push(horse.last_spurt_target_speed ?? 0);
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
                if (featureName.startsWith("mech_")) {
                    row.push(mechanics[featureName] ?? 0);
                    return;
                }
                if (featureName.startsWith("surrogate_")) {
                    row.push(surrogateContext[featureName] ?? 0);
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

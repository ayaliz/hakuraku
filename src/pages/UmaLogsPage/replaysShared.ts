import { hydrateCompactRaceHorseData } from "../../data/TrainedCharaData";
import { normalizeSeasonValue } from "../../utils/season";
import { getCourseAptitudeFilters } from "../MultiRacePage/utils";
import {
    SUPPORT_CARD_LB_ANY,
    sanitizeCharacterRequirement,
    type CharacterMatchMode,
    type CharacterRequirement,
    type FilterProperty,
    type RequirementTruthMode,
    type SkillFilterMode,
    type SkillVariant,
    type StatOp,
    type SupportCardVariant,
} from "./explorerShared";

export type ReplayTeamMemberFilter = {
    characterMatchMode: CharacterMatchMode;
    cardId: number | null;
    strategy: number | null;
    requirements: CharacterRequirement[];
};

export type ReplayTeamFilter = {
    members: ReplayTeamMemberFilter[];
};

export type ReplayTeamFilterScope = "any" | "winner" | "loser";

export type ReplayScopedTeamFilter = ReplayTeamFilter & {
    scope: ReplayTeamFilterScope;
};

export type ReplayExactBuildFilter = {
    cardId: number;
    strategy: number;
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number;
    rankScore: number;
    careerWinCount: number;
    supportCardIds: number[];
    supportCardLimitBreaks: number[];
    learnedSkillIds: number[];
};

export type ReplaySearchRequest = {
    teamFilters?: ReplayScopedTeamFilter[] | null;
    sortKey?: "finishTime" | "date";
    sortDir?: "asc" | "desc";
    limit?: number;
    offset?: number;
};

export type ReplayCharacterVariant = {
    cardId: number;
    charaId: number;
    count: number;
};

export type ReplayBootstrapPayload = {
    cmId: string;
    courseId: number;
    totalRaces: number;
    characterVariants: ReplayCharacterVariant[];
    skillVariants: SkillVariant[];
    supportCardVariants: SupportCardVariant[];
};

export type ReplayMemberSummary = {
    frameOrder: number;
    finishOrder: number;
    charaId: number;
    cardId: number;
    strategy: number;
    rankScore?: number;
};

export type ReplayTeamSummary = {
    teamId: number;
    isWinnerTeam: boolean;
    teamSignature: string;
    members: ReplayMemberSummary[];
};

export type ReplaySearchRow = {
    raceUid: string;
    finishTime: number;
    ingestedAt: string;
    roomRunawayCount: number;
    roomFrontCount: number;
    roomPaceCount: number;
    roomLateCount: number;
    roomEndCount: number;
    winnerCardId: number;
    winnerCharaId: number;
    winnerStrategy: number;
    winnerTeam: ReplayTeamSummary;
    enemyTeams: ReplayTeamSummary[];
};

export type ReplaySearchResponse = {
    total: number;
    races: ReplaySearchRow[];
};

export type ReplayHorseArchiveRow = {
    frame_order: number;
    team_id: number;
    chara_id: number;
    card_id: number;
    trained_chara_id?: number;
    running_style: number;
    motivation?: number;
    single_mode_win_count?: number;
    speed?: number;
    stamina?: number;
    pow?: number;
    guts?: number;
    wiz?: number;
    rank_score?: number;
    apt_ground?: number;
    apt_distance?: number;
    apt_style?: number;
    skill_array?: number[];
};

export type ReplayTrainedCharaArchiveRow = {
    trained_chara_id: number;
    support_card_array: Array<{ support_card_id: number; limit_break_count: number }>;
    succession_chara_list: Array<{
        position_id: number;
        card_id: number;
        rank: number;
        factor_data_array: Array<{ factor_id: number }>;
    }>;
};

export type ReplayPayloadResponse = {
    race: {
        raceUid: string;
        cmId: string;
        courseId: number | null;
        raceType?: string | null;
        groundCondition?: string | null;
        weather?: string | null;
        season?: string | null;
        laneDistanceMax?: number | null;
        winnerTeamId: number;
    };
    replay: {
        horseACTVersion?: string;
        raceScenario: string;
        raceHorseDataArray: ReplayHorseArchiveRow[];
        trainedCharaArray: ReplayTrainedCharaArchiveRow[];
    };
};

export type ReplayPresenterInput = {
    raceHorseInfo: any[];
    raceScenario: string;
    detectedCourseId?: number;
    laneDistanceMax?: number;
    raceType?: string;
    trackDetails?: {
        condition?: string;
        weather?: string;
        season?: string;
    };
};

export function normalizeReplayCharacterFilter(filter: ReplayTeamMemberFilter | null | undefined): ReplayTeamMemberFilter | null {
    if (!filter) return null;
    const normalized: ReplayTeamMemberFilter = {
        characterMatchMode: filter.characterMatchMode === "isNot" ? "isNot" : "is",
        cardId: filter.cardId ?? null,
        strategy: filter.strategy ?? null,
        requirements: (filter.requirements ?? [])
            .map((requirement) => sanitizeCharacterRequirement(requirement))
            .filter((requirement): requirement is CharacterRequirement => requirement !== null),
    };
    if (normalized.cardId === null && normalized.strategy === null && normalized.requirements.length === 0) {
        return null;
    }
    return normalized;
}

export function normalizeReplayTeamFilter(filter: ReplayTeamFilter | null | undefined): ReplayTeamFilter | null {
    if (!filter) return null;
    const members = filter.members
        .map((member) => normalizeReplayCharacterFilter(member))
        .filter((member): member is ReplayTeamMemberFilter => member !== null);
    return members.length > 0 ? { members } : null;
}

function exactRequirement(
    id: string,
    property: FilterProperty,
    statValue = 0,
    extras: Partial<CharacterRequirement> = {},
): CharacterRequirement {
    return {
        id,
        truthMode: "require" as RequirementTruthMode,
        property,
        statOp: "=" as StatOp,
        statValue,
        skillId: null,
        skillMode: "learned" as SkillFilterMode,
        supportCardId: null,
        supportCardPresent: true,
        supportCardLb: SUPPORT_CARD_LB_ANY,
        ...extras,
    };
}

export function buildReplayExactBuildMemberFilter(build: ReplayExactBuildFilter): ReplayTeamMemberFilter {
    const statRequirements: CharacterRequirement[] = [
        exactRequirement("exact-speed", "speed", build.speed),
        exactRequirement("exact-stamina", "stamina", build.stamina),
        exactRequirement("exact-pow", "pow", build.pow),
        exactRequirement("exact-guts", "guts", build.guts),
        exactRequirement("exact-wiz", "wiz", build.wiz),
        exactRequirement("exact-rank", "rankScore", build.rankScore),
        exactRequirement("exact-career-wins", "careerWinCount", build.careerWinCount),
    ];

    const supportRequirements = build.supportCardIds
        .map((supportCardId, index) => supportCardId > 0
            ? exactRequirement(`exact-support-${index}-${supportCardId}`, "supportCard", 0, {
                supportCardId,
                supportCardLb: build.supportCardLimitBreaks[index] ?? SUPPORT_CARD_LB_ANY,
            })
            : null)
        .filter((requirement): requirement is CharacterRequirement => requirement !== null);

    const skillRequirements = [...new Set(build.learnedSkillIds)]
        .filter((skillId) => skillId > 0)
        .map((skillId) => exactRequirement(`exact-skill-${skillId}`, "skill", 0, { skillId, skillMode: "learned" }));

    return {
        characterMatchMode: "is",
        cardId: build.cardId,
        strategy: build.strategy,
        requirements: [
            ...statRequirements,
            ...supportRequirements,
            ...skillRequirements,
        ],
    };
}

export function buildReplayPresenterInput(payload: ReplayPayloadResponse): ReplayPresenterInput {
    const courseFilters = getCourseAptitudeFilters(payload.race.courseId ?? undefined);
    const horseInfo = payload.replay.raceHorseDataArray.map((horseData, index) => {
        const trainedChara = payload.replay.trainedCharaArray[index];
        const hydrated = hydrateCompactRaceHorseData(horseData, { courseAptitudeFilters: courseFilters });

        const deck = Array.isArray(trainedChara?.support_card_array)
            ? trainedChara.support_card_array.map((card, cardIndex) => ({
                position: cardIndex + 1,
                id: card.support_card_id,
                lb: card.limit_break_count,
                exp: 0,
            }))
            : [];

        const parents = Array.isArray(trainedChara?.succession_chara_list)
            ? trainedChara.succession_chara_list.map((parent) => ({
                positionId: parent.position_id,
                cardId: parent.card_id,
                rank: parent.rank,
                factors: Array.isArray(parent.factor_data_array)
                    ? parent.factor_data_array.map((factor) => ({
                        id: factor.factor_id,
                        level: factor.factor_id % 100,
                    }))
                    : [],
            }))
            : [];

        return {
            ...hydrated,
            deck,
            parents,
        };
    });

    return {
        raceHorseInfo: horseInfo,
        raceScenario: payload.replay.raceScenario,
        detectedCourseId: payload.race.courseId ?? undefined,
        laneDistanceMax: payload.race.laneDistanceMax ?? undefined,
        raceType: payload.race.raceType ?? undefined,
        trackDetails: {
            condition: payload.race.groundCondition ?? undefined,
            weather: payload.race.weather ?? undefined,
            season: normalizeSeasonValue(payload.race.season ?? undefined)?.toString(),
        },
    };
}

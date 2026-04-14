import { hydrateCompactRaceHorseData } from "../../data/TrainedCharaData";
import { normalizeSeasonValue } from "../../utils/season";
import { getCourseAptitudeFilters } from "../MultiRacePage/utils";
import {
    sanitizeCharacterRequirement,
    type CharacterMatchMode,
    type CharacterRequirement,
    type SkillVariant,
    type SupportCardVariant,
} from "./explorerShared";

export type ReplayCountOp = "=" | ">" | ">=" | "<" | "<=";

export type ReplayCountFilter = {
    op: ReplayCountOp;
    value: number;
};

export type ReplayTeamMemberFilter = {
    characterMatchMode: CharacterMatchMode;
    cardId: number | null;
    strategy: number | null;
    requirements: CharacterRequirement[];
};

export type ReplayTeamFilter = {
    members: ReplayTeamMemberFilter[];
};

export type ReplaySearchRequest = {
    winner?: ReplayTeamMemberFilter | null;
    winnerCardId?: number | null;
    winnerStrategy?: number | null;
    roomRunaway?: ReplayCountFilter | null;
    roomFront?: ReplayCountFilter | null;
    roomPace?: ReplayCountFilter | null;
    roomLate?: ReplayCountFilter | null;
    roomEnd?: ReplayCountFilter | null;
    winnerTeam?: ReplayTeamFilter | null;
    enemyTeam?: ReplayTeamFilter | null;
    enemyTeam2?: ReplayTeamFilter | null;
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

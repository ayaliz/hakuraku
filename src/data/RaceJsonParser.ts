import GameDataLoader from "./GameDataLoader";
import UMDatabaseWrapper from "./UMDatabaseWrapper";
import { hydrateCompactRaceHorseData } from "./TrainedCharaData";
import { normalizeSeasonValue } from "../utils/season";

export type TrackDetails = { condition?: string, weather?: string, season?: string };

export type ParsedStandardRaceJson = {
    horseInfo: any[];
    raceScenario: string;
    detectedCourseId?: number;
    laneDistanceMax?: number;
    hasHorseActVersion: boolean;
    horseActVersion?: string;
    randomSeed?: number;
    raceType?: string;
    trackDetails: TrackDetails;
    playerFrameOrder?: number;
    playerIndices: Set<number>;
    deckByTrainedCharaId: Map<number, { id: number; lb: number }[]>;
    deckByViewerAndCard: Map<string, { id: number; lb: number }[]>;
};

export function hasHorseActVersionKey(json: any): boolean {
    return Boolean(json && typeof json === "object" && Object.prototype.hasOwnProperty.call(json, "horseACT_version"));
}

export function normalizeRaceJsonInput(json: any): any {
    const packetData = json?.data;
    if (
        packetData
        && typeof packetData === "object"
        && !Array.isArray(packetData)
        && (Array.isArray(packetData["race_horse_data_array"]) || Array.isArray(packetData["raceHorseDataArray"]))
    ) {
        const roomInfo = packetData["room_info"] ?? {};
        const packetHasVersion = hasHorseActVersionKey(packetData);
        const jsonHasVersion = hasHorseActVersionKey(json);
        return {
            ...packetData,
            ...(packetHasVersion
                ? { horseACT_version: packetData["horseACT_version"] }
                : jsonHasVersion
                    ? { horseACT_version: json["horseACT_version"] }
                    : {}),
            race_scenario: packetData["race_scenario"] ?? packetData["raceScenario"] ?? roomInfo["race_scenario"] ?? roomInfo["raceScenario"],
            race_type: packetData["race_type"] ?? packetData["raceType"] ?? roomInfo["race_type"] ?? roomInfo["raceType"],
            ground_condition: packetData["ground_condition"] ?? packetData["groundCondition"] ?? roomInfo["ground_condition"] ?? roomInfo["groundCondition"],
            weather: packetData["weather"] ?? roomInfo["weather"],
            season: packetData["season"] ?? roomInfo["season"],
            race_instance_id: packetData["race_instance_id"] ?? packetData["raceInstanceId"] ?? roomInfo["race_instance_id"] ?? roomInfo["raceInstanceId"],
            random_seed: packetData["random_seed"] ?? packetData["randomSeed"] ?? roomInfo["random_seed"] ?? roomInfo["randomSeed"] ?? json["random_seed"] ?? json["randomSeed"],
        };
    }

    return json;
}

export function isTeamTrialRaceJson(json: any): boolean {
    return Array.isArray(json?.["race_start_params_array"]) && Array.isArray(json?.["race_result_array"]);
}

function getPlayerFrameOrder(playerMembers: any): number | undefined {
    const members = Array.isArray(playerMembers)
        ? playerMembers
        : playerMembers && typeof playerMembers === "object"
            ? [playerMembers]
            : [];
    for (const member of members) {
        const horseIndex = Number(member?.horseIndex ?? member?.horse_index);
        if (Number.isInteger(horseIndex) && horseIndex >= 0) return horseIndex;
        const frameOrder = Number(member?.frame_order ?? member?.frameOrder);
        if (Number.isInteger(frameOrder) && frameOrder >= 1) return frameOrder - 1;
    }
    return undefined;
}

function getPlayerIndices(playerMembers: any): Set<number> {
    const indices = new Set<number>();
    const members = Array.isArray(playerMembers)
        ? playerMembers
        : playerMembers && typeof playerMembers === "object"
            ? [playerMembers]
            : [];
    members.forEach((member: any) => {
        const horseIndex = Number(member?.horseIndex ?? member?.horse_index);
        if (Number.isInteger(horseIndex) && horseIndex >= 0) {
            indices.add(horseIndex);
            return;
        }
        const frameOrder = Number(member?.frame_order ?? member?.frameOrder);
        if (Number.isInteger(frameOrder) && frameOrder >= 1) {
            indices.add(frameOrder - 1);
        }
    });
    return indices;
}

function getCourseAptitudeFilters(courseId: number | undefined): { ground: number; distance: number } | null {
    if (!courseId) return null;
    const course = (GameDataLoader.courseData as Record<string, any>)[String(courseId)];
    if (!course) return null;
    const ground = course.surface as number;
    const m = course.distance as number;
    const distance = m <= 1400 ? 1 : m <= 1800 ? 2 : m <= 2400 ? 3 : 4;
    return { ground, distance };
}

function parseParentFactorArray(factorArray: any): { id: number, level: number }[] {
    if (!Array.isArray(factorArray)) return [];
    return factorArray
        .map((factor: any) => {
            const factorId = typeof factor === "number"
                ? factor
                : Number(factor?.factor_id ?? factor?.factorId ?? factor?.FactorId ?? factor?.id);
            if (!Number.isFinite(factorId)) return null;
            const rawLevel: number | undefined = typeof factor === "number"
                ? undefined
                : Number(factor?.level ?? factor?.factorLv ?? factor?.FactorLv ?? factor?.Level);
            const level = rawLevel !== undefined && Number.isFinite(rawLevel) && rawLevel > 0
                ? rawLevel
                : factorId % 100;
            return { id: factorId, level };
        })
        .filter((factor): factor is { id: number, level: number } => factor !== null);
}

function parseParentEntries(successionList: any): { positionId: number, cardId: number, rank: number, factors: { id: number, level: number }[] }[] {
    if (!Array.isArray(successionList)) return [];
    return successionList
        .filter((parent: any) => {
            const positionId = parent?.position_id ?? parent?.positionId ?? parent?.PositionId;
            return [10, 11, 12, 20, 21, 22].includes(positionId);
        })
        .map((parent: any) => {
            const factorArray = parent.factor_info_array
                ?? parent.factor_data_array
                ?? parent.factorDataArray
                ?? parent.FactorDataArray
                ?? parent.factor_id_array;
            return {
                positionId: parent.position_id ?? parent.positionId ?? parent.PositionId,
                cardId: parent.card_id ?? parent.cardId ?? parent.CardId,
                rank: parent.rank ?? parent.Rank,
                factors: parseParentFactorArray(factorArray),
            };
        });
}

function mapTrainedCharasById(trainedCharas: any[]): Map<number, any> {
    const trainedCharaById = new Map<number, any>();
    trainedCharas.forEach((trainedChara: any) => {
        [
            trainedChara?.trained_chara_id,
            trainedChara?.trainedCharaId,
            trainedChara?.owner_trained_chara_id,
            trainedChara?.ownerTrainedCharaId,
            trainedChara?.id,
        ].forEach((id) => {
            const numericId = Number(id);
            if (Number.isFinite(numericId) && numericId > 0) {
                trainedCharaById.set(numericId, trainedChara);
            }
        });
    });
    return trainedCharaById;
}

function findApiTrainedChara(
    horseData: any,
    index: number,
    trainedCharas: any[],
    trainedCharaById: Map<number, any>,
): any {
    const viewerId = Number(horseData?.viewer_id ?? horseData?.viewerId);
    const cardId = Number(horseData?.card_id ?? horseData?.cardId);
    if (Number.isFinite(viewerId) && Number.isFinite(cardId)) {
        const byViewerAndCard = trainedCharas.find((candidate: any) =>
            Number(candidate?.viewer_id ?? candidate?.viewerId) === viewerId
            && Number(candidate?.card_id ?? candidate?.cardId) === cardId
        );
        if (byViewerAndCard) return byViewerAndCard;
    }

    const trainedCharaId = Number(
        horseData?.trained_chara_id
        ?? horseData?.trainedCharaId
        ?? horseData?.owner_trained_chara_id
    );
    return trainedCharaById.get(trainedCharaId) ?? trainedCharas[index];
}

function readRankScore(trainedChara: any): number | undefined {
    const raw = trainedChara?.rank_score
        ?? trainedChara?.rankScore
        ?? trainedChara?.RankScore
        ?? trainedChara?.["<RankScore>k__BackingField"];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseActDeck(trainedChara: any): { position: number, id: number, lb: number, exp: number }[] {
    const supportCards = trainedChara?.["<SupportCardArray>k__BackingField"] ?? trainedChara?.supportCardArray;
    if (!Array.isArray(supportCards)) return [];
    return supportCards.map((card: any, cardIndex: number) => ({
        position: card["<Position>k__BackingField"] ?? card.position ?? (cardIndex + 1),
        id: card["<SupportCardId>k__BackingField"] ?? card.supportCardId,
        lb: card["<LimitBreakCount>k__BackingField"] ?? card.limitBreakCount,
        exp: card["<Exp>k__BackingField"] ?? card.exp,
    })).sort((a, b) => a.position - b.position);
}

function parseApiDeck(trainedChara: any): { position: number, id: number, lb: number, exp: number }[] {
    const supportCards = trainedChara?.["support_card_array"] || trainedChara?.["support_card_list"] || trainedChara?.["supportCardArray"] || trainedChara?.["supportCardList"] || trainedChara?.["SupportCardArray"];
    if (!Array.isArray(supportCards)) return [];
    return supportCards.map((card: any, cardIndex: number) => ({
        position: card["position"] ?? card["Position"] ?? (cardIndex + 1),
        id: card["support_card_id"] ?? card["SupportCardId"],
        lb: card["limit_break_count"] ?? card["LimitBreakCount"],
        exp: card["exp"] ?? card["Exp"],
    })).sort((a: any, b: any) => a.position - b.position);
}

function deckMapValue(deck: { id: number; lb: number }[] | { position: number; id: number; lb: number; exp?: number }[]) {
    return deck.map((card: any) => ({ id: card.id, lb: card.lb }));
}

function readScenarioId(trainedChara: any): number | undefined {
    const raw = trainedChara?.scenario_id
        ?? trainedChara?.scenarioId
        ?? trainedChara?.ScenarioId
        ?? trainedChara?.["<ScenarioId>k__BackingField"];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readFanCount(trainedChara: any): number | undefined {
    const raw = trainedChara?.fan_count
        ?? trainedChara?.fanCount
        ?? trainedChara?.fans
        ?? trainedChara?.Fans
        ?? trainedChara?.["<Fans>k__BackingField"];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseCourseIdFromFilename(fileName?: string): number | undefined {
    if (!fileName) return undefined;
    const match = fileName.match(/^(\d+)_/);
    if (!match) return undefined;
    const raceInstanceId = parseInt(match[1], 10);
    return UMDatabaseWrapper.raceInstanceCourseSetId[raceInstanceId];
}

function parseCourseIdFromRaceInstance(json: any): number | undefined {
    const raceInstanceId = Number(json?.race_instance_id ?? json?.raceInstanceId ?? json?.RaceInstanceId);
    return Number.isFinite(raceInstanceId) ? UMDatabaseWrapper.raceInstanceCourseSetId[raceInstanceId] : undefined;
}

function readRandomSeed(json: any): number | undefined {
    const raw = json?.random_seed
        ?? json?.randomSeed
        ?? json?.RandomSeed
        ?? json?.["<RandomSeed>k__BackingField"];
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseActFormatRaceJson(json: any): ParsedStandardRaceJson | { error: string } {
    const raceHorseArray = json["<RaceHorse>k__BackingField"] ?? json.raceHorse;
    if (!Array.isArray(raceHorseArray)) {
        return { error: "Could not find raceHorse in JSON" };
    }

    const courseSet = json["<RaceCourseSet>k__BackingField"] ?? json.raceCourseSet;
    const detectedCourseId = courseSet?.["<Id>k__BackingField"] ?? courseSet?.id ?? courseSet?.Id;
    const laneDistanceMax = courseSet?.["<LaneDistanceMax>k__BackingField"] ?? courseSet?.LaneDistanceMax
        ?? courseSet?.laneDistanceMax ?? json["<LaneDistanceMax>k__BackingField"] ?? json.laneDistanceMax ?? json.LaneDistanceMax;
    const deckByTrainedCharaId = new Map<number, { id: number; lb: number }[]>();
    const deckByViewerAndCard = new Map<string, { id: number; lb: number }[]>();

    const horseInfo = raceHorseArray
        .map((member: any) => {
            const horseData = member?._responseHorseData ?? member?.responseHorseData;
            if (horseData === undefined || horseData === null) return null;
            const trainedChara = member["<TrainedCharaData>k__BackingField"] ?? member.trainedCharaData;
            const deck = parseActDeck(trainedChara);
            const parents = (() => {
                const items = trainedChara?.["<SuccessionCharaList>k__BackingField"]?._items
                    ?? trainedChara?.successionCharaList?.items
                    ?? trainedChara?.successionCharaList?._items
                    ?? trainedChara?.successionCharaList;
                if (!Array.isArray(items)) return [];
                return parseParentEntries(items.filter((p: any) => p !== null).map((p: any) => ({
                    position_id: p._positionId ?? p.positionId,
                    card_id: p["<CardId>k__BackingField"] ?? p.cardId,
                    rank: p._rank ?? p.rank,
                    factor_data_array: p["<FactorDataArray>k__BackingField"] ?? p.factorDataArray,
                })));
            })();
            mapTrainedCharasById([trainedChara]).forEach((_, id) => deckByTrainedCharaId.set(id, deckMapValue(deck)));
            const viewerId = horseData.viewer_id ?? horseData.viewerId;
            const cardId = horseData.card_id ?? horseData.cardId;
            if (viewerId !== undefined && cardId !== undefined) {
                deckByViewerAndCard.set(`${viewerId}:${cardId}`, deckMapValue(deck));
            }
            return {
                ...horseData,
                fan_count: horseData.fan_count ?? horseData.fanCount ?? horseData.fans ?? readFanCount(trainedChara),
                rank_score: horseData.rank_score ?? readRankScore(trainedChara),
                scenario_id: readScenarioId(trainedChara),
                deck,
                parents,
            };
        })
        .filter((data: any) => data !== null);

    if (horseInfo.length === 0) return { error: "No horse data found in _responseHorseData fields" };

    const raceScenario = json["<SimDataBase64>k__BackingField"] ?? json.simDataBase64;
    if (typeof raceScenario !== "string" || !raceScenario) {
        return { error: "Could not find simDataBase64 in JSON" };
    }

    const playerMembers = json["<PlayerTeamMemberArray>k__BackingField"] ?? json.playerTeamMemberArray;
    return {
        horseInfo,
        raceScenario,
        detectedCourseId,
        laneDistanceMax,
        hasHorseActVersion: hasHorseActVersionKey(json),
        horseActVersion: json.horseACT_version,
        randomSeed: readRandomSeed(json),
        raceType: json["<RaceType>k__BackingField"] ?? json.raceType,
        trackDetails: {
            condition: json["<GroundCondition>k__BackingField"] ?? json.groundCondition,
            weather: json["<Weather>k__BackingField"] ?? json.weather ?? json.Weather,
            season: normalizeSeasonValue(json["<Season>k__BackingField"] ?? json.season)?.toString(),
        },
        playerFrameOrder: getPlayerFrameOrder(playerMembers),
        playerIndices: getPlayerIndices(playerMembers),
        deckByTrainedCharaId,
        deckByViewerAndCard,
    };
}

function parseApiFormatRaceJson(json: any, options?: { fileName?: string }): ParsedStandardRaceJson | { error: string } {
    try {
        const rawHorses = json["race_horse_data_array"] ?? json["raceHorseDataArray"];
        if (!Array.isArray(rawHorses)) return { error: "Could not find race_horse_data_array in JSON" };
        const raceScenario = json["race_scenario"] ?? json["raceScenario"];
        if (typeof raceScenario !== "string" || !raceScenario) return { error: "Could not find race_scenario in JSON" };

        const trainedCharas = json["trained_chara_array"] || json["trainedCharaArray"] || [];
        const courseSet = json["race_course_set"] || json["raceCourseSet"] || json["RaceCourseSet"];
        let detectedCourseId = courseSet?.id ?? courseSet?.Id;
        if (!detectedCourseId) detectedCourseId = parseCourseIdFromRaceInstance(json) ?? parseCourseIdFromFilename(options?.fileName);
        const laneDistanceMax = courseSet?.lane_distance_max ?? courseSet?.LaneDistanceMax ?? json.lane_distance_max ?? json.LaneDistanceMax;
        const courseAptitudeFilters = getCourseAptitudeFilters(detectedCourseId);
        const trainedCharaById = mapTrainedCharasById(trainedCharas);
        const deckByTrainedCharaId = new Map<number, { id: number; lb: number }[]>();
        const deckByViewerAndCard = new Map<string, { id: number; lb: number }[]>();

        const horseInfo = rawHorses.map((horseData: any, index: number) => {
            if (!horseData) return null;
            const trainedCharaId = Number(horseData.trained_chara_id ?? horseData.trainedCharaId ?? horseData.owner_trained_chara_id);
            const trainedChara = findApiTrainedChara(horseData, index, trainedCharas, trainedCharaById);
            const deck = parseApiDeck(trainedChara);
            const successionList = trainedChara?.succession_chara_array
                || trainedChara?.succession_chara_list
                || trainedChara?.successionCharaArray
                || trainedChara?.successionCharaList
                || trainedChara?.SuccessionCharaList;
            const parents = parseParentEntries(successionList);
            const hydrated = hydrateCompactRaceHorseData(horseData, { courseAptitudeFilters });
            const deckValue = deckMapValue(deck);
            const finalTrainedCharaId = Number(hydrated.trained_chara_id ?? trainedCharaId);
            if (Number.isFinite(finalTrainedCharaId) && finalTrainedCharaId > 0) deckByTrainedCharaId.set(finalTrainedCharaId, deckValue);
            const viewerId = hydrated.viewer_id ?? hydrated.viewerId;
            const cardId = hydrated.card_id ?? hydrated.cardId;
            if (viewerId !== undefined && cardId !== undefined) deckByViewerAndCard.set(`${viewerId}:${cardId}`, deckValue);
            return {
                ...hydrated,
                fan_count: hydrated.fan_count ?? hydrated.fanCount ?? hydrated.fans ?? readFanCount(trainedChara),
                rank_score: hydrated.rank_score ?? readRankScore(trainedChara),
                scenario_id: readScenarioId(trainedChara),
                deck,
                parents,
            };
        }).filter((horse: any) => horse !== null);

        if (horseInfo.length === 0) return { error: "No horse data found in race_horse_data_array" };

        const playerMembers = json["player_team_member_array"] ?? json["playerTeamMemberArray"] ?? json["PlayerTeamMemberArray"];
        return {
            horseInfo,
            raceScenario,
            detectedCourseId,
            laneDistanceMax,
            hasHorseActVersion: hasHorseActVersionKey(json),
            horseActVersion: json.horseACT_version,
            randomSeed: readRandomSeed(json),
            raceType: json.race_type ?? json.raceType ?? json.RaceType,
            trackDetails: {
                condition: json.ground_condition ?? json.groundCondition ?? json.GroundCondition,
                weather: json.weather ?? json.Weather,
                season: normalizeSeasonValue(json.season ?? json.Season)?.toString(),
            },
            playerFrameOrder: getPlayerFrameOrder(playerMembers),
            playerIndices: getPlayerIndices(playerMembers),
            deckByTrainedCharaId,
            deckByViewerAndCard,
        };
    } catch (err: any) {
        return { error: `Failed to parse API format race JSON: ${err.message}` };
    }
}

export function parseStandardRaceJson(rawJson: any, options?: { fileName?: string }): ParsedStandardRaceJson | { error: string } {
    const json = normalizeRaceJsonInput(rawJson);
    if (isTeamTrialRaceJson(json)) {
        return { error: "Team Trial files are not supported by the standard race parser" };
    }
    if ((json?.race_scenario ?? json?.raceScenario) && (Array.isArray(json?.race_horse_data_array) || Array.isArray(json?.raceHorseDataArray))) {
        return parseApiFormatRaceJson(json, options);
    }
    if ((json?.["<SimDataBase64>k__BackingField"] ?? json?.simDataBase64) && (Array.isArray(json?.["<RaceHorse>k__BackingField"]) || Array.isArray(json?.raceHorse))) {
        return parseActFormatRaceJson(json);
    }
    return { error: "Could not find raceHorse or race_horse_data_array in JSON" };
}

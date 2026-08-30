import { type RaceSimulateEventData, RaceSimulateEventData_SimulateEventType } from "../../data/race_data_pb";
import { deserializeFromBase64 } from "../../data/RaceDataParser";
import { fromRaceHorseData } from "../../data/TrainedCharaData";
import GameDataLoader from "../../data/GameDataLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { parseGroundCondition, calculateRaceDistance } from "../../components/RaceDataPresenter/utils/RacePresenterUtils";
import { normalizeSeasonValue } from "../../utils/season";
import { parseStandardRaceJson } from "../../data/RaceJsonParser";
import {
    AggregatedStats,
    CharacterStats,
    GateBlockedStats,
    GateSkillActivationStats,
    HorseEntry,
    PairSynergyStats,
    ParsedRace,
    SkillActivationPoint,
    SkillStats,
    StrategyStats,
    TeamCompositionStats,
} from "./types";
import { BAYES_TEAM, STRATEGY_DISPLAY_ORDER, STYLE_BREAKDOWN_STRATEGY_ORDER } from "./components/WinDistributionCharts/constants";
import { effectiveStrategyForHorse, isDebufferHorse } from "./styleClassifier";

const STRATEGY_NAMES: Record<number, string> = {
    1: "Front Runner",
    2: "Pace Chaser",
    3: "Late Surger",
    4: "End Closer",
    5: "Runaway",
    6: "Debuffer",
};
const RUNAWAY_TRIGGER_SKILL_ID = 202051;
const FORCED_GOLD_TRIGGER_SKILL_IDS = new Set([110071, 910071]);
const FORCED_GOLD_ACTIVATION_WINDOW_SECONDS = 1.5 / 15;
const GOLD_SKILL_RARITY_REFERENCE_ID = 200331;
const ALL_STRATEGY_IDS: number[] = [...STYLE_BREAKDOWN_STRATEGY_ORDER];
const ROOM_COMPOSITION_STRATEGY_IDS: number[] = [...STRATEGY_DISPLAY_ORDER];
const GATE_FLAVOR_TO_STRATEGIES = {
    total: null,
    front: new Set([1, 5]),
    pace: new Set([2]),
    late: new Set([3]),
    end: new Set([4]),
} as const;
const DODGING_DANGER_SKILL_IDS = [201261, 201262] as const;
const DODGING_DANGER_SKILL_BASE_IDS = new Set(DODGING_DANGER_SKILL_IDS.map((id) => Math.floor(id / 10)));
const SEASON_LABELS: Record<number, string> = {
    1: "Spring",
    2: "Summer",
    3: "Autumn",
    4: "Winter",
    5: "Spring",
};
const WEATHER_LABELS: Record<number, string> = {
    1: "Sunny",
    2: "Cloudy",
    3: "Rainy",
    4: "Snowy",
};
const GROUND_CONDITION_LABELS: Record<number, string> = {
    1: "Firm",
    2: "Good",
    3: "Soft",
    4: "Heavy",
};
const GROUND_APTITUDE_FIELD: Record<number, string> = {
    1: "proper_ground_turf",
    2: "proper_ground_dirt",
};
const DISTANCE_APTITUDE_FIELD: Record<number, string> = {
    1: "proper_distance_short",
    2: "proper_distance_mile",
    3: "proper_distance_middle",
    4: "proper_distance_long",
};
const RUNNING_STYLE_TO_APTITUDE: Record<number, string> = {
    1: "proper_running_style_nige",
    2: "proper_running_style_senko",
    3: "proper_running_style_sashi",
    4: "proper_running_style_oikomi",
    5: "proper_running_style_nige",
};


// Get track info from course ID
function getTrackInfo(courseId: number | undefined): { label: string; id: number; length: number } | null {
    if (!courseId) return null;
    const track = GameDataLoader.racetracks.pageProps.racetrackFilterData.find((t: any) => t.id === courseId);
    if (!track) return null;
    return { label: track.label, id: track.id, length: track.length };
}

// Get a short track name for display (just location and distance)
export function getTrackLabel(courseId: number | undefined): string {
    const info = getTrackInfo(courseId);
    if (!info) return "Unknown Track";
    return info.label;
}

function displayEnumish(
    value: string | number | undefined,
    numericLabels: Record<number, string>,
    unknownLabel: string
): string {
    if (value === undefined || value === null || value === "") return unknownLabel;
    if (typeof value === "string") return value;
    return numericLabels[value] ?? String(value);
}

export function getSeasonLabel(value: string | number | undefined): string {
    return displayEnumish(normalizeSeasonValue(value), SEASON_LABELS, "Unknown season");
}

export function getWeatherLabel(value: string | number | undefined): string {
    return displayEnumish(value, WEATHER_LABELS, "Unknown weather");
}

export function getGroundConditionLabel(value: number | undefined): string {
    if (value === undefined || value === null || value === 0) return "Unknown ground";
    return GROUND_CONDITION_LABELS[value] ?? String(value);
}

// Get the official track distance from course ID
function getTrackDistance(courseId: number | undefined): number | null {
    const info = getTrackInfo(courseId);
    return info ? info.length : null;
}

// Returns aptitude filter info for a given course: ground (1=Turf, 2=Dirt) and distance category (1=Sprint…4=Long)
export function getCourseAptitudeFilters(courseId: number | undefined): { ground: number; distance: number } | null {
    if (!courseId) return null;
    const course = (GameDataLoader.courseData as Record<string, any>)[String(courseId)];
    if (!course) return null;
    const ground = course.surface as number;
    const m = course.distance as number;
    const distance = m <= 1400 ? 1 : m <= 1800 ? 2 : m <= 2400 ? 3 : 4;
    return { ground, distance };
}

export function parseRaceJson(json: any, fileName: string): ParsedRace | { error: string } {
    const id = `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const parsedJson = parseStandardRaceJson(json, { fileName });
    if ("error" in parsedJson) return parsedJson;

    const parsedRaceData = deserializeFromBase64(parsedJson.raceScenario);
    if (!parsedRaceData) {
        return { error: 'Failed to parse race scenario data' };
    }

    const raceDistance = calculateRaceDistance(parsedRaceData);

    return {
        id,
        fileName,
        raceData: parsedRaceData,
        horseInfo: parsedJson.horseInfo,
        detectedCourseId: parsedJson.detectedCourseId,
        groundCondition: parseGroundCondition(parsedJson.trackDetails.condition),
        weather: parsedJson.trackDetails.weather,
        season: normalizeSeasonValue(parsedJson.trackDetails.season),
        raceDistance,
        uploadedAt: new Date(),
        playerIndices: parsedJson.playerIndices,
        raceType: parsedJson.raceType,
        deckByTrainedCharaId: parsedJson.deckByTrainedCharaId,
        deckByViewerAndCard: parsedJson.deckByViewerAndCard,
    };
}

export function extractHorseEntries(race: ParsedRace): HorseEntry[] {
    const entries: HorseEntry[] = [];
    const courseAptitudeFilters = getCourseAptitudeFilters(race.detectedCourseId);
    const aptGroundField = courseAptitudeFilters ? GROUND_APTITUDE_FIELD[courseAptitudeFilters.ground] : null;
    const aptDistanceField = courseAptitudeFilters ? DISTANCE_APTITUDE_FIELD[courseAptitudeFilters.distance] : null;
    const { naturalEvents: analyticsSkillEvents, forcedEvents: forcedAnalyticsSkillEvents } = classifyAnalyticsSkillEvents(race);

    race.horseInfo.forEach((data, index) => {
        const frameOrder = (data['frame_order'] ?? (index + 1)) - 1;
        const horseResult = race.raceData.horseResult[frameOrder];
        if (!horseResult) return;

        const trainedChara = fromRaceHorseData(data);
        const charaData = UMDatabaseWrapper.charas[trainedChara.charaId];

        // Get activated skills
        const skillEvents = analyticsSkillEvents.filter(event => event.param[0] === frameOrder);
        const activatedSkillIds = new Set(skillEvents.map(e => e.param[1]));
        const forcedActivatedSkillIds = new Set(
            forcedAnalyticsSkillEvents
                .filter(event => event.param[0] === frameOrder)
                .map(event => event.param[1]),
        );

        // Get all learned skills from the horse's skillset
        const learnedSkillIds = new Set(
            (trainedChara.skills ?? []).map(s => s.skillId)
        );

        const rawStrategy = data.running_style ?? trainedChara.rawData?.param?.runningStyle ?? 1;
        const strategy = rawStrategy === 1 && learnedSkillIds.has(RUNAWAY_TRIGGER_SKILL_ID) ? 5 : rawStrategy;

        // Get stats and motivation
        const speed = trainedChara.speed ?? data['speed'] ?? 0;
        const stamina = trainedChara.stamina ?? data['stamina'] ?? 0;
        const pow = trainedChara.pow ?? data['pow'] ?? 0;
        const guts = trainedChara.guts ?? data['guts'] ?? 0;
        const wiz = trainedChara.wiz ?? data['wiz'] ?? 300;
        const motivation = data['motivation'] ?? 3; // Default to Normal (3)
        const styleField = RUNNING_STYLE_TO_APTITUDE[Number(strategy)] ?? "proper_running_style_nige";

        // Calculate activation chance: max(100 - 9000/BaseWiz, 20)%
        // Mood multipliers: 5=Great(1.04), 4=Good(1.02), 3=Normal(1.0), 2=Bad(0.98), 1=Awful(0.96)
        const moodMultipliers: Record<number, number> = { 5: 1.04, 4: 1.02, 3: 1.0, 2: 0.98, 1: 0.96 };
        const moodMult = moodMultipliers[motivation] ?? 1.0;
        const baseWiz = wiz * moodMult;
        const activationChance = Math.max(100 - 9000 / baseWiz, 20) / 100; // As decimal 0-1

        const viewerId = data['viewer_id'];
        const cardIdForDeck = data['card_id'];
        const deck = (viewerId !== undefined && cardIdForDeck !== undefined
            ? race.deckByViewerAndCard.get(`${viewerId}:${cardIdForDeck}`)
            : undefined)
            ?? race.deckByTrainedCharaId.get(data['trained_chara_id'])
            ?? [];

        entries.push({
            raceId: race.id,
            frameOrder,
            finishOrder: (horseResult.finishOrder ?? 0) + 1,
            charaId: trainedChara.charaId,
            charaName: charaData?.name ?? `Unknown (${trainedChara.charaId})`,
            cardId: trainedChara.cardId,
            strategy: +strategy,
            rawStrategy: +rawStrategy,
            trainerName: data.trainer_name ?? data['trainer_name'] ?? 'Unknown',
            activatedSkillIds,
            forcedActivatedSkillIds,
            learnedSkillIds,
            finishTime: horseResult.finishTimeRaw ?? 0,
            raceDistance: race.raceDistance,
            careerWinCount: data['single_mode_win_count'] ?? 0,
            speed,
            stamina,
            pow,
            guts,
            wiz,
            rankScore: trainedChara.rankScore,
            scenarioId: Number.isFinite(Number(data.scenario_id ?? data.scenarioId))
                ? Number(data.scenario_id ?? data.scenarioId)
                : undefined,
            motivation,
            activationChance,
            isPlayer: race.playerIndices.has(frameOrder),
            teamId: data['team_id'] ?? 0,
            supportCardIds: deck.map(c => c.id),
            supportCardLimitBreaks: deck.map(c => c.lb),
            aptGround: aptGroundField ? (data[aptGroundField] ?? undefined) : undefined,
            aptDistance: aptDistanceField ? (data[aptDistanceField] ?? undefined) : undefined,
            aptStyle: data[styleField] ?? undefined,
        });
    });

    return entries;
}

function classifyAnalyticsSkillEvents(race: ParsedRace) {
    const skillEvents = race.raceData.event
        .map(eventWrapper => eventWrapper.event)
        .filter((event): event is RaceSimulateEventData =>
            event?.type === RaceSimulateEventData_SimulateEventType.SKILL
        );
    const goldRarity = UMDatabaseWrapper.skills[GOLD_SKILL_RARITY_REFERENCE_ID]?.rarity;
    if (goldRarity === undefined) {
        return { naturalEvents: skillEvents, forcedEvents: [] as RaceSimulateEventData[] };
    }

    const triggerTimesByHorse = new Map<number, number[]>();
    for (const event of skillEvents) {
        if (!FORCED_GOLD_TRIGGER_SKILL_IDS.has(event.param[1])) continue;
        const horseFrameOrder = event.param[0];
        const triggerTimes = triggerTimesByHorse.get(horseFrameOrder) ?? [];
        triggerTimes.push(event.frameTime ?? 0);
        triggerTimesByHorse.set(horseFrameOrder, triggerTimes);
    }

    if (triggerTimesByHorse.size === 0) {
        return { naturalEvents: skillEvents, forcedEvents: [] as RaceSimulateEventData[] };
    }

    const naturalEvents: RaceSimulateEventData[] = [];
    const forcedEvents: RaceSimulateEventData[] = [];
    skillEvents.forEach(event => {
        const skillId = event.param[1];
        if (FORCED_GOLD_TRIGGER_SKILL_IDS.has(skillId) || UMDatabaseWrapper.skills[skillId]?.rarity !== goldRarity) {
            naturalEvents.push(event);
            return;
        }

        const activationTime = event.frameTime ?? 0;
        const wasForced = (triggerTimesByHorse.get(event.param[0]) ?? []).some(triggerTime => {
            const delta = activationTime - triggerTime;
            return delta > 0 && delta < FORCED_GOLD_ACTIVATION_WINDOW_SECONDS;
        });
        (wasForced ? forcedEvents : naturalEvents).push(event);
    });

    return { naturalEvents, forcedEvents };
}

function extractSkillActivationPoints(
    race: ParsedRace,
    skillEvents: RaceSimulateEventData[],
): Map<number, SkillActivationPoint[]> {
    const activations = new Map<number, SkillActivationPoint[]>();

    // Pre-build a lookup for frame times to distances per horse
    // This lets us quickly find the distance at any given time for any horse
    const frameData = race.raceData.frame ?? [];

    const distanceAtTime = (frameOrder: number, activationTime: number): number => {
        if (frameData.length === 0) return 0;

        let previous = frameData[0];
        if ((previous.time ?? 0) >= activationTime) {
            return previous.horseFrame?.[frameOrder]?.distance ?? 0;
        }

        for (let i = 1; i < frameData.length; i++) {
            const next = frameData[i];
            const nextTime = next.time ?? 0;
            if (nextTime < activationTime) {
                previous = next;
                continue;
            }

            const previousHorse = previous.horseFrame?.[frameOrder];
            const nextHorse = next.horseFrame?.[frameOrder];
            if (!previousHorse || !nextHorse) return previousHorse?.distance ?? nextHorse?.distance ?? 0;

            const previousTime = previous.time ?? nextTime;
            const span = nextTime - previousTime;
            const ratio = span > 0
                ? Math.max(0, Math.min(1, (activationTime - previousTime) / span))
                : 0;
            return (previousHorse.distance ?? 0) + ((nextHorse.distance ?? 0) - (previousHorse.distance ?? 0)) * ratio;
        }

        return frameData[frameData.length - 1].horseFrame?.[frameOrder]?.distance ?? 0;
    };

    // Pre-compute activation chances for each horse in this race
    const horseActivationChances = new Map<number, number>();
    race.horseInfo.forEach((data, frameOrder) => {
        if (!data) return;
        const wiz = data['wiz'] ?? 300;
        const motivation = data['motivation'] ?? 3;
        const moodMultipliers: Record<number, number> = { 5: 1.04, 4: 1.02, 3: 1.0, 2: 0.98, 1: 0.96 };
        const moodMult = moodMultipliers[motivation] ?? 1.0;
        const baseWiz = wiz * moodMult;
        const activationChance = Math.max(100 - 9000 / baseWiz, 20) / 100;
        horseActivationChances.set(frameOrder, activationChance);
    });

    skillEvents.forEach(event => {
        const frameOrder = event.param[0];
        const skillId = event.param[1];
        const activationTime = event.frameTime ?? 0;

        const horseResult = race.raceData.horseResult[frameOrder];
        const finishOrder = horseResult ? (horseResult.finishOrder ?? 99) + 1 : 99;

        const point: SkillActivationPoint = {
            raceId: race.id,
            horseFrameOrder: frameOrder,
            distance: distanceAtTime(frameOrder, activationTime),
            time: activationTime,
            finishOrder,
            activationChance: horseActivationChances.get(frameOrder) ?? 0.2,
        };

        if (!activations.has(skillId)) {
            activations.set(skillId, []);
        }
        activations.get(skillId)!.push(point);
    });

    return activations;
}

export function extractSkillActivationData(race: ParsedRace): {
    natural: Map<number, SkillActivationPoint[]>;
    forced: Map<number, SkillActivationPoint[]>;
} {
    const { naturalEvents, forcedEvents } = classifyAnalyticsSkillEvents(race);
    return {
        natural: extractSkillActivationPoints(race, naturalEvents),
        forced: extractSkillActivationPoints(race, forcedEvents),
    };
}

export function extractSkillActivations(race: ParsedRace): Map<number, SkillActivationPoint[]> {
    return extractSkillActivationData(race).natural;
}

export function makeHorseBuildKey(horse: Pick<HorseEntry,
    "cardId" | "strategy" | "speed" | "stamina" | "pow" | "guts" | "wiz" | "rankScore" |
    "learnedSkillIds" | "supportCardIds" | "supportCardLimitBreaks"
>): string {
    const learnedSkillIds = Array.from(horse.learnedSkillIds).sort((a, b) => a - b).join(",");
    const supportCards = horse.supportCardIds
        .map((id, index) => `${id}:${horse.supportCardLimitBreaks[index] ?? 0}`)
        .sort()
        .join(",");
    const strategy = effectiveStrategyForHorse(horse);
    return [
        horse.cardId,
        strategy,
        horse.speed,
        horse.stamina,
        horse.pow,
        horse.guts,
        horse.wiz,
        horse.rankScore,
        learnedSkillIds,
        supportCards,
    ].join("|");
}

export function makeBuiltTeamKey(horses: Pick<HorseEntry,
    "cardId" | "strategy" | "speed" | "stamina" | "pow" | "guts" | "wiz" | "rankScore" |
    "learnedSkillIds" | "supportCardIds" | "supportCardLimitBreaks"
>[]): string {
    return horses
        .map(makeHorseBuildKey)
        .sort()
        .join("__");
}


function computeTeamStats(allHorses: HorseEntry[]): TeamCompositionStats[] {
    // Group horses by race
    const raceMap = new Map<string, HorseEntry[]>();
    for (const h of allHorses) {
        if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, []);
        raceMap.get(h.raceId)!.push(h);
    }

    const compMap = new Map<string, {
        buildKey: string;
        members: { charaId: number; cardId: number; strategy: number; charaName: string }[];
        memberWins: number[];
        appearances: number;
        wins: number;
        expectedWins: number;
    }>();

    for (const horses of raceMap.values()) {
        // Group by teamId, skip unassigned (0)
        const teamMap = new Map<number, HorseEntry[]>();
        for (const h of horses) {
            if (h.teamId === 0) continue;
            if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, []);
            teamMap.get(h.teamId)!.push(h);
        }

        const teams = Array.from(teamMap.values());
        // Require at least 2 teams, all with exactly 3 members
        if (teams.length < 2 || teams.some(t => t.length !== 3)) continue;

        const numTeams = teams.length;
        const expectedWinPerTeam = 1 / numTeams;

        // Winning team = the team whose member finished 1st
        const winningTeam = teams.find(team => team.some(h => h.finishOrder === 1)) ?? null;

        for (const team of teams) {
            // Sort by (cardId * 10 + strategy) — same canonical ordering as pairSynergy
            const sorted = [...team]
                .map((horse) => ({ ...horse, strategy: effectiveStrategyForHorse(horse) }))
                .sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));
            const key = makeBuiltTeamKey(sorted);

            if (!compMap.has(key)) {
                compMap.set(key, {
                    buildKey: key,
                    members: sorted.map(h => ({ charaId: h.charaId, cardId: h.cardId, strategy: h.strategy, charaName: h.charaName })),
                    memberWins: new Array(sorted.length).fill(0),
                    appearances: 0,
                    wins: 0,
                    expectedWins: 0,
                });
            }
            const entry = compMap.get(key)!;
            entry.appearances++;
            entry.expectedWins += expectedWinPerTeam;
            if (winningTeam && team === winningTeam) {
                entry.wins++;
                // Credit the member that actually finished 1st
                for (let si = 0; si < sorted.length; si++) {
                    if (sorted[si].finishOrder === 1) {
                        entry.memberWins[si]++;
                        break;
                    }
                }
            }
        }
    }

    return Array.from(compMap.values())
        .map(e => ({
            ...e,
            winRate: e.wins / e.appearances,
            impact: e.expectedWins > 0 ? e.wins / e.expectedWins : 0,
            bayesianWinRate: (e.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (e.appearances + BAYES_TEAM.K),
            memberWins: e.memberWins,
        }))
        .sort((a, b) => b.appearances - a.appearances);
}

function computePairSynergy(allHorses: HorseEntry[]): PairSynergyStats[] {
    // Group by race → team, tracking whether the team produced the race winner
    const raceMap = new Map<string, Map<number, { horses: HorseEntry[]; teamWon: boolean }>>();

    for (const h of allHorses) {
        if (h.teamId <= 0) continue;
        if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, new Map());
        const teamMap = raceMap.get(h.raceId)!;
        if (!teamMap.has(h.teamId)) teamMap.set(h.teamId, { horses: [], teamWon: false });
        const team = teamMap.get(h.teamId)!;
        team.horses.push(h);
        if (h.finishOrder === 1) team.teamWon = true;
    }

    // Accumulate pairwise co-appearances keyed by (cardId, strategy) pairs.
    // Each (cardId, strategy) is a distinct entity — same card in different running styles are separate.
    type PairEntry = { cardId_x: number; strategy_x: number; charaId_x: number; cardId_y: number; strategy_y: number; charaId_y: number; coApps: number; teamWins: number; winsX: number; winsY: number };
    const pairMap = new Map<string, PairEntry>();

    for (const teamMap of raceMap.values()) {
        for (const { horses, teamWon } of teamMap.values()) {
            for (let i = 0; i < horses.length; i++) {
                for (let j = i + 1; j < horses.length; j++) {
                    const a = horses[i], b = horses[j];
                    // Skip identical (cardId, strategy) entities
                    if (a.cardId === b.cardId && a.strategy === b.strategy) continue;
                    // Canonical ordering: lower (cardId * 10 + strategy) is X
                    const [x, y] = (a.cardId * 10 + a.strategy) <= (b.cardId * 10 + b.strategy) ? [a, b] : [b, a];
                    const key = `${x.cardId}_${x.strategy}__${y.cardId}_${y.strategy}`;
                    if (!pairMap.has(key))
                        pairMap.set(key, { cardId_x: x.cardId, strategy_x: x.strategy, charaId_x: x.charaId, cardId_y: y.cardId, strategy_y: y.strategy, charaId_y: y.charaId, coApps: 0, teamWins: 0, winsX: 0, winsY: 0 });
                    const p = pairMap.get(key)!;
                    p.coApps++;
                    if (teamWon) {
                        p.teamWins++;
                        if (x.finishOrder === 1) p.winsX++;
                        else if (y.finishOrder === 1) p.winsY++;
                    }
                }
            }
        }
    }

    return Array.from(pairMap.values()).filter(p => p.coApps >= 3);
}

function matchesSkillBase(skillId: number, baseIds: Set<number>) {
    return baseIds.has(Math.floor(skillId / 10));
}

function setHasMatchingSkillBase(skillIds: Set<number>, baseIds: Set<number>) {
    for (const skillId of skillIds) {
        if (matchesSkillBase(skillId, baseIds)) return true;
    }
    return false;
}

function buildGateWinRatesForFlavor(allHorses: HorseEntry[], strategyFilter: Set<number> | null) {
    const gateStatsMap = new Map<number, { appearances: number; wins: number }>();
    for (const horse of allHorses) {
        if (strategyFilter && !strategyFilter.has(horse.strategy)) continue;
        const gateNumber = horse.frameOrder + 1;
        if (!gateStatsMap.has(gateNumber)) {
            gateStatsMap.set(gateNumber, { appearances: 0, wins: 0 });
        }
        const gateStats = gateStatsMap.get(gateNumber)!;
        gateStats.appearances++;
        if (horse.finishOrder === 1) {
            gateStats.wins++;
        }
    }
    return Array.from(gateStatsMap.entries())
        .map(([gateNumber, stats]) => ({
            gateNumber,
            appearances: stats.appearances,
            wins: stats.wins,
            winRate: stats.appearances > 0 ? stats.wins / stats.appearances : 0,
        }))
        .sort((a, b) => a.gateNumber - b.gateNumber);
}

function buildBlockedHorseLookup(races: ParsedRace[]) {
    const blockedHorseKeys = new Set<string>();
    for (const race of races) {
        for (const frame of race.raceData.frame ?? []) {
            frame.horseFrame?.forEach((horseFrame, index) => {
                if ((horseFrame?.blockFrontHorseIndex ?? -1) !== -1) {
                    blockedHorseKeys.add(`${race.id}_${index}`);
                }
            });
        }
    }
    return blockedHorseKeys;
}

function buildBlockedGateStats(
    allHorses: HorseEntry[],
    blockedHorseKeys: Set<string>,
    strategyFilter: Set<number> | null
): GateBlockedStats[] {
    const gateStatsMap = new Map<number, { appearances: number; blockedCount: number; blockedWins: number }>();
    for (const horse of allHorses) {
        if (strategyFilter && !strategyFilter.has(horse.strategy)) continue;
        const gateNumber = horse.frameOrder + 1;
        if (!gateStatsMap.has(gateNumber)) {
            gateStatsMap.set(gateNumber, { appearances: 0, blockedCount: 0, blockedWins: 0 });
        }
        const gateStats = gateStatsMap.get(gateNumber)!;
        gateStats.appearances++;
        if (!blockedHorseKeys.has(`${horse.raceId}_${horse.frameOrder}`)) continue;
        gateStats.blockedCount++;
        if (horse.finishOrder === 1) {
            gateStats.blockedWins++;
        }
    }

    return Array.from(gateStatsMap.entries())
        .map(([gateNumber, stats]) => ({
            gateNumber,
            appearances: stats.appearances,
            blockedCount: stats.blockedCount,
            blockedWins: stats.blockedWins,
            blockedRate: stats.appearances > 0 ? stats.blockedCount / stats.appearances : 0,
            winRateAfterBlock: stats.blockedCount > 0 ? stats.blockedWins / stats.blockedCount : 0,
        }))
        .sort((a, b) => a.gateNumber - b.gateNumber);
}

function buildDodgingDangerGateStats(allHorses: HorseEntry[]): GateSkillActivationStats[] {
    const gateStatsMap = new Map<number, { opportunities: number; activations: number; activationWins: number }>();
    for (const horse of allHorses) {
        if (!GATE_FLAVOR_TO_STRATEGIES.front.has(horse.strategy)) continue;

        const gateNumber = horse.frameOrder + 1;
        if (!gateStatsMap.has(gateNumber)) {
            gateStatsMap.set(gateNumber, { opportunities: 0, activations: 0, activationWins: 0 });
        }
        const gateStats = gateStatsMap.get(gateNumber)!;

        const learnedDodgingDanger = setHasMatchingSkillBase(horse.learnedSkillIds, DODGING_DANGER_SKILL_BASE_IDS);
        if (!learnedDodgingDanger) continue;

        gateStats.opportunities++;
        const activatedDodgingDanger = setHasMatchingSkillBase(horse.activatedSkillIds, DODGING_DANGER_SKILL_BASE_IDS);
        if (!activatedDodgingDanger) continue;

        gateStats.activations++;
        if (horse.finishOrder === 1) {
            gateStats.activationWins++;
        }
    }

    return Array.from(gateStatsMap.entries())
        .map(([gateNumber, stats]) => ({
            gateNumber,
            opportunities: stats.opportunities,
            activations: stats.activations,
            activationWins: stats.activationWins,
            activationRate: stats.opportunities > 0 ? stats.activations / stats.opportunities : 0,
            winRateAfterActivation: stats.activations > 0 ? stats.activationWins / stats.activations : 0,
        }))
        .sort((a, b) => a.gateNumber - b.gateNumber);
}

function summarizeDistances(distances: number[]) {
    if (distances.length === 0) {
        return {
            meanDistance: 0,
            medianDistance: 0,
            sortedDistances: [] as number[],
        };
    }

    const sortedDistances = [...distances].sort((a, b) => a - b);
    const meanDistance = sortedDistances.reduce((sum, distance) => sum + distance, 0) / sortedDistances.length;
    const mid = Math.floor(sortedDistances.length / 2);
    const medianDistance = sortedDistances.length % 2 !== 0
        ? sortedDistances[mid]
        : (sortedDistances[mid - 1] + sortedDistances[mid]) / 2;

    return {
        meanDistance,
        medianDistance,
        sortedDistances,
    };
}

export function aggregateStats(races: ParsedRace[], options?: { releaseProcessedRaceData?: boolean }): AggregatedStats {
    const allHorses: HorseEntry[] = [];
    const allSkillActivations = new Map<number, SkillActivationPoint[]>();
    const horseStrategyByKey = new Map<string, number>();
    const releaseProcessedRaceData = options?.releaseProcessedRaceData ?? false;

    // Collect all horse entries and skill activations
    races.forEach(race => {
        const horses = extractHorseEntries(race);
        horses.forEach((horse) => {
            allHorses.push(horse);
            horseStrategyByKey.set(`${horse.raceId}_${horse.frameOrder}`, effectiveStrategyForHorse(horse));
        });

        const skillActs = extractSkillActivations(race);
        skillActs.forEach((points, skillId) => {
            if (!allSkillActivations.has(skillId)) {
                allSkillActivations.set(skillId, []);
            }
            points.forEach((point) => allSkillActivations.get(skillId)!.push(point));
        });

        if (releaseProcessedRaceData) {
            race.raceData.frame = [];
            race.raceData.event = [];
            race.raceData.horseResult = [];
        }
    });

    // Character stats
    const charaMap = new Map<number, {
        charaName: string;
        races: number;
        wins: number;
        top3: number;
        totalPosition: number;
        totalTime: number;
    }>();

    allHorses.forEach(horse => {
        if (!charaMap.has(horse.charaId)) {
            charaMap.set(horse.charaId, {
                charaName: horse.charaName,
                races: 0,
                wins: 0,
                top3: 0,
                totalPosition: 0,
                totalTime: 0,
            });
        }
        const stats = charaMap.get(horse.charaId)!;
        stats.races++;
        if (horse.finishOrder === 1) stats.wins++;
        if (horse.finishOrder <= 3) stats.top3++;
        stats.totalPosition += horse.finishOrder;
        stats.totalTime += horse.finishTime;
    });

    const characterStats: CharacterStats[] = Array.from(charaMap.entries()).map(([charaId, s]) => ({
        charaId,
        charaName: s.charaName,
        totalRaces: s.races,
        wins: s.wins,
        top3Finishes: s.top3,
        avgFinishPosition: s.totalPosition / s.races,
        avgFinishTime: s.totalTime / s.races,
    }));

    // Strategy stats
    const stratMap = new Map<number, {
        races: number;
        wins: number;
        top3: number;
        totalPosition: number;
        winnersByChara: Map<number, { charaName: string; wins: number }>;
    }>();

    const rawStrategyTotals: Record<number, number> = {};
    allHorses.forEach(horse => {
        if (isDebufferHorse(horse)) return;
        rawStrategyTotals[horse.strategy] = (rawStrategyTotals[horse.strategy] ?? 0) + 1;
    });

    allHorses.forEach(horse => {
        if (isDebufferHorse(horse)) return;
        if (!stratMap.has(horse.strategy)) {
            stratMap.set(horse.strategy, {
                races: 0,
                wins: 0,
                top3: 0,
                totalPosition: 0,
                winnersByChara: new Map(),
            });
        }
        const stats = stratMap.get(horse.strategy)!;
        stats.races++;
        if (horse.finishOrder === 1) {
            stats.wins++;
            // Track winning character
            if (!stats.winnersByChara.has(horse.charaId)) {
                stats.winnersByChara.set(horse.charaId, { charaName: horse.charaName, wins: 0 });
            }
            stats.winnersByChara.get(horse.charaId)!.wins++;
        }
        if (horse.finishOrder <= 3) stats.top3++;
        stats.totalPosition += horse.finishOrder;
    });

    // Saturation: per-strategy win rate bucketed by how many of that strategy appear in a room
    const raceHorsesByRace = new Map<string, HorseEntry[]>();
    for (const h of allHorses) {
        if (!raceHorsesByRace.has(h.raceId)) raceHorsesByRace.set(h.raceId, []);
        raceHorsesByRace.get(h.raceId)!.push(h);
    }
    const saturationBuckets = new Map<number, Map<number, { raceCount: number; wins: number }>>();
    const crossSatBuckets = new Map<number, Map<number, Map<number, { raceCount: number; wins: number; subjectCount: number }>>>();
    for (const horses of raceHorsesByRace.values()) {
        const stratInRace = new Map<number, { count: number; hasWinner: boolean }>();
        for (const h of horses) {
            if (isDebufferHorse(h)) continue;
            if (!stratInRace.has(h.strategy)) stratInRace.set(h.strategy, { count: 0, hasWinner: false });
            const e = stratInRace.get(h.strategy)!;
            e.count++;
            if (h.finishOrder === 1) e.hasWinner = true;
        }
        for (const [strategy, { count, hasWinner }] of stratInRace.entries()) {
            if (!saturationBuckets.has(strategy)) saturationBuckets.set(strategy, new Map());
            const buckets = saturationBuckets.get(strategy)!;
            if (!buckets.has(count)) buckets.set(count, { raceCount: 0, wins: 0 });
            const b = buckets.get(count)!;
            b.raceCount++;
            if (hasWinner) b.wins++;
        }
        for (const [subjectStrat, subjectInfo] of stratInRace.entries()) {
            if (!crossSatBuckets.has(subjectStrat)) crossSatBuckets.set(subjectStrat, new Map());
            const byOppressor = crossSatBuckets.get(subjectStrat)!;
            for (const oppStrat of ALL_STRATEGY_IDS) {
                if (!byOppressor.has(oppStrat)) byOppressor.set(oppStrat, new Map());
                const byCount = byOppressor.get(oppStrat)!;
                const oppCount = stratInRace.get(oppStrat)?.count ?? 0;
                const bucket = byCount.get(oppCount) ?? { raceCount: 0, wins: 0, subjectCount: 0 };
                bucket.raceCount++;
                if (subjectInfo.hasWinner) bucket.wins++;
                bucket.subjectCount += subjectInfo.count;
                byCount.set(oppCount, bucket);
            }
        }
    }

    const strategyStats: StrategyStats[] = Array.from(stratMap.entries()).map(([strategy, s]) => ({
        strategy,
        strategyName: STRATEGY_NAMES[strategy] || `Strategy ${strategy}`,
        totalRaces: s.races,
        wins: s.wins,
        top3Finishes: s.top3,
        avgFinishPosition: s.totalPosition / s.races,
        winningCharacters: Array.from(s.winnersByChara.entries())
            .map(([charaId, data]) => ({ charaId, charaName: data.charaName, wins: data.wins }))
            .sort((a, b) => b.wins - a.wins),
        saturation: Array.from((saturationBuckets.get(strategy) ?? new Map()).entries())
            .map(([count, { raceCount, wins }]) => ({ count, raceCount, wins }))
            .sort((a, b) => a.count - b.count),
        crossSaturation: Object.fromEntries(
            Array.from((crossSatBuckets.get(strategy) ?? new Map()).entries()).map(([oppStrat, byCount]) => [
                oppStrat,
                Array.from(byCount.entries() as Iterable<[number, { count?: number; raceCount: number; wins: number; subjectCount: number }]>)
                    .map(([count, d]) => ({ count, ...d }))
                    .sort((a, b) => a.count - b.count),
            ])
        ),
    }));

    // Skill stats
    const skillStats = new Map<number, SkillStats>();
    const mergedSkillActivations = new Map<number, SkillActivationPoint[]>();

    // Collect all skill IDs that appear in either activations or learned lists
    const uniqueSkillIds = new Set<number>();
    allSkillActivations.forEach((_, id) => uniqueSkillIds.add(id));
    allHorses.forEach(h => h.learnedSkillIds.forEach(id => uniqueSkillIds.add(id)));

    // Group skills by their base ID (prefix) to combine ranks.
    const skillGroups = new Map<number, number[]>();
    uniqueSkillIds.forEach(id => {
        const baseId = Math.floor(id / 10);
        if (!skillGroups.has(baseId)) skillGroups.set(baseId, []);
        skillGroups.get(baseId)!.push(id);
    });

    // Merge inherited unique skill groups into their non-inherited counterparts.
    // Inherited unique skills are 9xxxxx (baseId 90000-99999); non-inherited are 1xxxxx (baseId 10000-19999).
    // The baseId offset is exactly 80000 (e.g. floor(901001/10)=90100, floor(101001/10)=10100).
    const inheritedGroupsToRemove: number[] = [];
    skillGroups.forEach((ids, baseId) => {
        if (baseId < 90000 || baseId >= 100000) return;
        const counterpartBaseId = baseId - 80000;
        if (!skillGroups.has(counterpartBaseId)) return;
        ids.forEach((id) => skillGroups.get(counterpartBaseId)!.push(id));
        inheritedGroupsToRemove.push(baseId);
    });
    inheritedGroupsToRemove.forEach(baseId => skillGroups.delete(baseId));

    skillGroups.forEach((groupSkillIds) => {
        // Aggregate activations for all skills in the group
        const groupPoints: SkillActivationPoint[] = [];
        groupSkillIds.forEach(id => {
            const points = allSkillActivations.get(id);
            if (points) {
                points.forEach((point) => groupPoints.push(point));
            }
        });

        // Filter out skills that never activated (matching original behavior)
        if (groupPoints.length === 0) return;

        // Determine representative ID (prefer non-inherited, then highest rarity, then highest ID).
        // Also collect all unique names; inherited variants are labelled "(Inherit)".
        let representativeId = groupSkillIds[0];
        let maxRarity = -1;
        const distinctNames = new Map<string, number>(); // Name -> Rarity

        groupSkillIds.forEach(id => {
            const data = UMDatabaseWrapper.skills[id];
            const rarity = data?.rarity ?? 0;
            const isInherited = id >= 900000 && id < 1000000;
            const repIsInherited = representativeId >= 900000 && representativeId < 1000000;

            // Non-inherited always beats inherited; within same category pick by rarity then id
            if (!isInherited && repIsInherited) {
                representativeId = id;
                maxRarity = rarity;
            } else if (isInherited === repIsInherited) {
                if (rarity > maxRarity || (rarity === maxRarity && id > representativeId)) {
                    maxRarity = rarity;
                    representativeId = id;
                }
            }

            const fallbackName = UMDatabaseWrapper.skillNameWithEnglishFallback(id);
            const name = isInherited ? `${fallbackName} (Inherit)` : fallbackName;
            if (!distinctNames.has(name) || rarity > distinctNames.get(name)!) {
                distinctNames.set(name, rarity);
            }
        });

        // Sort names by rarity descending (Gold first)
        const skillNames = Array.from(distinctNames.entries())
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0]);

        const skillName = UMDatabaseWrapper.skillNameWithEnglishFallback(representativeId);

        const uniqueRaces = new Set(groupPoints.map(p => p.raceId)).size;
        const uniqueHorses = new Set(groupPoints.map(p => `${p.raceId}_${p.horseFrameOrder}`)).size;
        const uniqueHorsesByStrategy = groupPoints.reduce<Record<string, Set<string>>>((acc, point) => {
            const horseKey = `${point.raceId}_${point.horseFrameOrder}`;
            const strategy = horseStrategyByKey.get(horseKey);
            if (strategy === undefined) return acc;
            const strategyKey = String(strategy);
            (acc[strategyKey] ??= new Set<string>()).add(horseKey);
            return acc;
        }, {});

        // Find horses that used any skill in this group
        const horsesWithSkill = allHorses.filter(h =>
            groupSkillIds.some(id => h.activatedSkillIds.has(id))
        );
        const winsWithSkill = horsesWithSkill.filter(h => h.finishOrder === 1).length;
        const winRate = horsesWithSkill.length > 0 ? (winsWithSkill / horsesWithSkill.length) * 100 : 0;

        // Count how many horses learned any skill in this group
        const horsesWhoLearned = allHorses.filter(h =>
            groupSkillIds.some(id => h.learnedSkillIds.has(id))
        );
        const learnedByHorses = horsesWhoLearned.length;
        const forcedOnlyHorses = horsesWhoLearned.filter(h => {
            const naturallyActivated = groupSkillIds.some(id => h.activatedSkillIds.has(id));
            const forceActivated = groupSkillIds.some(id => h.forcedActivatedSkillIds?.has(id));
            return forceActivated && !naturallyActivated;
        });
        const forcedActivationHorses = forcedOnlyHorses.length;
        const activationOpportunities = Math.max(0, learnedByHorses - forcedActivationHorses);

        const learnedByCharaIds = new Set(horsesWhoLearned.map(h => h.charaId));
        const learnedByStrategies = new Set(horsesWhoLearned.map(h => effectiveStrategyForHorse(h)));
        const learnedByHorsesByStrategy = horsesWhoLearned.reduce<Record<string, number>>((acc, horse) => {
            const key = String(effectiveStrategyForHorse(horse));
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});
        const forcedActivationHorsesByStrategy = forcedOnlyHorses.reduce<Record<string, number>>((acc, horse) => {
            const key = String(effectiveStrategyForHorse(horse));
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});
        const activationOpportunitiesByStrategy = Object.fromEntries(
            Object.entries(learnedByHorsesByStrategy).map(([strategyKey, learned]) => [
                strategyKey,
                Math.max(0, learned - (forcedActivationHorsesByStrategy[strategyKey] ?? 0)),
            ]),
        );

        // Check metadata on representative ID
        const isUnique = representativeId >= 100000 && representativeId < 200000;
        const detailedSkillData = UMDatabaseWrapper.skills[representativeId];
        const isPassive = detailedSkillData?.conditionGroups?.some(group =>
            group.effects?.some(effect => [1, 2, 3, 4, 5].includes(effect.type))
        );
        const isGuaranteed = isUnique || isPassive;

        // Normalized Activations Logic (with deduplication)
        const uniqueParticipations = new Map<string, SkillActivationPoint>();
        groupPoints.forEach(p => {
            const key = `${p.raceId}_${p.horseFrameOrder}`;
            if (!uniqueParticipations.has(key)) {
                uniqueParticipations.set(key, p);
            }
        });

        const normalizedActivations = isGuaranteed
            ? uniqueParticipations.size
            : Array.from(uniqueParticipations.values()).reduce((sum, p) => {
                return sum + (1 / p.activationChance);
            }, 0);

        const avgPosition = horsesWithSkill.length > 0
            ? horsesWithSkill.reduce((sum, h) => sum + h.finishOrder, 0) / horsesWithSkill.length
            : 0;

        const { meanDistance, medianDistance, sortedDistances: distances } = summarizeDistances(groupPoints.map(p => p.distance));
        const distancesByStrategy = groupPoints.reduce<Record<string, number[]>>((acc, point) => {
            const strategy = horseStrategyByKey.get(`${point.raceId}_${point.horseFrameOrder}`);
            if (strategy === undefined) return acc;
            const strategyKey = String(strategy);
            (acc[strategyKey] ??= []).push(point.distance);
            return acc;
        }, {});
        const meanDistanceByStrategy: Record<string, number> = {};
        const medianDistanceByStrategy: Record<string, number> = {};
        Object.entries(distancesByStrategy).forEach(([strategyKey, strategyDistances]) => {
            const strategySummary = summarizeDistances(strategyDistances);
            meanDistanceByStrategy[strategyKey] = strategySummary.meanDistance;
            medianDistanceByStrategy[strategyKey] = strategySummary.medianDistance;
        });

        skillStats.set(representativeId, {
            skillId: representativeId,
            skillName,
            skillNames,
            timesActivated: groupPoints.length,
            normalizedActivations,
            uniqueRaces,
            uniqueHorses,
            learnedByHorses,
            activationOpportunities,
            forcedActivationHorses,
            winRate,
            avgFinishPosition: avgPosition,
            activationDistances: distances, // Already sorted
            learnedByCharaIds,
            learnedByStrategies,
            learnedByHorsesByStrategy,
            uniqueHorsesByStrategy: Object.fromEntries(
                Object.entries(uniqueHorsesByStrategy).map(([strategyKey, horseKeys]) => [strategyKey, horseKeys.size])
            ),
            activationOpportunitiesByStrategy,
            forcedActivationHorsesByStrategy,
            meanDistance,
            medianDistance,
            meanDistanceByStrategy,
            medianDistanceByStrategy,
        });

        mergedSkillActivations.set(representativeId, groupPoints);
    });

    // Total statistics
    const totalRaces = races.length;
    const totalHorses = allHorses.length;

    // Room composition frequencies
    const raceStratCounts = new Map<string, number[]>();
    for (const h of allHorses) {
        if (!raceStratCounts.has(h.raceId)) raceStratCounts.set(h.raceId, new Array(ROOM_COMPOSITION_STRATEGY_IDS.length).fill(0));
        const c = raceStratCounts.get(h.raceId)!;
        const strategyIdx = ROOM_COMPOSITION_STRATEGY_IDS.indexOf(effectiveStrategyForHorse(h));
        if (strategyIdx >= 0) c[strategyIdx]++;
    }
    const compFreqMap = new Map<string, { counts: number[]; occurrences: number }>();
    for (const counts of raceStratCounts.values()) {
        const key = counts.join('_');
        if (!compFreqMap.has(key)) compFreqMap.set(key, { counts: [...counts], occurrences: 0 });
        compFreqMap.get(key)!.occurrences++;
    }
    const roomCompositions = Array.from(compFreqMap.values())
        .sort((a, b) => b.occurrences - a.occurrences)
        .map(e => ({ counts: e.counts, occurrences: e.occurrences, rate: e.occurrences / (totalRaces || 1) }));

    // Use official track distance if available, otherwise fall back to calculated distance
    const avgRaceDistance = races.length > 0
        ? races.reduce((sum, r) => {
            const trackDist = getTrackDistance(r.detectedCourseId);
            return sum + (trackDist ?? r.raceDistance);
        }, 0) / races.length
        : 0;
    const blockedHorseKeys = buildBlockedHorseLookup(races);
    const gateStats = {
        winRatesByFlavor: {
            total: buildGateWinRatesForFlavor(allHorses, GATE_FLAVOR_TO_STRATEGIES.total),
            front: buildGateWinRatesForFlavor(allHorses, GATE_FLAVOR_TO_STRATEGIES.front),
            pace: buildGateWinRatesForFlavor(allHorses, GATE_FLAVOR_TO_STRATEGIES.pace),
            late: buildGateWinRatesForFlavor(allHorses, GATE_FLAVOR_TO_STRATEGIES.late),
            end: buildGateWinRatesForFlavor(allHorses, GATE_FLAVOR_TO_STRATEGIES.end),
        },
        blockedRatesByFlavor: {
            total: buildBlockedGateStats(allHorses, blockedHorseKeys, GATE_FLAVOR_TO_STRATEGIES.total),
            front: buildBlockedGateStats(allHorses, blockedHorseKeys, GATE_FLAVOR_TO_STRATEGIES.front),
            pace: buildBlockedGateStats(allHorses, blockedHorseKeys, GATE_FLAVOR_TO_STRATEGIES.pace),
            late: buildBlockedGateStats(allHorses, blockedHorseKeys, GATE_FLAVOR_TO_STRATEGIES.late),
            end: buildBlockedGateStats(allHorses, blockedHorseKeys, GATE_FLAVOR_TO_STRATEGIES.end),
        },
        dodgingDangerRates: buildDodgingDangerGateStats(allHorses),
    };

    return {
        totalRaces,
        totalHorses,
        avgRaceDistance,
        characterStats,
        strategyStats,
        rawStrategyTotals,
        roomCompositions,
        skillStats,
        skillActivations: mergedSkillActivations,
        allHorses,
        teamStats: computeTeamStats(allHorses),
        pairSynergy: computePairSynergy(allHorses),
        gateStats,
    };
}

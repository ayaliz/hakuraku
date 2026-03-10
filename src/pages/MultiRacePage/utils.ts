import { RaceSimulateData, RaceSimulateEventData_SimulateEventType } from "../../data/race_data_pb";
import { deserializeFromBase64 } from "../../data/RaceDataParser";
import { fromRaceHorseData } from "../../data/TrainedCharaData";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import GameDataLoader from "../../data/GameDataLoader";
import {
    AggregatedStats,
    CharacterStats,
    HorseEntry,
    PairSynergyStats,
    ParsedRace,
    SkillActivationPoint,
    SkillStats,
    StrategyStats,
    TeamCompositionStats,
} from "./types";
import { BAYES_TEAM, STRATEGY_DISPLAY_ORDER } from "./components/WinDistributionCharts/constants";

const STRATEGY_NAMES: Record<number, string> = {
    1: "Front Runner",
    2: "Pace Chaser",
    3: "Late Surger",
    4: "End Closer",
    5: "Runaway",
};
const RUNAWAY_TRIGGER_SKILL_ID = 202051;
const ALL_STRATEGY_IDS: number[] = [...STRATEGY_DISPLAY_ORDER];
const GATE_FLAVOR_TO_STRATEGIES = {
    total: null,
    front: new Set([1, 5]),
    pace: new Set([2]),
    late: new Set([3]),
    end: new Set([4]),
} as const;

// Map for detailed skill data (condition_groups) logic - imported from skills.json
let _skillsJsonMap: Map<number, any> | null = null;
function getSkillsJsonMap() {
    if (!_skillsJsonMap) {
        _skillsJsonMap = new Map((GameDataLoader.skills as any[]).map(s => [s.id, s]));
    }
    return _skillsJsonMap;
}

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

function calculateRaceDistance(raceData: RaceSimulateData): number {
    let maxDist = 0;
    for (const frame of raceData.frame ?? []) {
        for (const hf of frame.horseFrame ?? []) {
            if (hf.distance && hf.distance > maxDist) {
                maxDist = hf.distance;
            }
        }
    }
    return Math.round(maxDist / 100) * 100;
}

export function parseRaceJson(json: any, fileName: string): ParsedRace | { error: string } {
    const id = `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // CHECK FOR NEW FORMAT
    if (json['race_scenario'] && Array.isArray(json['race_horse_data_array'])) {
        return parseNewFormat(json, fileName, id);
    }

    // --- OLD FORMAT LOGIC BELOW ---
    const raceHorseArray = json['<RaceHorse>k__BackingField'];
    const raceType = json['<RaceType>k__BackingField'];
    if (!Array.isArray(raceHorseArray)) {
        return { error: 'Could not find <RaceHorse>k__BackingField or race_horse_data_array in JSON' };
    }

    let detectedCourseId: number | undefined = undefined;
    try {
        const courseSet = json['<RaceCourseSet>k__BackingField'];
        if (courseSet) {
            detectedCourseId = courseSet['<Id>k__BackingField'] ?? courseSet.Id;
        }
    } catch { }

    const horseInfo = raceHorseArray
        .map((member: any) => {
            const horseData = member['_responseHorseData'];
            if (horseData === undefined || horseData === null) return null;
            return horseData;
        })
        .filter((data: any) => data !== null);

    if (horseInfo.length === 0) {
        return { error: 'No horse data found in _responseHorseData fields' };
    }

    const raceScenario = json['<SimDataBase64>k__BackingField'];
    if (typeof raceScenario !== 'string' || !raceScenario) {
        return { error: 'Could not find <SimDataBase64>k__BackingField in JSON' };
    }

    const parsedRaceData = deserializeFromBase64(raceScenario);
    if (!parsedRaceData) {
        return { error: 'Failed to parse race scenario data' };
    }

    const raceDistance = calculateRaceDistance(parsedRaceData);

    const playerIndices = new Set<number>();
    const playerMembers = json['<PlayerTeamMemberArray>k__BackingField'];
    if (Array.isArray(playerMembers)) {
        playerMembers.forEach((m: any) => {
            if (typeof m.horseIndex === 'number') {
                playerIndices.add(m.horseIndex);
            }
        });
    }

    return {
        id,
        fileName,
        raceData: parsedRaceData,
        horseInfo,
        detectedCourseId,
        raceDistance,
        uploadedAt: new Date(),
        playerIndices,
        raceType,
        deckByTrainedCharaId: new Map<number, { id: number; lb: number }[]>(),
    };
}

function parseNewFormat(json: any, fileName: string, id: string): ParsedRace | { error: string } {
    try {
        const rawHorses = json['race_horse_data_array'];
        let detectedCourseId: number | undefined = undefined;
        const courseSet = json['race_course_set'] || json['RaceCourseSet'];
        if (courseSet) {
            detectedCourseId = courseSet['id'] ?? courseSet.Id;
        }

        // Fallback: derive course ID from race instance ID embedded in filename (e.g. "800001_xxx_xxx.json")
        if (!detectedCourseId) {
            const match = fileName.match(/^(\d+)_/);
            if (match) {
                const raceInstanceId = parseInt(match[1], 10);
                const courseSetId = UMDatabaseWrapper.raceInstanceCourseSetId[raceInstanceId];
                if (courseSetId) detectedCourseId = courseSetId;
            }
        }

        const raceType = json['race_type'] || json['RaceType'];

        const horseInfo = rawHorses.filter((h: any) => h !== null);

        const deckByTrainedCharaId = new Map<number, { id: number; lb: number }[]>();
        const trainedCharaArray: any[] = json['trained_chara_array'] ?? [];
        for (const tc of trainedCharaArray) {
            const tcId = tc['trained_chara_id'];
            if (!tcId) continue;
            const cards = (tc['support_card_list'] ?? [])
                .slice()
                .sort((a: any, b: any) => a.position - b.position)
                .map((c: any) => ({ id: c['support_card_id'] as number, lb: (c['limit_break_count'] ?? 0) as number }));
            deckByTrainedCharaId.set(tcId, cards);
        }

        const parsedRaceData = deserializeFromBase64(json['race_scenario']);
        if (!parsedRaceData) {
            return { error: 'Failed to parse race scenario data' };
        }

        const raceDistance = calculateRaceDistance(parsedRaceData);

        const playerIndices = new Set<number>();
        const playerMembers = json['player_team_member_array'] || json['PlayerTeamMemberArray'];
        if (Array.isArray(playerMembers)) {
            playerMembers.forEach((m: any) => {
                const idx = m.horseIndex ?? m.horse_index;
                if (typeof idx === 'number') {
                    playerIndices.add(idx);
                }
            });
        }

        return {
            id,
            fileName,
            raceData: parsedRaceData,
            horseInfo,
            detectedCourseId,
            raceDistance,
            uploadedAt: new Date(),
            playerIndices,
            raceType,
            deckByTrainedCharaId,
        };
    } catch (err: any) {
        return { error: `Failed to parse new JSON format: ${err.message}` };
    }
}

function extractHorseEntries(race: ParsedRace): HorseEntry[] {
    const entries: HorseEntry[] = [];

    race.horseInfo.forEach((data, index) => {
        const frameOrder = (data['frame_order'] ?? (index + 1)) - 1;
        const horseResult = race.raceData.horseResult[frameOrder];
        if (!horseResult) return;

        const trainedChara = fromRaceHorseData(data);
        const charaData = UMDatabaseWrapper.charas[trainedChara.charaId];

        // Get activated skills
        const skillEvents = race.raceData.event
            .map(e => e.event!)
            .filter(event =>
                event.type === RaceSimulateEventData_SimulateEventType.SKILL &&
                event.param[0] === frameOrder
            );
        const activatedSkillIds = new Set(skillEvents.map(e => e.param[1]));

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

        // Calculate activation chance: max(100 - 9000/BaseWiz, 20)%
        // Mood multipliers: 5=Great(1.04), 4=Good(1.02), 3=Normal(1.0), 2=Bad(0.98), 1=Awful(0.96)
        const moodMultipliers: Record<number, number> = { 5: 1.04, 4: 1.02, 3: 1.0, 2: 0.98, 1: 0.96 };
        const moodMult = moodMultipliers[motivation] ?? 1.0;
        const baseWiz = wiz * moodMult;
        const activationChance = Math.max(100 - 9000 / baseWiz, 20) / 100; // As decimal 0-1

        entries.push({
            raceId: race.id,
            frameOrder,
            finishOrder: (horseResult.finishOrder ?? 0) + 1,
            charaId: trainedChara.charaId,
            charaName: charaData?.name ?? `Unknown (${trainedChara.charaId})`,
            cardId: trainedChara.cardId,
            strategy: +strategy,
            trainerName: data.trainer_name ?? data['trainer_name'] ?? 'Unknown',
            activatedSkillIds,
            learnedSkillIds,
            finishTime: horseResult.finishTimeRaw ?? 0,
            raceDistance: race.raceDistance,
            speed,
            stamina,
            pow,
            guts,
            wiz,
            rankScore: trainedChara.rankScore,
            motivation,
            activationChance,
            isPlayer: race.playerIndices.has(frameOrder),
            teamId: data['team_id'] ?? 0,
            supportCardIds: (race.deckByTrainedCharaId.get(data['trained_chara_id']) ?? []).map(c => c.id),
            supportCardLimitBreaks: (race.deckByTrainedCharaId.get(data['trained_chara_id']) ?? []).map(c => c.lb),
        });
    });

    return entries;
}

function extractSkillActivations(race: ParsedRace): Map<number, SkillActivationPoint[]> {
    const activations = new Map<number, SkillActivationPoint[]>();

    // Pre-build a lookup for frame times to distances per horse
    // This lets us quickly find the distance at any given time for any horse
    const frameData = race.raceData.frame ?? [];

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

    race.raceData.event.forEach(eventWrapper => {
        const event = eventWrapper.event;
        if (!event || event.type !== RaceSimulateEventData_SimulateEventType.SKILL) return;

        const frameOrder = event.param[0];
        const skillId = event.param[1];
        const activationTime = event.frameTime ?? 0;

        const horseResult = race.raceData.horseResult[frameOrder];
        const finishOrder = horseResult ? (horseResult.finishOrder ?? 99) + 1 : 99;

        // Find the distance at the activation time by searching frames
        let distance = 0;

        // Binary search or linear search for the frame closest to activationTime
        for (let i = 0; i < frameData.length; i++) {
            const frame = frameData[i];
            const frameTime = frame.time ?? 0;

            if (frameTime >= activationTime) {
                // Found the frame at or after activation time
                const hf = frame.horseFrame?.[frameOrder];
                if (hf && hf.distance !== undefined) {
                    distance = hf.distance;
                }
                break;
            }

            // Store the last valid distance in case we're between frames
            const hf = frame.horseFrame?.[frameOrder];
            if (hf && hf.distance !== undefined) {
                distance = hf.distance;
            }
        }

        const point: SkillActivationPoint = {
            raceId: race.id,
            horseFrameOrder: frameOrder,
            distance,
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


function computeTeamStats(allHorses: HorseEntry[]): TeamCompositionStats[] {
    // Group horses by race
    const raceMap = new Map<string, HorseEntry[]>();
    for (const h of allHorses) {
        if (!raceMap.has(h.raceId)) raceMap.set(h.raceId, []);
        raceMap.get(h.raceId)!.push(h);
    }

    const compMap = new Map<string, {
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
            const sorted = [...team].sort((a, b) => (a.cardId * 10 + a.strategy) - (b.cardId * 10 + b.strategy));
            const key = sorted.map(h => `${h.cardId}_${h.strategy}`).join('__');

            if (!compMap.has(key)) {
                compMap.set(key, {
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
                    const horse = team.find(h => h.cardId === sorted[si].cardId && h.strategy === sorted[si].strategy);
                    if (horse && horse.finishOrder === 1) {
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

function getStrategyForHorseData(data: any) {
    const trainedChara = fromRaceHorseData(data);
    const learnedSkillIds = new Set((trainedChara.skills ?? []).map(s => s.skillId));
    const rawStrategy = data.running_style ?? trainedChara.rawData?.param?.runningStyle ?? 1;
    return rawStrategy === 1 && learnedSkillIds.has(RUNAWAY_TRIGGER_SKILL_ID) ? 5 : rawStrategy;
}

function buildGateWinRatesForFlavor(races: ParsedRace[], strategyFilter: Set<number> | null) {
    const gateStatsMap = new Map<number, { appearances: number; wins: number }>();
    for (const race of races) {
        const strategyByGate = new Map<number, number>();
        race.horseInfo.forEach((data, index) => {
            const gateNumber = data?.['frame_order'] ?? (index + 1);
            strategyByGate.set(gateNumber, getStrategyForHorseData(data));
        });
        race.raceData.horseResult.forEach((result, index) => {
            const gateNumber = index + 1;
            const strategy = strategyByGate.get(gateNumber);
            if (strategyFilter && (!strategy || !strategyFilter.has(strategy))) return;
            if (!gateStatsMap.has(gateNumber)) {
                gateStatsMap.set(gateNumber, {appearances: 0, wins: 0});
            }
            const gateStats = gateStatsMap.get(gateNumber)!;
            gateStats.appearances++;
            if (result.finishOrder === 1) {
                gateStats.wins++;
            }
        });
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

export function aggregateStats(races: ParsedRace[]): AggregatedStats {
    const allHorses: HorseEntry[] = [];
    const allSkillActivations = new Map<number, SkillActivationPoint[]>();

    // Collect all horse entries and skill activations
    races.forEach(race => {
        const horses = extractHorseEntries(race);
        allHorses.push(...horses);

        const skillActs = extractSkillActivations(race);
        skillActs.forEach((points, skillId) => {
            if (!allSkillActivations.has(skillId)) {
                allSkillActivations.set(skillId, []);
            }
            allSkillActivations.get(skillId)!.push(...points);
        });
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
        rawStrategyTotals[horse.strategy] = (rawStrategyTotals[horse.strategy] ?? 0) + 1;
    });

    allHorses.forEach(horse => {
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
        skillGroups.get(counterpartBaseId)!.push(...ids);
        inheritedGroupsToRemove.push(baseId);
    });
    inheritedGroupsToRemove.forEach(baseId => skillGroups.delete(baseId));

    skillGroups.forEach((groupSkillIds) => {
        // Aggregate activations for all skills in the group
        const groupPoints: SkillActivationPoint[] = [];
        groupSkillIds.forEach(id => {
            const points = allSkillActivations.get(id);
            if (points) {
                groupPoints.push(...points);
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
            const data = getSkillsJsonMap().get(id);
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

            const dbData = UMDatabaseWrapper.skills[id];
            const name = (isInherited ? `${dbData?.name ?? `Skill #${id}`} (Inherit)` : dbData?.name) ?? `Skill #${id}`;
            if (!distinctNames.has(name) || rarity > distinctNames.get(name)!) {
                distinctNames.set(name, rarity);
            }
        });

        // Sort names by rarity descending (Gold first)
        const skillNames = Array.from(distinctNames.entries())
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0]);

        const skillData = UMDatabaseWrapper.skills[representativeId];
        const skillName = skillData?.name ?? `Skill #${representativeId}`;

        const uniqueRaces = new Set(groupPoints.map(p => p.raceId)).size;
        const uniqueHorses = new Set(groupPoints.map(p => `${p.raceId}_${p.horseFrameOrder}`)).size;

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

        const learnedByCharaIds = new Set(horsesWhoLearned.map(h => h.charaId));
        const learnedByStrategies = new Set(horsesWhoLearned.map(h => h.strategy));

        // Check metadata on representative ID
        const isUnique = representativeId >= 100000 && representativeId < 200000;
        const detailedSkillData = getSkillsJsonMap().get(representativeId);
        const isPassive = detailedSkillData?.condition_groups?.some((group: any) =>
            group.effects?.some((effect: any) =>
                [1, 2, 3, 4, 5].includes(effect.type)
            )
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

        const distances = groupPoints.map(p => p.distance).sort((a, b) => a - b);
        let meanDistance = 0;
        let medianDistance = 0;

        if (distances.length > 0) {
            meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
            const mid = Math.floor(distances.length / 2);
            medianDistance = distances.length % 2 !== 0
                ? distances[mid]
                : (distances[mid - 1] + distances[mid]) / 2;
        }

        skillStats.set(representativeId, {
            skillId: representativeId,
            skillName,
            skillNames,
            timesActivated: groupPoints.length,
            normalizedActivations,
            uniqueRaces,
            uniqueHorses,
            learnedByHorses,
            winRate,
            avgFinishPosition: avgPosition,
            activationDistances: distances, // Already sorted
            learnedByCharaIds,
            learnedByStrategies,
            meanDistance,
            medianDistance,
        });

        mergedSkillActivations.set(representativeId, groupPoints);
    });

    // Total statistics
    const totalRaces = races.length;
    const totalHorses = allHorses.length;

    // Room composition frequencies
    const raceStratCounts = new Map<string, number[]>();
    for (const h of allHorses) {
        if (!raceStratCounts.has(h.raceId)) raceStratCounts.set(h.raceId, new Array(ALL_STRATEGY_IDS.length).fill(0));
        const c = raceStratCounts.get(h.raceId)!;
        const strategyIdx = ALL_STRATEGY_IDS.indexOf(h.strategy);
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
        .slice(0, 50)
        .map(e => ({ counts: e.counts, occurrences: e.occurrences, rate: e.occurrences / (totalRaces || 1) }));

    // Use official track distance if available, otherwise fall back to calculated distance
    const avgRaceDistance = races.length > 0
        ? races.reduce((sum, r) => {
            const trackDist = getTrackDistance(r.detectedCourseId);
            return sum + (trackDist ?? r.raceDistance);
        }, 0) / races.length
        : 0;
    const gateWinRatesByFlavor = {
        total: buildGateWinRatesForFlavor(races, GATE_FLAVOR_TO_STRATEGIES.total),
        front: buildGateWinRatesForFlavor(races, GATE_FLAVOR_TO_STRATEGIES.front),
        pace: buildGateWinRatesForFlavor(races, GATE_FLAVOR_TO_STRATEGIES.pace),
        late: buildGateWinRatesForFlavor(races, GATE_FLAVOR_TO_STRATEGIES.late),
        end: buildGateWinRatesForFlavor(races, GATE_FLAVOR_TO_STRATEGIES.end),
    };
    const gateWinRates = gateWinRatesByFlavor.total;

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
        gateWinRates,
        gateWinRatesByFlavor,
    };
}

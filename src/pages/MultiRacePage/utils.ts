import { RaceSimulateData, RaceSimulateEventData_SimulateEventType } from "../../data/race_data_pb";
import { deserializeFromBase64 } from "../../data/RaceDataParser";
import { fromRaceHorseData } from "../../data/TrainedCharaData";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import raceTrackData from "../../data/tracks/racetracks.json";
import skillsJson from "../../data/skills.json";
import {
    AggregatedStats,
    CharacterStats,
    HorseEntry,
    ParsedRace,
    SkillActivationPoint,
    SkillStats,
    StrategyStats
} from "./types";

const STRATEGY_NAMES: Record<number, string> = {
    1: "Front Runner",
    2: "Pace Chaser",
    3: "Late Surger",
    4: "End Closer",
};

// Map for detailed skill data (condition_groups) logic - imported from skills.json
const skillsJsonMap = new Map((skillsJson as any[]).map(s => [s.id, s]));

// Get track info from course ID
export function getTrackInfo(courseId: number | undefined): { label: string; id: number; length: number } | null {
    if (!courseId) return null;
    const track = raceTrackData.pageProps.racetrackFilterData.find((t: any) => t.id === courseId);
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
export function getTrackDistance(courseId: number | undefined): number | null {
    const info = getTrackInfo(courseId);
    return info ? info.length : null;
}

export function calculateRaceDistance(raceData: RaceSimulateData): number {
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

        const raceType = json['race_type'] || json['RaceType'];

        const horseInfo = rawHorses.filter((h: any) => h !== null);

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
            raceType
        };
    } catch (err: any) {
        return { error: `Failed to parse new JSON format: ${err.message}` };
    }
}

export function extractHorseEntries(race: ParsedRace): HorseEntry[] {
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

        const strategy = data.running_style ?? trainedChara.rawData?.param?.runningStyle ?? 1;

        // Get wiz and motivation for activation chance calculation
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
            wiz,
            motivation,
            activationChance,
            isPlayer: race.playerIndices.has(frameOrder),
        });
    });

    return entries;
}

export function extractSkillActivations(race: ParsedRace): Map<number, SkillActivationPoint[]> {
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
    }));

    // Skill stats
    const skillStats = new Map<number, SkillStats>();
    const mergedSkillActivations = new Map<number, SkillActivationPoint[]>();

    // Collect all skill IDs that appear in either activations or learned lists
    const uniqueSkillIds = new Set<number>();
    allSkillActivations.forEach((_, id) => uniqueSkillIds.add(id));
    allHorses.forEach(h => h.learnedSkillIds.forEach(id => uniqueSkillIds.add(id)));

    // Group skills by their base ID (prefix) to combine ranks
    const skillGroups = new Map<number, number[]>();
    uniqueSkillIds.forEach(id => {
        // Group by prefix (all digits except last one)
        // Typically baseId 20033 covers 200331, 200332, etc.
        const baseId = Math.floor(id / 10);
        if (!skillGroups.has(baseId)) skillGroups.set(baseId, []);
        skillGroups.get(baseId)!.push(id);
    });

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

        // Determine representative ID (prefer highest rarity, then highest ID)
        // Also collect all unique names
        let representativeId = groupSkillIds[0];
        let maxRarity = -1;
        const distinctNames = new Map<string, number>(); // Name -> Rarity

        groupSkillIds.forEach(id => {
            const data = skillsJsonMap.get(id);
            const rarity = data?.rarity ?? 0;

            if (rarity > maxRarity) {
                maxRarity = rarity;
                representativeId = id;
            } else if (rarity === maxRarity) {
                if (id > representativeId) representativeId = id;
            }

            const dbData = UMDatabaseWrapper.skills[id];
            const name = dbData?.name ?? `Skill #${id}`;
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
        const detailedSkillData = skillsJsonMap.get(representativeId);
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

    // Use official track distance if available, otherwise fall back to calculated distance
    const avgRaceDistance = races.length > 0
        ? races.reduce((sum, r) => {
            const trackDist = getTrackDistance(r.detectedCourseId);
            return sum + (trackDist ?? r.raceDistance);
        }, 0) / races.length
        : 0;

    return {
        totalRaces,
        totalHorses,
        avgRaceDistance,
        characterStats,
        strategyStats,
        skillStats,
        skillActivations: mergedSkillActivations,
        allHorses,
    };
}

import type { DetailedRaceSimulationResponse } from '../../data/DetailedRaceSimulation';
import { hydrateCompactRaceHorseData } from '../../data/TrainedCharaData';
import { getCourseAptitudeFilters } from '../MultiRacePage/utils';
import type { Build, Performer, Runner, Style } from './types';

export type LobbyMood = 'random' | 'random-no-awful' | 'preserve' | '1' | '2' | '3' | '4' | '5';
export type LobbyAptitude = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type LobbyRunningStyle = 1 | 2 | 3 | 4;
export type LobbyRunnerEdit = {
    cardId: number;
    stats: [number, number, number, number, number];
    aptitudes: [LobbyAptitude, LobbyAptitude, LobbyAptitude];
    runningStyle: LobbyRunningStyle;
    uniqueSkillId: number;
    uniqueSkillLevel: number;
    skills: [number, number][];
};
export type LobbyEditorCatalog = { snapshotId: string; cards: number[]; skills: number[] };

export type LobbyDraft = {
    mood: LobbyMood;
    seed: string;
    gates: Record<string, number | null>;
    runnerEdits: Record<string, LobbyRunnerEdit>;
    customRunners: Record<string, LobbyRunnerEdit>;
    customRunnerSourceIds: Record<string, string>;
    customRunnerStyles: Record<string, Style>;
    customRunnerScores: Record<string, number>;
    customTeamOrigins: Record<string, Performer>;
};

export const LOBBY_STAT_MIN = 1;
export const LOBBY_STAT_MAX = 2000;
export const LOBBY_MAX_EDITABLE_SKILLS = 100;
export const LOBBY_SEED_MIN = 1;
export const LOBBY_SEED_MAX = 2_147_483_647;
export const LOBBY_APTITUDES: LobbyAptitude[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
export const LOBBY_RUNNING_STYLES: LobbyRunningStyle[] = [1, 2, 3, 4];

export function lobbySeedFromUint32(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
        throw new RangeError('A random lobby seed source must be an unsigned 32-bit integer.');
    }
    return value % LOBBY_SEED_MAX + LOBBY_SEED_MIN;
}

export function generateLobbySeed(): number {
    return lobbySeedFromUint32(crypto.getRandomValues(new Uint32Array(1))[0]);
}

export function ownedUniqueSkillId(cardId: number): number {
    const text = String(cardId);
    if (text.length < 4 || text[0] !== '1') return -1;
    const characterId = Number(text.slice(1, -2));
    const variation = Number(text.slice(-2));
    return 100_000 + 10_000 * (variation - 1) + characterId * 10 + 1;
}

export function lowerRarityOwnedUniqueSkillId(cardId: number): number {
    const text = String(cardId);
    if (text.length < 4 || text[0] !== '1' || Number(text.slice(-2)) !== 1) return -1;
    return 10_000 + Number(text.slice(1, -2)) * 10 + 1;
}

export function isBaseUniqueSkillId(skillId: number): boolean {
    return (skillId >= 10_000 && skillId < 20_000) || (skillId >= 100_000 && skillId < 200_000);
}

export function lobbySkillFamilyId(skillId: number): number {
    return Math.floor(skillId / 10);
}

export function replaceLobbySkillFamily(skills: [number, number][], skillId: number): [number, number][] {
    const familyId = lobbySkillFamilyId(skillId);
    return [...skills.filter(([candidate]) => lobbySkillFamilyId(candidate) !== familyId), [skillId, 1]];
}

export function changeLobbyRunnerIdentity(edit: LobbyRunnerEdit, cardId: number): LobbyRunnerEdit {
    return { ...edit, cardId, uniqueSkillId: ownedUniqueSkillId(cardId) };
}

export function hasLobbyBuildData(runner: Runner): runner is Build {
    const candidate = runner as Partial<Build>;
    return Array.isArray(candidate.stats) && candidate.stats.length === 5
        && Array.isArray(candidate.aptitudes) && candidate.aptitudes.length === 3
        && Array.isArray(candidate.skills);
}

function normalizedAptitude(value: string): LobbyAptitude {
    const normalized = value.toUpperCase() as LobbyAptitude;
    return LOBBY_APTITUDES.includes(normalized) ? normalized : 'A';
}

function normalizedRunningStyle(value: number): LobbyRunningStyle {
    return LOBBY_RUNNING_STYLES.includes(value as LobbyRunningStyle)
        ? value as LobbyRunningStyle
        : 1;
}

export function createLobbyRunnerEdit(runner: Runner): LobbyRunnerEdit | null {
    if (!hasLobbyBuildData(runner)) return null;
    const uniqueSkillCandidates = [ownedUniqueSkillId(runner.card), lowerRarityOwnedUniqueSkillId(runner.card)];
    const uniqueSkill = runner.skills.find(([skillId]) => uniqueSkillCandidates.includes(skillId));
    const uniqueSkillId = uniqueSkill?.[0] ?? uniqueSkillCandidates[0];
    const uniqueSkillLevel = uniqueSkill?.[1] ?? 1;
    const skills = runner.skills.flatMap(([skillId]): [number, number][] => {
        if (uniqueSkillCandidates.includes(skillId)) return [];
        const normalizedId = skillId >= 100_000 && skillId < 200_000 ? skillId + 800_000 : skillId;
        return [[normalizedId, 1]];
    }).filter(([skillId], index, all) => all.findIndex(([candidate]) => candidate === skillId) === index);
    return {
        cardId: runner.card,
        stats: [...runner.stats],
        aptitudes: runner.aptitudes.map(normalizedAptitude) as LobbyRunnerEdit['aptitudes'],
        runningStyle: normalizedRunningStyle(runner.racingStyle),
        uniqueSkillId,
        uniqueSkillLevel,
        skills,
    };
}

export function createBlankLobbyRunnerEdit(cardId: number): LobbyRunnerEdit {
    return {
        cardId,
        stats: [1200, 1200, 1200, 1200, 1200],
        aptitudes: ['A', 'A', 'A'],
        runningStyle: 1,
        uniqueSkillId: ownedUniqueSkillId(cardId),
        uniqueSkillLevel: 6,
        skills: [],
    };
}

export function customLobbyRunnerKey(teamIndex: number, memberIndex: number): string {
    return `custom:${teamIndex}:${memberIndex}`;
}

export type LobbyRunnerPosition = { teamIndex: number; memberIndex: number };

export function lobbySimulationTeamIds(
    teams: (Performer | null)[],
    draft: Pick<LobbyDraft, 'customTeamOrigins'>,
): (string | null)[] {
    return teams.map((team, teamIndex) => team?.id ?? draft.customTeamOrigins[teamIndex]?.id ?? null);
}

export function rearrangeLobbyRunners(
    teams: (Performer | null)[],
    draft: LobbyDraft,
    from: LobbyRunnerPosition,
    to: LobbyRunnerPosition | null,
): { teams: (Performer | null)[]; draft: LobbyDraft } | null {
    type Item = { edit: LobbyRunnerEdit; sourceId?: string; style?: Style; score?: number; gate?: number | null };
    const affected = new Set([from.teamIndex, ...(to ? [to.teamIndex] : [])]);
    const grid: (Item | null)[][] = teams.map((team, teamIndex) => [0, 1, 2].map(memberIndex => {
        if (team) {
            const runner = team.members[memberIndex];
            const originalKey = `${team.id}:${memberIndex}`;
            const edit = draft.runnerEdits[originalKey] ?? createLobbyRunnerEdit(runner);
            if (!edit) return null;
            return { edit, sourceId: runner.id, style: runner.style, score: runner.score, gate: draft.gates[originalKey] };
        }
        const key = customLobbyRunnerKey(teamIndex, memberIndex);
        const edit = draft.customRunners[key];
        return edit ? { edit, sourceId: draft.customRunnerSourceIds[key], style: draft.customRunnerStyles[key], score: draft.customRunnerScores?.[key], gate: draft.gates[key] } : null;
    }));
    if (!grid[from.teamIndex]?.[from.memberIndex]) return null;
    for (const teamIndex of affected) {
        if (teams[teamIndex] && grid[teamIndex].some(item => !item)) return null;
    }
    if (to) [grid[from.teamIndex][from.memberIndex], grid[to.teamIndex][to.memberIndex]] = [grid[to.teamIndex][to.memberIndex], grid[from.teamIndex][from.memberIndex]];
    else grid[from.teamIndex][from.memberIndex] = null;

    const nextDraft: LobbyDraft = {
        ...draft,
        gates: { ...draft.gates },
        runnerEdits: { ...draft.runnerEdits },
        customRunners: { ...draft.customRunners },
        customRunnerSourceIds: { ...draft.customRunnerSourceIds },
        customRunnerStyles: { ...draft.customRunnerStyles },
        customRunnerScores: { ...(draft.customRunnerScores ?? {}) },
        customTeamOrigins: { ...draft.customTeamOrigins },
    };
    for (const teamIndex of affected) {
        const team = teams[teamIndex];
        if (team && !nextDraft.customTeamOrigins[teamIndex]) nextDraft.customTeamOrigins[teamIndex] = team;
        for (let memberIndex = 0; memberIndex < 3; memberIndex++) {
            const customKey = customLobbyRunnerKey(teamIndex, memberIndex);
            delete nextDraft.customRunners[customKey];
            delete nextDraft.customRunnerSourceIds[customKey];
            delete nextDraft.customRunnerStyles[customKey];
            delete nextDraft.customRunnerScores[customKey];
            delete nextDraft.gates[customKey];
            if (team) {
                const originalKey = `${team.id}:${memberIndex}`;
                delete nextDraft.runnerEdits[originalKey];
                delete nextDraft.gates[originalKey];
            }
            const item = grid[teamIndex][memberIndex];
            if (!item) continue;
            nextDraft.customRunners[customKey] = item.edit;
            if (item.sourceId) nextDraft.customRunnerSourceIds[customKey] = item.sourceId;
            if (item.style) nextDraft.customRunnerStyles[customKey] = item.style;
            if (item.score !== undefined) nextDraft.customRunnerScores[customKey] = item.score;
            if (item.gate !== undefined) nextDraft.gates[customKey] = item.gate;
        }
    }
    const nextTeams = teams.map((team, teamIndex) => affected.has(teamIndex) ? null : team);
    for (const teamIndex of affected) {
        const origin = nextDraft.customTeamOrigins[teamIndex];
        if (!origin || !grid[teamIndex].every((item, memberIndex) => item?.sourceId === origin.members[memberIndex]?.id)) continue;
        nextTeams[teamIndex] = origin;
        for (let memberIndex = 0; memberIndex < 3; memberIndex++) {
            const customKey = customLobbyRunnerKey(teamIndex, memberIndex);
            const originalKey = `${origin.id}:${memberIndex}`;
            const item = grid[teamIndex][memberIndex]!;
            delete nextDraft.customRunners[customKey];
            delete nextDraft.customRunnerSourceIds[customKey];
            delete nextDraft.customRunnerStyles[customKey];
            delete nextDraft.customRunnerScores[customKey];
            delete nextDraft.gates[customKey];
            if (isLobbyRunnerEditChanged(origin.members[memberIndex], item.edit)) nextDraft.runnerEdits[originalKey] = item.edit;
            else delete nextDraft.runnerEdits[originalKey];
            if (item.gate !== undefined) nextDraft.gates[originalKey] = item.gate;
        }
        delete nextDraft.customTeamOrigins[teamIndex];
    }
    return {
        teams: nextTeams,
        draft: nextDraft,
    };
}

export function isLobbyRunnerEditChanged(runner: Runner, edit: LobbyRunnerEdit): boolean {
    const original = createLobbyRunnerEdit(runner);
    return original === null || JSON.stringify(original) !== JSON.stringify(edit);
}

export function toLobbyRunnerOverride(edit: LobbyRunnerEdit) {
    return {
        identity: { cardId: edit.cardId, charaId: Math.floor(edit.cardId / 100) },
        rawStats: {
            speed: edit.stats[0], stamina: edit.stats[1], power: edit.stats[2],
            guts: edit.stats[3], wisdom: edit.stats[4],
        },
        distanceAptitude: edit.aptitudes[0],
        surfaceAptitude: edit.aptitudes[1],
        strategyAptitude: edit.aptitudes[2],
        runningStyle: edit.runningStyle - 1,
        uniqueSkillId: edit.uniqueSkillId,
        uniqueSkillLevel: edit.uniqueSkillLevel,
        skills: [...edit.skills]
            .sort(([left], [right]) => left - right)
            .map(([skillId]) => ({ skillId, level: 1 })),
    };
}

type LobbySkillInput = { skillId: number; level: number };
type LobbyHorseInput = {
    horseIndex: number;
    frameOrder: number;
    gateNumber: number;
    popularity: number;
    teamId: number;
    teamMemberId: number;
    singleModeWinCount: number;
    singleModeTeamRank?: number;
    fanCount: number;
    identity: { charaId: number; cardId: number; viewerId?: number };
    runningStyle: number;
    rawStats: { speed: number; stamina: number; power: number; guts: number; wisdom: number };
    motivation: number;
    distanceAptitude: number | string;
    surfaceAptitude: number | string;
    strategyAptitude: number | string;
    skills: LobbySkillInput[];
};

export type SimDataLobbyRace = {
    snapshotId: string;
    engineBuild: string;
    seed: number;
    teamIds: (string | null)[];
    runnerOrder: number[];
    sourceRunnerMetadata?: (Pick<Build, 'deck' | 'parents'> & { modifiedInLobby?: boolean })[];
    raceInput: {
        schemaVersion?: number;
        randomSeed?: number;
        courseId: number;
        groundCondition: number | string;
        weather: number;
        season: number;
        horses: LobbyHorseInput[];
    } & Record<string, unknown>;
    replay: DetailedRaceSimulationResponse['replay'];
    annotations: DetailedRaceSimulationResponse['annotations'];
    diagnostics?: DetailedRaceSimulationResponse['diagnostics'];
};

export type SimDataLobbyRaceView = {
    raceHorseInfo: Record<string, unknown>[];
    raceScenario: string;
    detectedCourseId: number;
    randomSeed: number;
    raceType: string;
    trackDetails: { condition: string; weather: string; season: string };
    detailed: DetailedRaceSimulationResponse;
};

const SESSION_PREFIX = 'hakuraku:simdata-lobby-race:';
const tokenPattern = /^[a-f0-9-]{20,80}$/i;

function removeStoredLobbyRaces(storage: Storage) {
    try {
        for (let index = storage.length - 1; index >= 0; index--) {
            const key = storage.key(index);
            if (key?.startsWith(SESSION_PREFIX)) storage.removeItem(key);
        }
    } catch {
        // Storage can be unavailable under strict browser privacy settings.
    }
}

function aptitudeValue(value: number | string): number | string {
    if (typeof value === 'number') return Math.max(1, Math.min(8, 8 - value));
    const normalized = value.trim().toUpperCase();
    const index = ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'].indexOf(normalized);
    return index >= 0 ? index + 1 : value;
}

function runningStyleValue(value: number): number {
    return value >= 0 && value <= 4 ? value + 1 : value;
}

export function buildLobbyRaceView(
    payload: SimDataLobbyRace,
    courseAptitudeFilters = getCourseAptitudeFilters(payload.raceInput?.courseId),
): SimDataLobbyRaceView {
    if (!payload?.replay?.data || !Array.isArray(payload.raceInput?.horses) || payload.raceInput.horses.length !== 9
        || !payload.annotations || !Array.isArray(payload.annotations.horses)) {
        throw new Error('The simulator returned an incomplete lobby race.');
    }
    const horses = [...payload.raceInput.horses].sort((a, b) => a.frameOrder - b.frameOrder);
    const raceHorseInfo = horses.map((horse, index) => {
        const sourceMetadata = payload.sourceRunnerMetadata?.[payload.runnerOrder[horse.frameOrder]];
        const modifiedInLobby = sourceMetadata?.modifiedInLobby === true;
        return hydrateCompactRaceHorseData({
            frame_order: index + 1,
            gate_number: index + 1,
            team_id: horse.teamId,
            team_member_id: horse.teamMemberId,
            trained_chara_id: index + 1,
            viewer_id: 0,
            has_viewer_id: Number(horse.identity.viewerId ?? 0) !== 0,
            popularity: horse.popularity,
            team_rank: horse.singleModeTeamRank ?? 0,
            trainer_name: `Team ${horse.teamId}`,
            chara_id: horse.identity.charaId,
            card_id: horse.identity.cardId,
            running_style: runningStyleValue(horse.runningStyle),
            motivation: horse.motivation,
            single_mode_win_count: horse.singleModeWinCount,
            fan_count: horse.fanCount,
            speed: horse.rawStats.speed,
            stamina: horse.rawStats.stamina,
            pow: horse.rawStats.power,
            guts: horse.rawStats.guts,
            wiz: horse.rawStats.wisdom,
            apt_distance: aptitudeValue(horse.distanceAptitude),
            apt_ground: aptitudeValue(horse.surfaceAptitude),
            apt_style: aptitudeValue(horse.strategyAptitude),
            skill_array: horse.skills.map(skill => ({ skill_id: skill.skillId, level: skill.level })),
            ...(modifiedInLobby ? { modified_in_lobby: true } : {}),
            deck: modifiedInLobby ? [] : sourceMetadata?.deck ?? [],
            parents: modifiedInLobby ? [] : sourceMetadata?.parents ?? [],
        }, { courseAptitudeFilters });
    });
    const ground = typeof payload.raceInput.groundCondition === 'number'
        ? payload.raceInput.groundCondition + 1
        : payload.raceInput.groundCondition;
    return {
        raceHorseInfo,
        raceScenario: payload.replay.data,
        detectedCourseId: payload.raceInput.courseId,
        randomSeed: payload.seed,
        raceType: 'UmaLogs lobby',
        trackDetails: {
            condition: String(ground),
            weather: String(payload.raceInput.weather),
            season: String(payload.raceInput.season),
        },
        detailed: {
            engineBuild: payload.engineBuild,
            seed: payload.seed,
            replay: payload.replay,
            annotations: payload.annotations,
            diagnostics: payload.diagnostics,
        },
    };
}

export function stageLobbyRace(payload: SimDataLobbyRace): string {
    const token = crypto.randomUUID();
    const serialized = JSON.stringify(payload);
    const key = `${SESSION_PREFIX}${token}`;
    // Older builds left one full replay in the opener's sessionStorage for
    // every simulation. A newly opened tab cannot consume those values.
    removeStoredLobbyRaces(sessionStorage);
    try {
        localStorage.setItem(key, serialized);
    } catch {
        // Clear abandoned cross-tab handoffs and retry once before reporting a
        // genuine quota or privacy-mode failure.
        removeStoredLobbyRaces(localStorage);
        try {
            localStorage.setItem(key, serialized);
        } catch {
            throw new Error('The generated race could not be passed to RaceData because browser storage is unavailable.');
        }
    }
    return token;
}

export function consumeLobbyRace(token: string): SimDataLobbyRace | null {
    if (!tokenPattern.test(token)) return null;
    const key = `${SESSION_PREFIX}${token}`;
    const serialized = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!serialized) return null;
    // window.open can clone the opener's old sessionStorage before staging has
    // a chance to clean it, so recover the receiving tab as well.
    removeStoredLobbyRaces(sessionStorage);
    localStorage.removeItem(key);
    try {
        return JSON.parse(serialized) as SimDataLobbyRace;
    } catch {
        return null;
    }
}

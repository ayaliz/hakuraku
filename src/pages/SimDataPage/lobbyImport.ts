import { isTeamTrialRaceJson, parseApiDeck, parseParentEntries, parseStandardRaceJson } from '../../data/RaceJsonParser';
import { hydrateCompactRaceHorseData } from '../../data/TrainedCharaData';
import { createLobbyRunnerEdit, customLobbyRunnerKey, lowerRarityOwnedUniqueSkillId, ownedUniqueSkillId, type LobbyDraft } from './lobby';
import type { Build, Performer, SnapshotMeta, Style } from './types';
import { courseAptitudeLabels } from './components';
import { readLobbyUmaFile } from './lobbyUmaFile';

export type LobbyImport = { runners: Build[]; teams: { id: string; label: string; runners: Build[] }[]; autoAdd?: boolean };
const distances = ['proper_distance_short', 'proper_distance_mile', 'proper_distance_middle', 'proper_distance_long'];
const strategies = ['proper_running_style_nige', 'proper_running_style_senko', 'proper_running_style_sashi', 'proper_running_style_oikomi'];

export function parseLobbyImport(json: unknown, meta: Pick<SnapshotMeta, 'courseDistance' | 'courseSurface'> & Partial<Pick<SnapshotMeta, 'course'>>): LobbyImport {
    const exported = readLobbyUmaFile(json, meta);
    if (exported) {
        const edit = exported.uma;
        return { autoAdd: true, teams: [], runners: [{
            id: 'upload:0', card: edit.cardId, chara: Math.floor(edit.cardId / 100), racingStyle: edit.runningStyle,
            style: edit.runningStyle, score: exported.rankScore, stats: edit.stats, aptitudes: edit.aptitudes,
            skills: [[edit.uniqueSkillId, edit.uniqueSkillLevel], ...edit.skills], trainedIds: [], deck: [], parents: [],
            fanCount: edit.fanCount, singleModeWinCount: edit.singleModeWinCount,
        }] };
    }
    const labels = courseAptitudeLabels({ ...meta, course: meta.course ?? '' });
    const distance = ['Sprint', 'Mile', 'Medium', 'Long'].indexOf(labels.distance === 'Short' ? 'Sprint' : labels.distance);
    if (distance < 0 || !['Turf', 'Dirt'].includes(labels.surface)) throw new Error('The selected dataset is missing its course aptitude settings.');
    if (isTeamTrialRaceJson(json)) {
        const trial = json as any;
        const parts: LobbyImport[] = trial.race_start_params_array.map((start: any, index: number) => {
            const imported = parseLobbyImport({ ...start, race_scenario: trial.race_result_array[index]?.race_scenario }, meta);
            const runners = imported.runners.map(runner => ({ ...runner, id: `race:${index}:${runner.id}` }));
            return { runners, teams: imported.teams.map(team => ({ id: `race:${index}:${team.id}`, label: `Race ${index + 1} - ${team.label}`, runners: team.runners.map(runner => runners.find(candidate => candidate.id === `race:${index}:${runner.id}`)!) })) };
        });
        if (!parts.length) throw new Error('No races found in this Team Trial file.');
        return { runners: parts.flatMap(part => part.runners), teams: parts.flatMap(part => part.teams) };
    }
    const veterans = Array.isArray(json);
    const parsed = veterans ? null : parseStandardRaceJson(json);
    if (parsed && 'error' in parsed) throw new Error(parsed.error);
    const createdAt = (veteran: any): number => {
        const time = Date.parse(veteran?.create_time ?? '');
        return Number.isFinite(time) ? time : -Infinity;
    };
    const raw: any[] = veterans
        ? [...json].sort((left, right) => {
            const a = createdAt(left), b = createdAt(right);
            return a === b ? 0 : a > b ? -1 : 1;
        })
        : parsed!.horseInfo;
    if (!raw.length) throw new Error('No Umas found in this file.');
    const groups = new Map<string, Build[]>();
    const groupNames = new Map<string, Set<string>>();
    const runners = raw.map((input, index): Build => {
        const horse = hydrateCompactRaceHorseData(input);
        const style = Number(horse.running_style);
        const strategy = style === 5 ? 1 : style;
        if (![1, 2, 3, 4].includes(strategy)) throw new Error(`Uma ${index + 1} has no valid running style.`);
        const stats = [horse.speed, horse.stamina, horse.pow ?? horse.power, horse.guts, horse.wiz];
        if (stats.some(value => !Number.isInteger(value) || value < 1 || value > 2000)) throw new Error(`Uma ${index + 1} has missing or unsupported stats.`);
        const aptitude = (value: unknown): string => {
            if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 8) {
                throw new Error(`Uma ${index + 1} is missing an aptitude needed for this dataset. Use a full export with aptitudes for this course.`);
            }
            return ['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'][Number(value) - 1];
        };
        const card = Number(horse.card_id);
        if (!Number.isInteger(card) || card <= 0 || !Array.isArray(horse.skill_array) || !horse.skill_array.length) throw new Error(`Uma ${index + 1} is missing its identity or learned skills.`);
        if (horse.skill_array.some((skill: any) => !Number.isInteger(skill.skillId) || skill.skillId <= 0 || !Number.isInteger(skill.level) || skill.level < 1 || skill.level > 6)) throw new Error(`Uma ${index + 1} has invalid learned skills.`);
        if (!horse.skill_array.some((skill: any) => [ownedUniqueSkillId(card), lowerRarityOwnedUniqueSkillId(card)].includes(skill.skillId))) throw new Error(`Uma ${index + 1} is missing its owned unique skill and level.`);
        const runner: Build = {
            id: `upload:${index}`, card, chara: Math.floor(card / 100), racingStyle: strategy,
            style: (style === 5 ? 5 : strategy) as Style, score: Number(horse.rank_score) || 0,
            stats: stats as Build['stats'],
            aptitudes: [aptitude(horse[distances[distance]]), aptitude(horse[labels.surface === 'Dirt' ? 'proper_ground_dirt' : 'proper_ground_turf']), aptitude(horse[strategies[strategy - 1]])],
            skills: horse.skill_array.map((skill: any) => [skill.skillId, skill.level]),
            trainedIds: [String(horse.trained_chara_id ?? index)],
            deck: veterans ? parseApiDeck(horse) : horse.deck ?? [],
            parents: veterans ? parseParentEntries(horse.succession_chara_array) : horse.parents ?? [],
            fanCount: Number.isInteger(horse.fan_count) ? horse.fan_count : undefined,
            singleModeWinCount: Number.isInteger(horse.single_mode_win_count ?? horse.wins) ? horse.single_mode_win_count ?? horse.wins : undefined,
        };
        if (!veterans) {
            const team = horse.team_id ?? horse.teamId;
            const viewer = horse.viewer_id ?? horse.viewerId;
            const group = team !== undefined && team !== null ? `Team ${team}` : Number(viewer) > 0 ? `Player ${viewer}` : null;
            if (group) {
                groups.set(group, [...(groups.get(group) ?? []), runner]);
                const name = [horse.trainer_name, horse.owner_trainer_name, horse.trainerName, horse.ownerTrainerName]
                    .find(value => typeof value === 'string' && value.trim());
                if (name) groupNames.set(group, new Set([...(groupNames.get(group) ?? []), name.trim()]));
            }
        }
        return runner;
    });
    return { runners, teams: [...groups].filter(([, members]) => members.length === 3).map(([id, members]) => ({ id, label: [...(groupNames.get(id) ?? [])].join(' / ') || id, runners: members })) };
}

/** Atomic insertion: never replaces existing Umas or invents a backend team ID. */
export function insertLobbyImport(teams: (Performer | null)[], draft: LobbyDraft, runners: Build[], wholeTeam = false): LobbyDraft {
    const slots = teams.flatMap((team, teamIndex) => team ? [] : [0, 1, 2].flatMap(memberIndex => {
        const key = customLobbyRunnerKey(teamIndex, memberIndex);
        return draft.customRunners[key] ? [] : [{ key, teamIndex }];
    }));
    const target = wholeTeam ? [0, 1, 2].map(teamIndex => slots.filter(slot => slot.teamIndex === teamIndex)).find(group => group.length === 3) : slots;
    if (!runners.length || !target || target.length < runners.length || (wholeTeam && runners.length !== 3)) throw new Error(wholeTeam ? 'A completely empty team slot is needed to add a team.' : 'Not enough empty Uma slots in the lobby.');
    const edits = runners.map(runner => createLobbyRunnerEdit(runner)!);
    const next = { ...draft, customRunners: { ...draft.customRunners }, customRunnerOrigins: { ...draft.customRunnerOrigins }, customRunnerSourceKinds: { ...draft.customRunnerSourceKinds }, customRunnerSourceIds: { ...draft.customRunnerSourceIds }, customRunnerStyles: { ...draft.customRunnerStyles }, customRunnerScores: { ...draft.customRunnerScores } };
    runners.forEach((runner, index) => {
        const key = target[index].key;
        next.customRunners[key] = edits[index];
        next.customRunnerOrigins[key] = structuredClone(runner);
        next.customRunnerSourceKinds[key] = 'file';
        next.customRunnerSourceIds[key] = runner.id;
        next.customRunnerStyles[key] = runner.style;
        next.customRunnerScores[key] = runner.score;
    });
    return next;
}

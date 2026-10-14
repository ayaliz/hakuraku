import { courseAptitudeLabels } from './components';
import {
    isBaseUniqueSkillId, LOBBY_APTITUDES, LOBBY_MAX_EDITABLE_SKILLS, LOBBY_RUNNING_STYLES,
    LOBBY_STAT_MIN, LOBBY_STAT_MAX, lowerRarityOwnedUniqueSkillId, ownedUniqueSkillId, type LobbyRunnerEdit,
} from './lobby';
import type { SnapshotMeta } from './types';

type CourseMeta = Pick<SnapshotMeta, 'courseDistance' | 'courseSurface'> & Partial<Pick<SnapshotMeta, 'course'>>;
type UmaFile = { schema: 'hakuraku-lobby-uma/v1'; course: { distance: string; surface: string }; uma: LobbyRunnerEdit; rankScore: number };
const isRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;

function courseScope(meta: CourseMeta) {
    const labels = courseAptitudeLabels({ ...meta, course: meta.course ?? '' });
    const distance = labels.distance === 'Short' ? 'Sprint' : labels.distance;
    if (!['Sprint', 'Mile', 'Medium', 'Long'].includes(distance) || !['Turf', 'Dirt'].includes(labels.surface)) throw new Error('The selected dataset is missing its course aptitude settings.');
    return { distance, surface: labels.surface };
}

function readEdit(value: unknown): LobbyRunnerEdit {
    if (!isRecord(value) || !integer(value.cardId, 1, 2147483647)
        || !Array.isArray(value.stats) || value.stats.length !== 5 || !value.stats.every((stat: unknown) => integer(stat, LOBBY_STAT_MIN, LOBBY_STAT_MAX))
        || !Array.isArray(value.aptitudes) || value.aptitudes.length !== 3 || !value.aptitudes.every((rank: any) => LOBBY_APTITUDES.includes(rank))
        || !LOBBY_RUNNING_STYLES.includes(value.runningStyle)
        || ![ownedUniqueSkillId(value.cardId), lowerRarityOwnedUniqueSkillId(value.cardId)].filter(id => id > 0).includes(value.uniqueSkillId)
        || !integer(value.uniqueSkillLevel, 1, 6)
        || !Array.isArray(value.skills) || value.skills.length > LOBBY_MAX_EDITABLE_SKILLS
        || value.skills.some((skill: unknown) => !Array.isArray(skill) || skill.length !== 2 || !integer(skill[0], 1, 2147483647) || skill[1] !== 1 || isBaseUniqueSkillId(skill[0]))
        || new Set(value.skills.map((skill: number[]) => Math.floor(skill[0] / 10))).size !== value.skills.length
        || ['fanCount', 'singleModeWinCount'].some(field => value[field] !== undefined && !integer(value[field], 0, 2147483647))) {
        throw new Error('This Uma file contains an invalid or unsupported build.');
    }
    return {
        cardId: value.cardId, stats: [...value.stats] as LobbyRunnerEdit['stats'],
        aptitudes: [...value.aptitudes] as LobbyRunnerEdit['aptitudes'], runningStyle: value.runningStyle,
        uniqueSkillId: value.uniqueSkillId, uniqueSkillLevel: value.uniqueSkillLevel,
        skills: value.skills.map(([id, level]: [number, number]) => [id, level]),
        ...(value.fanCount === undefined ? {} : { fanCount: value.fanCount }),
        ...(value.singleModeWinCount === undefined ? {} : { singleModeWinCount: value.singleModeWinCount }),
    };
}

export function createLobbyUmaFile(edit: LobbyRunnerEdit, meta: CourseMeta, rankScore = 0): UmaFile {
    return { schema: 'hakuraku-lobby-uma/v1', course: courseScope(meta), uma: readEdit(edit), rankScore };
}

export function lobbyUmaFilename(name: string, edit: LobbyRunnerEdit): string {
    const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '') || 'Uma';
    return `${safeName}-${edit.stats.join('-')}-${edit.skills.length + 1}.json`;
}

export function readLobbyUmaFile(json: unknown, meta: CourseMeta): UmaFile | null {
    if (!isRecord(json) || typeof json.schema !== 'string' || !json.schema.startsWith('hakuraku-lobby-uma/')) return null;
    if (json.schema !== 'hakuraku-lobby-uma/v1') throw new Error('This Uma export version is not supported.');
    const scope = courseScope(meta);
    if (!isRecord(json.course) || json.course.distance !== scope.distance || json.course.surface !== scope.surface) {
        throw new Error(`This Uma file was exported for ${json.course?.surface ?? 'another surface'} / ${json.course?.distance ?? 'another distance'}. Select a matching dataset to import its saved aptitudes.`);
    }
    return createLobbyUmaFile(readEdit(json.uma), meta, integer(json.rankScore, 0, 2147483647) ? json.rankScore : 0);
}

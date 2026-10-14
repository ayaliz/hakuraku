import assert from 'node:assert/strict';
import test from 'node:test';
import { insertLobbyImport, parseLobbyImport } from './lobbyImport';
import { buildLobbyRaceView, lobbyCustomRunnerBadge, lobbyRunnerSourceMetadata, rearrangeLobbyRunners, toLobbyRunnerOverride } from './lobby';
import type { LobbyDraft } from './lobby';

const meta = { courseDistance: 'Sprint', courseSurface: 'Turf' } as const;
const horse = (overrides = {}) => ({
    card_id: 108701, trained_chara_id: 42, running_style: 1, speed: 1600, stamina: 500, power: 1200, guts: 900, wiz: 1100,
    proper_distance_short: 8, proper_distance_long: 2, proper_ground_turf: 7, proper_ground_dirt: 3,
    proper_running_style_nige: 7, skill_array: [{ skill_id: 100871, level: 6 }, { skill_id: 200851, level: 1 }],
    fans: 123456, wins: 12, ...overrides,
});
const draft = (): LobbyDraft => ({ mood: 'random', seed: '', gates: {}, runnerEdits: {}, customRunners: {}, customRunnerSourceIds: {}, customRunnerStyles: {}, customRunnerScores: {}, customTeamOrigins: {} });
const training = {
    support_card_list: [{ position: 1, support_card_id: 30001, limit_break_count: 4, exp: 100 }],
    succession_chara_array: [{ position_id: 10, card_id: 100101, rank: 1, factor_info_array: [{ factor_id: 101, level: 3 }] }],
};
test('only file imports receive Imported badges, including after moving slots', () => {
    const imported = parseLobbyImport([horse()], meta);
    const next = insertLobbyImport([null, null, null], draft(), imported.runners);
    assert.equal(lobbyCustomRunnerBadge(next, 'custom:0:0'), 'Imported');
    const moved = rearrangeLobbyRunners([null, null, null], next, { teamIndex: 0, memberIndex: 0 }, { teamIndex: 1, memberIndex: 0 })!;
    assert.equal(lobbyCustomRunnerBadge(moved.draft, 'custom:1:0'), 'Imported');
    moved.draft.customRunnerSourceKinds!['custom:1:0'] = 'archetype';
    moved.draft.customRunnerSourceIds['custom:1:0'] = 'backend-build-id';
    assert.equal(lobbyCustomRunnerBadge(moved.draft, 'custom:1:0'), null);
    assert.equal(lobbyCustomRunnerBadge(draft(), 'custom:0:0'), 'Custom');
    assert.equal(lobbyCustomRunnerBadge({ ...draft(), customRunnerSourceIds: { 'custom:0:0': 'backend-build-id' } }, 'custom:0:0'), null);
});
test('imported training metadata survives insertion, gate mapping and moving, but actual edits suppress it', () => {
    const imported = parseLobbyImport([horse(training)], meta);
    const next = insertLobbyImport([null, null, null], draft(), imported.runners);
    const original = structuredClone(next.customRunners['custom:0:0']);
    const metadata = lobbyRunnerSourceMetadata(next, 'custom:0:0');
    assert.deepEqual(metadata.deck, [{ position: 1, id: 30001, lb: 4, exp: 100 }]);
    assert.deepEqual(metadata.parents, [{ positionId: 10, cardId: 100101, rank: 1, factors: [{ id: 101, level: 3 }] }]);
    assert.equal(metadata.modifiedInLobby, undefined);
    const payload: any = {
        seed: 42, runnerOrder: [8, 7, 6, 5, 4, 3, 2, 1, 0], replay: { data: 'unused' }, annotations: { horses: [] },
        sourceRunnerMetadata: [metadata, ...Array.from({ length: 8 }, () => ({}))],
        raceInput: { courseId: 10701, groundCondition: 0, weather: 1, season: 4, horses: Array.from({ length: 9 }, (_, index) => ({
            frameOrder: index, identity: { cardId: 108701, charaId: 1087 }, rawStats: { speed: 1600, stamina: 500, power: 1200, guts: 900, wisdom: 1100 },
            runningStyle: 0, skills: [{ skillId: 100871, level: 6 }], distanceAptitude: 'S', surfaceAptitude: 'A', strategyAptitude: 'A',
        })) },
    };
    const view = buildLobbyRaceView(payload, { ground: 1, distance: 1 });
    assert.deepEqual(view.raceHorseInfo[8].deck, metadata.deck);
    assert.deepEqual(view.raceHorseInfo[8].parents, metadata.parents);
    assert.equal(view.raceHorseInfo[8].modified_in_lobby, undefined);
    const moved = rearrangeLobbyRunners([null, null, null], next, { teamIndex: 0, memberIndex: 0 }, { teamIndex: 1, memberIndex: 2 })!;
    assert.deepEqual(lobbyRunnerSourceMetadata(moved.draft, 'custom:1:2'), metadata);
    assert.equal(moved.draft.customRunnerOrigins?.['custom:0:0'], undefined);
    moved.draft.customRunners['custom:1:2'].stats[0]++;
    assert.deepEqual(lobbyRunnerSourceMetadata(moved.draft, 'custom:1:2'), { deck: [], parents: [], modifiedInLobby: true });
    moved.draft.customRunners['custom:1:2'] = original;
    assert.deepEqual(lobbyRunnerSourceMetadata(moved.draft, 'custom:1:2'), metadata);
});
test('native race imports retain the racedata parser’s support cards and parents', () => {
    const imported = parseLobbyImport({ simDataBase64: 'unused', raceHorse: [{ responseHorseData: horse(), trainedCharaData: {
        supportCardArray: [{ position: 1, supportCardId: 30001, limitBreakCount: 4, exp: 100 }],
        successionCharaList: [{ positionId: 10, cardId: 100101, rank: 1, factorDataArray: [{ factorId: 101, level: 3 }] }],
    } }] }, meta);
    const next = insertLobbyImport([null, null, null], draft(), imported.runners);
    const metadata = lobbyRunnerSourceMetadata(next, 'custom:0:0');
    assert.equal(metadata.deck?.[0].id, 30001);
    assert.equal(metadata.parents?.[0].cardId, 100101);
    assert.equal(metadata.modifiedInLobby, undefined);
});
test('veterans import stats, skills, unique level, fans and selected-course aptitudes', () => {
    const imported = parseLobbyImport([horse()], meta);
    assert.equal(imported.teams.length, 0);
    const next = insertLobbyImport([null, null, null], draft(), imported.runners);
    const edit = next.customRunners['custom:0:0'];
    assert.deepEqual(edit.aptitudes, ['S', 'A', 'A']);
    assert.deepEqual(edit.stats, [1600, 500, 1200, 900, 1100]);
    assert.equal(edit.uniqueSkillLevel, 6);
    assert.deepEqual(edit.skills, [[200851, 1]]);
    assert.equal(toLobbyRunnerOverride(edit).fanCount, 123456);
    assert.equal(toLobbyRunnerOverride(edit).singleModeWinCount, 12);
    assert.equal(parseLobbyImport([horse()], { ...meta, courseDistance: 'Long' }).runners[0].aptitudes[0], 'F');
    assert.equal(parseLobbyImport([horse()], { course: 'CM21 - Chukyo 1,200 m - Turf' }).runners[0].aptitudes[0], 'S');
    assert.equal(parseLobbyImport([horse()], { ...meta, courseDistance: 'Short' } as any).runners[0].aptitudes[0], 'S');
});
test('veterans sort newest first without mutating the export; missing dates stay last', () => {
    const exported = [
        horse({ trained_chara_id: 1, create_time: '2026-10-10T12:00:00Z' }),
        horse({ trained_chara_id: 2 }),
        horse({ trained_chara_id: 3, create_time: '2026-10-13T12:00:00Z' }),
        horse({ trained_chara_id: 4, create_time: '2026-10-13T12:00:00Z' }),
        horse({ trained_chara_id: 5, create_time: 'invalid' }),
    ];
    const result = parseLobbyImport(exported, meta);
    assert.deepEqual(result.runners.map(runner => runner.trainedIds[0]), ['3', '4', '1', '2', '5']);
    assert.deepEqual(exported.map(runner => runner.trained_chara_id), [1, 2, 3, 4, 5]);
});
test('race import order is not changed by creation dates', () => {
    const result = parseLobbyImport({ simDataBase64: 'unused', raceHorse: [
        { responseHorseData: horse({ trained_chara_id: 1, create_time: '2026-10-10T12:00:00Z' }) },
        { responseHorseData: horse({ trained_chara_id: 2, create_time: '2026-10-13T12:00:00Z' }) },
    ] }, meta);
    assert.deepEqual(result.runners.map(runner => runner.trainedIds[0]), ['1', '2']);
});
test('native race format groups actual teams, not adjacent gate positions', () => {
    const raw = { simDataBase64: 'unused-for-import', raceHorse: [1, 2, 1, 2, 1, 2].map(team_id => ({ responseHorseData: horse({ team_id }) })) };
    const imported = parseLobbyImport(raw, meta);
    assert.equal(imported.runners.length, 6);
    assert.deepEqual(imported.teams.map(team => team.runners.length), [3, 3]);
    const next = insertLobbyImport([null, null, null], draft(), imported.teams[0].runners, true);
    assert.equal(Object.keys(next.customRunners).length, 3);
    assert.deepEqual(Object.keys(next.customRunners), ['custom:0:0', 'custom:0:1', 'custom:0:2']);
    assert.deepEqual(next.customTeamOrigins, {});
});
test('API race format and network envelopes share the racedata parser', () => {
    const imported = parseLobbyImport({ data: { race_scenario: 'unused', race_horse_data_array: [horse({ team_id: 1 }), horse({ team_id: 1 }), horse({ team_id: 1 })] } }, meta);
    assert.equal(imported.teams.length, 1);
    assert.deepEqual(imported.runners[0].skills, [[100871, 6], [200851, 1]]);
});
test('unknown ownership does not manufacture teams', () => {
    const imported = parseLobbyImport({ simDataBase64: 'unused', raceHorse: [horse(), horse(), horse()].map(responseHorseData => ({ responseHorseData })) }, meta);
    assert.equal(imported.teams.length, 0);
    assert.equal(imported.runners.length, 3);
});
test('player names label teams without merging players who have identical names', () => {
    const imported = parseLobbyImport({ simDataBase64: 'unused', raceHorse: [1, 2].flatMap(team_id => [1, 2, 3].map(() => ({ responseHorseData: horse({ team_id, trainer_name: 'Same name' }) }))) }, meta);
    assert.deepEqual(imported.teams.map(team => team.label), ['Same name', 'Same name']);
    assert.equal(new Set(imported.teams.map(team => team.id)).size, 2);
});
test('blank names use team numbers and alternate owner names are accepted', () => {
    const imported = parseLobbyImport({ simDataBase64: 'unused', raceHorse: [1, 2].flatMap(team_id => [1, 2, 3].map(() => ({ responseHorseData: horse({ team_id, trainer_name: ' ', owner_trainer_name: team_id === 2 ? ' Owner ' : null }) }))) }, meta);
    assert.deepEqual(imported.teams.map(team => team.label), ['Team 1', 'Owner']);
});
test('Team Trial exports collect runners and keep race-specific team groups separate', () => {
    const imported = parseLobbyImport({ race_start_params_array: [1, 2].map(() => ({ race_horse_data_array: [1, 1, 1].map(team_id => horse({ team_id })) })), race_result_array: [{ race_scenario: 'unused' }, { race_scenario: 'unused' }] }, meta);
    assert.equal(imported.runners.length, 6);
    assert.equal(imported.teams.length, 2);
    assert.equal(new Set(imported.runners.map(runner => runner.id)).size, 6);
});
test('invalid exports and missing target-course aptitudes are rejected', () => {
    assert.throws(() => parseLobbyImport({}, meta));
    assert.throws(() => parseLobbyImport([], meta));
    assert.throws(() => parseLobbyImport([horse({ speed: undefined })], meta), /stats/);
    assert.throws(() => parseLobbyImport([horse({ proper_distance_short: undefined })], meta), /aptitude/);
});
test('insertion is atomic and avoids occupied slots', () => {
    const imported = parseLobbyImport([horse(), horse(), horse()], meta);
    const previous = insertLobbyImport([null, null, null], draft(), [imported.runners[0]]);
    const next = insertLobbyImport([null, null, null], previous, imported.runners, true);
    assert.equal(Object.keys(previous.customRunners).length, 1);
    assert.ok(next.customRunners['custom:1:0']);
    assert.equal(next.customRunners['custom:0:0'], previous.customRunners['custom:0:0']);
    assert.throws(() => insertLobbyImport([{} as any, {} as any, null], next, imported.runners.concat(imported.runners)), /empty/);
});

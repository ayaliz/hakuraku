import assert from 'node:assert/strict';
import test from 'node:test';
import { createLobbyUmaFile, lobbyUmaFilename, readLobbyUmaFile } from './lobbyUmaFile';
import { insertLobbyImport, parseLobbyImport } from './lobbyImport';
import { createBlankLobbyRunnerEdit, toLobbyRunnerOverride, type LobbyDraft } from './lobby';

const meta = { courseDistance: 'Sprint', courseSurface: 'Turf' } as const;
const edit = () => ({ ...createBlankLobbyRunnerEdit(108701), stats: [1555, 444, 1333, 777, 1222] as [number, number, number, number, number], aptitudes: ['S', 'B', 'C'] as ['S', 'B', 'C'], uniqueSkillLevel: 4, skills: [[200851, 1], [900011, 1]] as [number, number][], fanCount: 123456, singleModeWinCount: 12 });
test('edited Uma files round-trip every simulation field through the normal import path', () => {
    const original = edit();
    const file = JSON.parse(JSON.stringify(createLobbyUmaFile(original, meta, 24000)));
    const imported = parseLobbyImport(file, meta);
    assert.equal(imported.autoAdd, true);
    assert.equal(imported.runners.length, 1);
    assert.equal(imported.runners[0].score, 24000);
    const draft: LobbyDraft = { mood: '5', seed: '', gates: {}, runnerEdits: {}, customRunners: {}, customRunnerSourceIds: {}, customRunnerStyles: {}, customRunnerScores: {}, customTeamOrigins: {} };
    const inserted = insertLobbyImport([null, null, null], draft, imported.runners);
    assert.deepEqual(inserted.customRunners['custom:0:0'], original);
    assert.deepEqual(toLobbyRunnerOverride(inserted.customRunners['custom:0:0']), toLobbyRunnerOverride(original));
    assert.deepEqual(imported.runners[0].deck, []);
    assert.deepEqual(imported.runners[0].parents, []);
    original.stats[0]++;
    assert.equal(file.uma.stats[0], 1555);
});
test('export names include all five stats and total skill count with a safe character name', () => {
    assert.equal(lobbyUmaFilename('Special Week', edit()), 'Special Week-1555-444-1333-777-1222-3.json');
    assert.equal(lobbyUmaFilename('A/B: Uma', edit()), 'A_B_ Uma-1555-444-1333-777-1222-3.json');
    const veterans = [{ card_id: 108701, running_style: 1, speed: 1600, stamina: 500, power: 1200, guts: 900, wiz: 1100, proper_distance_short: 8, proper_ground_turf: 7, proper_running_style_nige: 7, skill_array: [{ skill_id: 100871, level: 6 }] }];
    assert.equal(parseLobbyImport(veterans, meta).autoAdd, undefined);
    assert.equal(parseLobbyImport({ simDataBase64: 'unused', raceHorse: [{ responseHorseData: veterans[0] }] }, meta).autoAdd, undefined);
});
test('exported aptitude scope supports Short metadata but rejects different distance or surface', () => {
    const file = createLobbyUmaFile(edit(), meta);
    assert.ok(readLobbyUmaFile(file, { ...meta, courseDistance: 'Short' } as any));
    assert.throws(() => readLobbyUmaFile(file, { ...meta, courseDistance: 'Long' }), /matching dataset/);
    assert.throws(() => readLobbyUmaFile(file, { ...meta, courseSurface: 'Dirt' }), /matching dataset/);
});
test('export validation rejects malformed or incompatible builds and versions', () => {
    assert.equal(readLobbyUmaFile([], meta), null);
    assert.equal(readLobbyUmaFile({ schema: 'room_match_race_raw/v1' }, meta), null);
    const file = createLobbyUmaFile(edit(), meta);
    assert.throws(() => readLobbyUmaFile({ ...file, schema: 'hakuraku-lobby-uma/v2' }, meta), /version/);
    for (const uma of [
        { ...edit(), stats: [NaN, 1, 1, 1, 1] }, { ...edit(), uniqueSkillId: 100011 },
        { ...edit(), skills: [[200851, 2]] }, { ...edit(), skills: [[200851, 1], [200852, 1]] },
        { ...edit(), fanCount: -1 }, { ...edit(), aptitudes: ['X', 'A', 'A'] },
    ]) assert.throws(() => readLobbyUmaFile({ ...file, uma }, meta), /invalid/);
});
test('lower rarity unique skill level is preserved', () => {
    const original = { ...createBlankLobbyRunnerEdit(100101), uniqueSkillId: 10011, uniqueSkillLevel: 3 };
    assert.equal(parseLobbyImport(createLobbyUmaFile(original, meta), meta).runners[0].skills[0][0], 10011);
});

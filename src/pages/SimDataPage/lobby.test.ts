import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildLobbyRaceView,
    changeLobbyRunnerIdentity,
    createBlankLobbyRunnerEdit,
    createLobbyRunnerEdit,
    isLobbyRunnerEditChanged,
    lowerRarityOwnedUniqueSkillId,
    lobbySkillFamilyId,
    lobbySimulationTeamIds,
    ownedUniqueSkillId,
    replaceLobbySkillFamily,
    rearrangeLobbyRunners,
    consumeLobbyRace,
    stageLobbyRace,
    toLobbyRunnerOverride,
    type LobbyDraft,
    type SimDataLobbyRace,
} from './lobby';
import type { Build, Performer } from './types';
import {
    buildSharedDetailedRaceSimulation,
    restoreSharedDetailedRaceSimulation,
    type DetailedRaceSimulationResponse,
} from '../../data/DetailedRaceSimulation';
import {
    formatInternalGroundConditionSummary,
    getGroundConditionLabel,
    normalizeRaceConditionMetadata,
} from '../../data/RaceConditions';
import { courseAptitudeLabels, styleName } from './components';

test('replaces an existing learned skill from the same family', () => {
    assert.equal(lobbySkillFamilyId(200461), lobbySkillFamilyId(200462));
    assert.deepEqual(
        replaceLobbySkillFamily([[200462, 1], [200331, 1]], 200461),
        [[200331, 1], [200461, 1]],
    );
});

test('adds native running style context only to individual Debuffer labels', () => {
    assert.equal(styleName(6, false), 'Debuffer');
    assert.equal(styleName(6, false, 1), 'Debuffer (Front Runner)');
    assert.equal(styleName(4, true, 4), 'End');
});

test('resolves course-specific aptitude labels from structured metadata or the course title', () => {
    assert.deepEqual(courseAptitudeLabels({ course: 'CM19 · Kyoto 2,200 m · Turf · G1' }), {
        surface: 'Turf', distance: 'Medium',
    });
    assert.deepEqual(courseAptitudeLabels({
        course: 'Custom course', courseSurface: 'Dirt', courseDistance: 'Mile',
    }), { surface: 'Dirt', distance: 'Mile' });
});

test('creates a protected-unique build edit and serializes it for the simulator', () => {
    const runner: Build = {
        id: 'build', card: 100602, chara: 1006, style: 4, racingStyle: 4, score: 22000,
        stats: [1601, 632, 1144, 629, 973], aptitudes: ['S', 'A', 'A'], trainedIds: [],
        skills: [[200331, 1], [900011, 1], [110061, 5]],
    };
    assert.equal(ownedUniqueSkillId(runner.card), 110061);
    const edit = createLobbyRunnerEdit(runner);
    assert.ok(edit);
    assert.equal(edit.uniqueSkillId, 110061);
    assert.equal(edit.uniqueSkillLevel, 5);
    assert.equal(edit.runningStyle, 4);
    assert.deepEqual(edit.skills, [[200331, 1], [900011, 1]]);
    assert.equal(isLobbyRunnerEditChanged(runner, edit), false);
    assert.equal(isLobbyRunnerEditChanged(runner, { ...edit, runningStyle: 1 }), true);
    const changed = changeLobbyRunnerIdentity(edit, 100101);
    changed.stats[0] = 1999;
    assert.equal(isLobbyRunnerEditChanged(runner, changed), true);
    assert.deepEqual(toLobbyRunnerOverride(changed), {
        identity: { cardId: 100101, charaId: 1001 },
        rawStats: { speed: 1999, stamina: 632, power: 1144, guts: 629, wisdom: 973 },
        runningStyle: 3,
        distanceAptitude: 'S', surfaceAptitude: 'A', strategyAptitude: 'A',
        uniqueSkillId: 100011, uniqueSkillLevel: 5,
        skills: [{ skillId: 200331, level: 1 }, { skillId: 900011, level: 1 }],
    });
});

test('removing or moving an imported runner materializes affected teams without losing analytical styles', () => {
    const build = (id: string, card: number, style: Build['style'] = 1): Build => ({
        id, card, chara: Math.floor(card / 100), style, racingStyle: 1, score: 20_000,
        stats: [1200, 1200, 1200, 1200, 1200], aptitudes: ['A', 'A', 'A'], trainedIds: [], skills: [],
    });
    const team = (id: string, start: number): Performer => ({
        id, owner: { id: `p${start}`, names: [`Player ${start}`] },
        members: [build(`b${start}`, 100101, start === 1 ? 6 : 1), build(`b${start + 1}`, 100201), build(`b${start + 2}`, 100301)],
        wins: 1, n: 3, ci: [0, 1], memberWins: [1, 0, 0],
    });
    const first = team('a'.repeat(64), 1);
    const second = team('b'.repeat(64), 4);
    const draft: LobbyDraft = {
        mood: '5', seed: '', gates: { [`${first.id}:0`]: 2, [`${second.id}:1`]: 7 },
        runnerEdits: {}, customRunners: {}, customRunnerSourceIds: {}, customRunnerStyles: {}, customRunnerScores: {}, customTeamOrigins: {},
    };
    const removed = rearrangeLobbyRunners([first, second, null], draft, { teamIndex: 0, memberIndex: 1 }, null);
    assert.ok(removed);
    assert.equal(removed.teams[0], null);
    assert.equal(removed.teams[1], second);
    assert.deepEqual(Object.values(removed.draft.customRunnerSourceIds).sort(), ['b1', 'b3']);
    assert.equal(removed.draft.customRunnerStyles['custom:0:0'], 6);
    assert.equal(removed.draft.customRunnerScores['custom:0:0'], 20_000);
    assert.equal(removed.draft.gates['custom:0:0'], 2);

    const swapped = rearrangeLobbyRunners([first, second, null], draft, { teamIndex: 0, memberIndex: 0 }, { teamIndex: 1, memberIndex: 1 });
    assert.ok(swapped);
    assert.deepEqual(swapped.teams, [null, null, null]);
    assert.equal(swapped.draft.customRunnerSourceIds['custom:0:0'], 'b5');
    assert.equal(swapped.draft.customRunnerSourceIds['custom:1:1'], 'b1');
    assert.equal(swapped.draft.customRunnerStyles['custom:1:1'], 6);
    assert.equal(swapped.draft.customRunnerScores['custom:1:1'], 20_000);
    assert.equal(swapped.draft.gates['custom:0:0'], 7);
    assert.equal(swapped.draft.gates['custom:1:1'], 2);
    assert.deepEqual(lobbySimulationTeamIds(swapped.teams, swapped.draft), [first.id, second.id, null]);

    const restored = rearrangeLobbyRunners(swapped.teams, swapped.draft, { teamIndex: 0, memberIndex: 0 }, { teamIndex: 1, memberIndex: 1 });
    assert.ok(restored);
    assert.deepEqual(restored.teams, [first, second, null]);
    assert.deepEqual(restored.draft.customRunners, {});
    assert.deepEqual(restored.draft.customRunnerScores, {});
    assert.deepEqual(restored.draft.customTeamOrigins, {});
    assert.equal(restored.draft.gates[`${first.id}:0`], 2);
    assert.equal(restored.draft.gates[`${second.id}:1`], 7);
});

test('creates a complete default build for a custom lobby Uma', () => {
    assert.deepEqual(createBlankLobbyRunnerEdit(100602), {
        cardId: 100602,
        stats: [1200, 1200, 1200, 1200, 1200],
        aptitudes: ['A', 'A', 'A'],
        runningStyle: 1,
        uniqueSkillId: 110061,
        uniqueSkillLevel: 6,
        skills: [],
    });
});

test('edits a derived Runaway as Front Runner so its learned skill remains authoritative', () => {
    const runner: Build = {
        id: 'runaway', card: 100101, chara: 1001, style: 5, racingStyle: 5, score: 22000,
        stats: [1600, 700, 1100, 600, 1200], aptitudes: ['S', 'A', 'A'], trainedIds: [],
        skills: [[202051, 1], [100011, 5]],
    };
    const edit = createLobbyRunnerEdit(runner);
    assert.ok(edit);
    assert.equal(edit.runningStyle, 1);
    assert.deepEqual(edit.skills, [[202051, 1]]);
    assert.equal(toLobbyRunnerOverride(edit).runningStyle, 0);
});

test('protects a source lower-rarity unique and fixes every learned skill at level 1', () => {
    const runner: Build = {
        id: 'build', card: 101101, chara: 1011, style: 4, racingStyle: 4, score: 18000,
        stats: [1200, 700, 1000, 600, 900], aptitudes: ['A', 'A', 'A'], trainedIds: [],
        skills: [[10111, 5], [200331, 6], [900011, 3]],
    };
    assert.equal(lowerRarityOwnedUniqueSkillId(runner.card), 10111);
    const edit = createLobbyRunnerEdit(runner);
    assert.ok(edit);
    assert.equal(edit.uniqueSkillId, 10111);
    assert.equal(edit.uniqueSkillLevel, 5);
    assert.deepEqual(edit.skills, [[200331, 1], [900011, 1]]);
});

test('maps an ephemeral simulator response into RaceData display input', () => {
    const horse = {
        horseIndex: 0, frameOrder: 0, gateNumber: 1, popularity: 1, teamId: 2, teamMemberId: 3,
        singleModeWinCount: 12, singleModeTeamRank: 4, fanCount: 12345,
        identity: { charaId: 1006, cardId: 100602 }, runningStyle: 3,
        rawStats: { speed: 1500, stamina: 700, power: 1100, guts: 600, wisdom: 1200 },
        motivation: 4, distanceAptitude: 0, surfaceAptitude: 1, strategyAptitude: 2,
        skills: [{ skillId: 10061, level: 5 }],
    };
    const payload = {
        snapshotId: 'cm19-test', engineBuild: 'build', seed: 42,
        teamIds: ['a', 'b', 'c'], runnerOrder: [8, 7, 6, 5, 4, 3, 2, 1, 0],
        sourceRunnerMetadata: Array.from({ length: 9 }, (_, index) => ({
            deck: [{ position: 1, id: 30000 + index, lb: 4, exp: 0 }],
            parents: [{ positionId: 10, cardId: 100100 + index, rank: 1, factors: [{ id: 101, level: 3 }] }],
            ...(index === 8 ? { modifiedInLobby: true } : {}),
        })),
        raceInput: { courseId: 10808, groundCondition: 0, weather: 1, season: 3,
            horses: Array.from({ length: 9 }, (_, index) => ({ ...horse, horseIndex: index, frameOrder: index, gateNumber: index + 1 })) },
        replay: { data: 'compressed' }, annotations: { schemaVersion: 1, flags: {}, horses: [] },
    } as SimDataLobbyRace;

    const view = buildLobbyRaceView(payload, { ground: 1, distance: 3 });
    assert.equal(view.detectedCourseId, 10808);
    assert.deepEqual(view.trackDetails, { condition: '1', weather: '1', season: '3' });
    assert.equal(view.raceHorseInfo.length, 9);
    assert.deepEqual(view.raceHorseInfo[0], {
        frame_order: 1, gate_number: 1, team_id: 2, team_member_id: 3, trained_chara_id: 1,
        viewer_id: 0, trainer_name: 'Team 2', chara_id: 1006, card_id: 100602,
        has_viewer_id: false, popularity: 1, team_rank: 4,
        running_style: 4, motivation: 4, single_mode_win_count: 12, fan_count: 12345,
        speed: 1500, stamina: 700, pow: 1100, guts: 600, wiz: 1200,
        apt_distance: 8, apt_ground: 7, apt_style: 6,
        proper_distance_middle: 8, proper_ground_turf: 7, proper_running_style_oikomi: 6,
        skill_array: [{ skillId: 10061, level: 5 }],
        modified_in_lobby: true,
        deck: [],
        parents: [],
    });
    assert.deepEqual(view.raceHorseInfo[1].deck, [{ position: 1, id: 30007, lb: 4, exp: 0 }]);
    assert.equal(view.raceHorseInfo[1].modified_in_lobby, undefined);
    assert.equal(JSON.parse(JSON.stringify(view.raceHorseInfo))[0].modified_in_lobby, true);
    assert.equal(view.detailed.replay.data, 'compressed');
});

test('round-trips detailed share annotations without duplicating the replay', () => {
    const detailed: DetailedRaceSimulationResponse = {
        engineBuild: 'build-1',
        seed: 42,
        replay: { data: 'large-base64-replay' },
        annotations: {
            schemaVersion: 3,
            flags: { conservePower: 16 },
            horses: [{ horseIndex: 0, worldTransformDistanceLoss: 1.25, spans: [] }],
        },
        diagnostics: { simulationMilliseconds: 12 },
    };

    const shared = buildSharedDetailedRaceSimulation(detailed);
    assert.equal('replay' in shared, false);
    assert.deepEqual(restoreSharedDetailedRaceSimulation(shared, 'stored-race-scenario'), {
        ...detailed,
        replay: { data: 'stored-race-scenario' },
    });
    assert.equal(restoreSharedDetailedRaceSimulation({ ...shared, schemaVersion: 99 }, 'replay'), null);
});

test('uses the player-facing ground label for internal condition metadata', () => {
    assert.equal(getGroundConditionLabel(1), 'Firm');
    assert.equal(
        formatInternalGroundConditionSummary('Good ground · Great motivation'),
        'Firm ground · Great mood',
    );
    const original = { snapshotId: 'cm19', meta: { conditions: 'Good ground · Great motivation' } };
    assert.deepEqual(normalizeRaceConditionMetadata(original), {
        snapshotId: 'cm19',
        meta: { conditions: 'Firm ground · Great mood' },
    });
    assert.equal(original.meta.conditions, 'Good ground · Great motivation');
    assert.deepEqual(
        normalizeRaceConditionMetadata({ snapshotId: 'cm20-future', meta: { conditions: 'Good ground' } }),
        { snapshotId: 'cm20-future', meta: { conditions: 'Good ground' } },
    );
    assert.deepEqual(
        normalizeRaceConditionMetadata({ snapshotId: 'cm17-20260919', cmId: 'cm17', meta: { course: 'CM17 · Teio Sho 2,000 m · Dirt · G1' } }),
        { snapshotId: 'cm17-20260919', cmId: 'cm17', meta: { course: 'CM17 · Ooi 2,000 m · Dirt' } },
    );
    assert.deepEqual(
        normalizeRaceConditionMetadata({ snapshotId: 'cm20-2026-09-19', cmId: 'cm20', meta: { course: 'CM20 · Nakayama 2,500 m · Turf · G1' } }),
        { snapshotId: 'cm20-2026-09-19', cmId: 'cm20', meta: { course: 'CM20 · Nakayama 2,500 m · Turf' } },
    );
});

test('uses a bounded cross-tab lobby handoff without accumulating session storage', () => {
    class TestStorage {
        values = new Map<string, string>();
        failNextWrite = false;
        get length() { return this.values.size; }
        key(index: number) { return [...this.values.keys()][index] ?? null; }
        getItem(key: string) { return this.values.get(key) ?? null; }
        removeItem(key: string) { this.values.delete(key); }
        setItem(key: string, value: string) {
            if (this.failNextWrite) { this.failNextWrite = false; throw new Error('quota'); }
            this.values.set(key, value);
        }
    }
    const session = new TestStorage();
    const local = new TestStorage();
    session.setItem('hakuraku:simdata-lobby-race:legacy', 'large old replay');
    session.setItem('unrelated', 'keep');
    local.setItem('hakuraku:simdata-lobby-race:abandoned', 'abandoned replay');
    local.setItem('unrelated', 'keep');
    const originalSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    const originalLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    try {
        local.failNextWrite = true;
        const payload = { snapshotId: 'cm19', seed: 42, replay: { data: 'replay' } } as SimDataLobbyRace;
        const token = stageLobbyRace(payload);
        assert.equal(session.getItem('hakuraku:simdata-lobby-race:legacy'), null);
        assert.equal(session.getItem('unrelated'), 'keep');
        assert.equal(local.getItem('hakuraku:simdata-lobby-race:abandoned'), null);
        assert.equal(local.getItem('unrelated'), 'keep');
        assert.deepEqual(consumeLobbyRace(token), payload);
        assert.equal(local.getItem(`hakuraku:simdata-lobby-race:${token}`), null);
        assert.equal(session.length, 1);
        assert.equal(local.length, 1);
    } finally {
        if (originalSession) Object.defineProperty(globalThis, 'sessionStorage', originalSession);
        else delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
        if (originalLocal) Object.defineProperty(globalThis, 'localStorage', originalLocal);
        else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { rankTeams } from './query';
import type { Performer } from './types';
const makeTeam = (id: string, card: number, wins: number, extra: Partial<Performer> = {}): Performer => ({
    id, owner: { id: 'owner', names: [] }, wins, n: 100, ci: [wins / 100 - .1, wins / 100 + .1], memberWins: [wins, 0, 0],
    members: [card, 2, 3].map((card, i) => ({ id: `${id}-${i}`, card, chara: card, style: 1, racingStyle: 1, score: 100 })), ...extra,
});
const teams = [makeTeam('best', 10, 60), makeTeam('other', 20, 40),
    makeTeam('benched', 30, 80, { benched: true }), makeTeam('historical', 30, 90, { historical: true })];
for (const prepared of [false, true]) {
    test(`all teams finds historical and benched representatives (prepared=${prepared})`, () => {
        assert.deepEqual(rankTeams(teams, [{ card: 30 }, {}, {}], false, 'rate', prepared).map(t => t.id), ['historical', 'benched']);
        assert.deepEqual(rankTeams(teams, [{}, {}, {}], false, 'lower', prepared).map(t => t.id), ['historical', 'benched', 'best', 'other']);
    });
    test(`best per player excludes benched teams even when they have higher performance (prepared=${prepared})`, () => {
        assert.deepEqual(rankTeams(teams, [{}, {}, {}], true, 'rate', prepared).map(t => t.id), ['best']);
        assert.deepEqual(rankTeams(teams, [{ card: 30 }, {}, {}], true, 'rate', prepared), []);
    });
}
test('prepared snapshot selects the global best active team before applying filters', () => {
    assert.deepEqual(rankTeams(teams, [{ card: 20 }, {}, {}], true, 'rate', true), []);
    assert.deepEqual(rankTeams(teams, [{ card: 20 }, {}, {}], true, 'rate', false).map(t => t.id), ['other']);
});

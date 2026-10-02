import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AssetLoader from '../../data/AssetLoader';
import { applyPlayerUsage, supportsPlayerUsage, groupUmaUsage, type UmaUsage } from './umaUsage';

const usage: UmaUsage = { snapshotId: 'cm20-test', totalPlayers: 100, pairs: [
    { card: 100101, chara: 1001, style: 2, players: 30 },
    { card: 100201, chara: 1002, style: 1, players: 40 },
    { card: 100101, chara: 1001, style: 3, players: 20 },
    { card: 100102, chara: 1001, style: 4, players: 5 },
] };

test('usage combines styles for ranking while keeping outfits separate and using players as denominator', () => {
    const rows = groupUmaUsage(usage);
    assert.deepEqual(rows.map(row => [row.card, row.players, row.usagePct]), [
        [100101, 50, 50], [100201, 40, 40], [100102, 5, 5],
    ]);
    assert.deepEqual(rows[0].styles.map(pair => pair.players / rows[0].players * 100), [60, 40]);
    assert.deepEqual(groupUmaUsage({ snapshotId: 'empty', totalPlayers: 0, pairs: [] }), []);
});

const hook = registerHooks({ load(url, context, nextLoad) {
    if (url.endsWith('/SimDataPage/data.ts')) return { format: 'module', source: 'export const simDataApiUrl = p => p; export const useSimData = () => ({});', shortCircuit: true };
    return nextLoad(url, context);
} });
const { UmaUsageRows } = await import('./UmaUsageView');
hook.deregister();

test('usage rows render combined player usage and the within-uma style percentages', () => {
    const previous = AssetLoader.getCharaIcon;
    const previousThumb = AssetLoader.getCharaThumb;
    AssetLoader.getCharaIcon = () => '';
    AssetLoader.getCharaThumb = () => '';
    try {
        const html = renderToStaticMarkup(createElement(UmaUsageRows, { usage,
            data: { cards: { 100101: { chara: 1001, name: 'Combined Uma', outfit: 'Original' },
                100201: { chara: 1002, name: 'Single style Uma', outfit: 'Original' } } },
            strategyColors: { 1: '#111', 2: '#222', 3: '#333', 4: '#444' }, onTeams: () => {},
        }));
        assert.ok(html.indexOf('Combined Uma') < html.indexOf('Single style Uma'));
        assert.match(html, /50\.0%/);
        assert.match(html, /Pace Chaser: 60\.0% \(30 players\)/);
        assert.match(html, /Late Surger: 40\.0% \(20 players\)/);
        assert.match(html, /width:60%/);
        assert.match(html, /width:40%/);
    } finally { AssetLoader.getCharaIcon = previous; AssetLoader.getCharaThumb = previousThumb; }
});

test('best-team usage leaves simulation performance denominators unchanged', () => {
    const data = { meta: { populationOwners: 500 }, pairs: [
        { key: '100101:2', style: 2, owners: 99, pop: .1, stylePop: .2, runnerExposures: 900, individualWins: 270, individual: .3 },
    ], archetypes: [{ key: '1-2-3', owners: 200, teamExposures: 1000, teamWins: 500, team: .5 }] };
    const result = applyPlayerUsage(data as any, { ...usage, archetypes: { '1-2-3': 20 } });
    assert.equal(result.pairs[0].owners, 30);
    assert.equal(result.archetypes[0].owners, 20);
    assert.equal(result.meta.populationOwners, 100);
    assert.equal(result.pairs[0].runnerExposures, 900);
    assert.equal(result.pairs[0].individualWins, 270);
    assert.equal(result.pairs[0].individual, .3);
    assert.equal(result.archetypes[0].teamExposures, 1000);
    assert.equal(result.archetypes[0].team, .5);
    assert.equal(data.pairs[0].owners, 99);
});

test('old snapshots remain on existing metrics until publication marks usage ready', () => {
    assert.equal(supportsPlayerUsage({}), false);
    assert.equal(supportsPlayerUsage({ playerUsage: { schemaVersion: 2 } }), false);
    assert.equal(supportsPlayerUsage({ playerUsage: { schemaVersion: 1 } }), true);
});

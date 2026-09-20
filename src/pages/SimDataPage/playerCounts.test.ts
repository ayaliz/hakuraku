import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AssetLoader from '../../data/AssetLoader';
import type { StyleRepEntry } from '../MultiRacePage/components/WinDistributionCharts/StyleRepsPanel';
import { CompositionTable } from './components';

const cssHook = registerHooks({ load(url, context, nextLoad) {
    if (url.endsWith('/features/umalogs/api/config.ts')) {
        return { format: 'module', source: 'export const UMA_LOGS_API_BASE = "";', shortCircuit: true };
    }
    return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
} });
const { StyleRepsPanel } = await import('../MultiRacePage/components/WinDistributionCharts/StyleRepsPanel');
const { default: StyleTrioSynergy } = await import('./StyleTrioSynergy');
const { CharacterBreakdownPanel } = await import('../MultiRacePage/components/WinDistributionCharts/CharacterBreakdownPanel');
cssHook.deregister();

test('Uma Breakdown ranks by players without using them as win-rate denominators', () => {
    const previous = AssetLoader.getCharaThumb;
    const previousIcon = AssetLoader.getCharaIcon;
    AssetLoader.getCharaThumb = () => '';
    AssetLoader.getCharaIcon = () => '';
    try {
        const slice = (key: string, label: string, value: number) => ({
            charaId: key, label, value, percentage: 50, color: '#fff', strategyId: 1, cardId: 100101,
        });
        const markup = renderToStaticMarkup(createElement(CharacterBreakdownPanel, {
            title: 'Uma Breakdown', strategyColors: { 1: '#fff' }, useBayesianWinRate: false,
            rawPopSlices: [slice('1001_100101_1', 'Fewer players', 200000), slice('1002_100201_1', 'More players', 100000)],
            rawWinsSlices: [slice('1001_100101_1', 'Fewer players', 20000), slice('1002_100201_1', 'More players', 10000)],
            playerCounts: { '1001_100101_1': 17, '1002_100201_1': 42 }, populationLabel: 'Players', shareLabel: 'Players',
        }));
        assert.match(markup, /Most used/);
        assert.match(markup, />42 Players</);
        assert.match(markup, />17 Players</);
        assert.match(markup, /10\.0%/);
        assert.ok(markup.indexOf('More players') < markup.indexOf('Fewer players'));
        assert.doesNotMatch(markup, /\(200000\)|\(100000\)|Corpus Share/);
        assert.doesNotMatch(markup, /\(20000\)|\(10000\)/);
    } finally { AssetLoader.getCharaThumb = previous; AssetLoader.getCharaIcon = previousIcon; }
});

test('simulation representatives show distinct players in both headings and counts', () => {
    const previous = AssetLoader.getCharaThumb;
    AssetLoader.getCharaThumb = () => '';
    try {
        const entry: StyleRepEntry = { cardId: 100101, charaId: 1001, charaName: 'Test Uma', wins: 50,
            appearances: 123456, players: 17, popPct: 100, winRate: .1, bayesianWinRate: .1,
            expectedWinRate: 1 / 9, scoreAdjustedWinRate: .1, scoreAdjustedLift: 0,
            teamWins: 100, teamAppearances: 654321, teamWinRate: .4, teamBayesianWinRate: .4 };
        const markup = renderToStaticMarkup(createElement(StyleRepsPanel, {
            styleReps: { 1: [entry] }, strategyColors: { 1: '#fff' }, useAdjustedRates: false, showPlayers: true,
        }));
        assert.match(markup, />Players</);
        assert.match(markup, />17</);
        assert.doesNotMatch(markup, />654,321</);
        const legacy = renderToStaticMarkup(createElement(StyleRepsPanel, {
            styleReps: { 1: [entry] }, strategyColors: { 1: '#fff' }, useAdjustedRates: false,
        }));
        assert.match(legacy, />Appearances</);
        assert.match(legacy, />654,321</);
    } finally { AssetLoader.getCharaThumb = previous; }
});

test('style synergy uses the shared picker and performance groups with distinct players', () => {
    const previous = AssetLoader.getCharaIcon;
    const previousThumb = AssetLoader.getCharaThumb;
    AssetLoader.getCharaIcon = () => '';
    AssetLoader.getCharaThumb = () => '';
    try {
        const row = { key: '1-1-2', name: 'Test', owners: 42, teamExposures: 123456,
            teamWins: 100, team: .4, teamAdjusted: .4, teamCI: [.3, .5] as [number, number], teamPop: .1 };
        const pair = { ...row, key: '100101:1', name: 'Test Uma', card: 100101, chara: 1001, style: 1 as const,
            outfit: 'Test outfit', stylePop: .1, evaluatedTeams: 2, evaluatedOwners: 42,
            runners: 1, runnerExposures: 123456, individualWins: 50, individual: .1, individualAdjusted: .1,
            individualCI: [.05, .15] as [number, number], pop: .1, winShare: .1 };
        const markup = renderToStaticMarkup(createElement(StyleTrioSynergy, {
            pairs: [pair], selected: pair, rows: [row, { ...row, key: '1-2-2', team: .2 }],
            retry: () => {}, onPair: () => {}, onTeams: () => {},
        }));
        assert.match(markup, /syn-select/);
        assert.match(markup, /OVERPERFORMERS/);
        assert.match(markup, /UNDERPERFORMERS/);
        assert.match(markup, />Players</);
        assert.match(markup, />42</);
        assert.doesNotMatch(markup, /123,456/);
    } finally { AssetLoader.getCharaIcon = previous; AssetLoader.getCharaThumb = previousThumb; }
});

test('composition table shows players once, not simulated appearances', () => {
    const markup = renderToStaticMarkup(createElement(CompositionTable, {
        rows: [{ key: '1-1-2', name: 'Test', owners: 42, teamExposures: 123456,
            teamWins: 100, team: .4, teamAdjusted: .4, teamCI: [.3, .5], teamPop: .1 }],
        onSelect: () => {},
    }));
    assert.match(markup, />Players</);
    assert.match(markup, />42</);
    assert.doesNotMatch(markup, />Appearances</);
    assert.doesNotMatch(markup, />123,456</);
});

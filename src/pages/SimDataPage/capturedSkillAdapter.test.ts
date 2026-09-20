import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptOverview, adaptDetail, type Overview, type Detail } from './capturedSkillAdapter';
const overview: Overview = { snapshotId: 'test', races: 100, players: 4, courseDistance: 1200, allPlayerCounts: { 123: 4 }, rows: [[123, 'Nige', 3, 100, 40, 60, 20, 10, 5, 20, 10], [123, 'Oonige', 2, 50, 20, 20, 0, 5, 2, 8, 3]] };
const detail: Detail = { snapshotId: 'test', skillId: 123, bucketCount: 100, courseDistance: 1200, styles: { Nige: [[-1, 10, 10, 2, 4], [20, 50, 30, 8, 16]], Oonige: [[30, 20, 20, 5, 8]] } };
test('players are union counts, proc rate counts runners rather than repeated events', () => {
    const result = adaptOverview(overview, new Map(), () => 'Test');
    assert.equal(result.players.get(123)?.all, 4);
    assert.deepEqual(result.players.get(123)?.byStrategy, { 1: 3, 5: 2 });
    assert.equal(result.stats.get(123)?.timesActivated, 80);
    assert.equal(result.stats.get(123)?.uniqueHorses, 60);
    assert.equal(result.stats.get(123)?.activationOpportunities, 150);
    assert.ok(Number.isNaN(result.stats.get(123)!.meanDistance));
});
test('range outcomes use distinct first procs, with setup at the start of the course', () => {
    const result = adaptDetail(detail, overview, 123);
    assert.equal(result.buckets.all[20], 50);
    assert.equal(result.rangeBuckets?.all[20], 30);
    assert.equal(result.rangeBuckets?.win[20], 8);
    assert.equal(result.buckets.all[0], 10);
    assert.equal(result.rangeBuckets?.winByStrategy?.['5'][30], 5);
    assert.deepEqual(result.winBreakdown?.[0].total, { apps: 60, wins: 15 });
    assert.deepEqual(result.winBreakdown?.[1].total, { apps: 90, wins: 7 });
    const stats = adaptOverview(overview, new Map([[123, result]]), () => 'Test').stats.get(123)!;
    assert.ok(Number.isFinite(stats.meanDistance));
});
test('wrong snapshots and invalid outcome counts are rejected', () => {
    assert.throws(() => adaptDetail({ ...detail, snapshotId: 'other' }, overview, 123));
    assert.throws(() => adaptDetail({ ...detail, styles: { Nige: [[20, 5, 6, 1, 0]] } }, overview, 123));
});
test('grouped variants separate activated, learned-inactive and unlearned runner cohorts', () => {
    const grouped: Overview = { ...overview, rows: [[123, 'Nige', 3, 100, 40, 70, 20, 10, 5, 20, 10]], variants: { 123: [122, 123] }, populationByStyle: { Nige: [200, 25], Oikomi: [50, 4] } };
    const groupedDetail: Detail = { ...detail, styles: { Nige: [[20, 70, 40, 10, 20]] }, variants: {
        122: { rows: [[122, 'Nige', 0, 60, 30, 40, 10, 8, 2, 15, 5]], styles: { Nige: [[20, 40, 30, 8, 15]] } },
        123: { rows: [[123, 'Nige', 0, 50, 20, 30, 10, 5, 2, 10, 5]], styles: { Nige: [[20, 30, 20, 5, 10]] } },
    } };
    const result = adaptDetail(groupedDetail, grouped, 123, id => id === 122 ? 'White' : 'Gold');
    assert.deepEqual(result.winBreakdown?.map(r => r.label), ['White · activated', 'Gold · activated', 'Either activated (learned)', 'Learned, not activated', 'Not learned (neither variant)']);
    assert.deepEqual(result.winBreakdown?.[2].total, { apps: 40, wins: 10 }); // Not 30 + 20.
    assert.deepEqual(result.winBreakdown?.[3].total, { apps: 60, wins: 5 });
    assert.deepEqual(result.winBreakdown?.[4].total, { apps: 150, wins: 14 });
    assert.deepEqual(result.winBreakdown?.[4].cellsByStrategy['4'], { apps: 50, wins: 4 });
    assert.equal(result.winBreakdown!.slice(2).reduce((sum, row) => sum + row.total!.apps, 0), 250);
    assert.equal(result.winBreakdown!.slice(2).reduce((sum, row) => sum + row.total!.wins, 0), 29);
    assert.equal(result.rangeBuckets?.byVariant?.['122'].all[20], 30);
    assert.equal(result.rangeBuckets?.all[20], 40);
    assert.deepEqual(adaptOverview(grouped, new Map(), id => String(id)).stats.get(123)?.skillNames, ['123', '122']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { teamBenchMessage, teamEvaluationLabel } from './teamEvaluationLabel';
import type { Performer } from './types';

const team = { n: 100 } as Performer;
test('search labels identify benched teams and their last actual evaluation date', () => {
    assert.equal(teamEvaluationLabel({ ...team, benched: true, benchReason: 'retained-team cap', evaluatedSnapshotId: 'cm20-2026-09-24' }, 'cm20-2026-10-05'),
        'Paused due to maximum per-player team cap - Last simulated 2026-09-24');
});
test('search labels use historical provenance and the selected snapshot for active results', () => {
    assert.equal(teamEvaluationLabel({ ...team, historical: true, evaluatedSnapshotId: 'cm20-2026-10-01' }, 'cm20-2026-10-05'),
        'Last simulated 2026-10-01');
    assert.equal(teamEvaluationLabel(team, 'cm20-2026-10-05'), 'Last simulated 2026-10-05');
});
test('search labels do not invent dates for unsimulated or provenance-less historical teams', () => {
    assert.equal(teamEvaluationLabel({ ...team, n: 0 }, 'cm20-2026-10-05'), 'Not yet simulated');
    assert.equal(teamEvaluationLabel({ ...team, benched: true }, 'cm20-2026-10-05'), 'Benched due to final bench decision - Last simulated date unavailable');
    assert.equal(teamEvaluationLabel({ ...team, historical: true }, 'cm20-2026-10-05'), 'Last simulated date unavailable');
});

test('bench messages distinguish cap from performance and keep decision date separate from last simulation', () => {
    const benched = { ...team, benched: true, benchDate: '2026-10-03', evaluatedSnapshotId: 'cm20-2026-09-27' };
    assert.equal(teamBenchMessage({ ...benched, benchReason: 'retained-team cap' }),
        'Paused after 2026-10-03 due to maximum per-player team cap; eligible for prescreening review');
    assert.equal(teamBenchMessage({ ...benched, benchReason: '95% interval separated from leader by more than 1 percentage point' }),
        "Removed from future simulations after 2026-10-03 due to performance gap to player's best team");
});

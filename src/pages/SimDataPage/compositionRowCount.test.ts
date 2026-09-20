import assert from 'node:assert/strict';
import test from 'node:test';
import { compositionRowCount } from '../MultiRacePage/components/WinDistributionCharts/compositionRowCount';

test('composition columns fit every overperformer and follow the ten-row rule', () => {
    assert.equal(compositionRowCount(14, 20), 14);
    assert.equal(compositionRowCount(14, 3), 14);
    assert.equal(compositionRowCount(4, 15), 10);
    assert.equal(compositionRowCount(4, 7), 7);
    assert.equal(compositionRowCount(7, 4), 7);
    assert.equal(compositionRowCount(0, 20), 10);
    assert.equal(compositionRowCount(0, 0), 0);
});

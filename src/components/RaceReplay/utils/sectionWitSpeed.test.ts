import assert from 'node:assert/strict';
import test from 'node:test';
import { sectionWitSpeedAddend } from './sectionWitSpeed';

test('reported +0.328% roll is +0.064 m/s on a 2500m course, not +0.328 m/s', () => {
    assert.ok(Math.abs(sectionWitSpeedAddend(2500, 0.328) - 0.06396) < 1e-12);
    assert.equal(sectionWitSpeedAddend(2500, 0.328).toFixed(3), '0.064');
});

test('conversion uses distance-dependent race base speed', () => {
    assert.ok(Math.abs(sectionWitSpeedAddend(1200, 0.328) - 0.068224) < 1e-12);
    assert.ok(Math.abs(sectionWitSpeedAddend(2000, 0.328) - 0.0656) < 1e-12);
});

test('zero and negative wit rolls retain their sign and units', () => {
    assert.equal(sectionWitSpeedAddend(2500, 0), 0);
    assert.equal(sectionWitSpeedAddend(2000, -0.65), -0.13);
});

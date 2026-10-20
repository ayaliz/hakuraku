import assert from 'node:assert/strict';
import test from 'node:test';
import { isHpApplicationBeforeFinish } from './hpApplicationTiming';

test('Mystifying Murmur in the reported race is excluded for finished gates, not gate 7', () => {
    const hitTime = 121.87593078613281;
    const finishTimes = [122.27262115478516, 121.62511444091797, 123.40843200683594,
        121.5303726196289, 124.59803009033203, 120.83854675292969,
        122.97247314453125, 122.01971435546875, 121.21153259277344];
    for (const gate of [2, 4, 6, 9]) assert.equal(isHpApplicationBeforeFinish(hitTime, finishTimes[gate - 1]), false);
    assert.equal(isHpApplicationBeforeFinish(hitTime, finishTimes[6]), true);
    // Their earlier in-race drains still belong in the HP breakdown.
    for (const gate of [2, 4, 6, 9]) assert.equal(isHpApplicationBeforeFinish(29.503936767578125, finishTimes[gate - 1]), true);
});

test('finish boundary uses the individual runner time, without rounding away earlier hits', () => {
    assert.equal(isHpApplicationBeforeFinish(100, 100), false);
    assert.equal(isHpApplicationBeforeFinish(100.001, 100), false);
    assert.equal(isHpApplicationBeforeFinish(99.999, 100), true);
});

test('missing finish metadata does not suppress valid recorded HP applications', () => {
    for (const finishTime of [undefined, 0, NaN]) assert.equal(isHpApplicationBeforeFinish(100, finishTime), true);
    assert.equal(isHpApplicationBeforeFinish(NaN, 100), false);
});

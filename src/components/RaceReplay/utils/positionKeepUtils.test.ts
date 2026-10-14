import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpeedUpCheckRanges, type SpeedUpCheckHorse } from './positionKeepUtils';
const horse = (index: number, runningStyle: number, distance: number, temptationMode = 0, isRunaway = false): SpeedUpCheckHorse => ({ index, runningStyle, distance, temptationMode, isRunaway });
test('one ordinary front uses 12.5 m, even with a runaway in the field', () => {
    assert.equal(getSpeedUpCheckRanges([horse(0, 1, 100, 3), horse(1, 1, 120, 0, true)], 2500).get(0), 12.5);
    assert.equal(getSpeedUpCheckRanges([horse(0, 1, 120), horse(1, 1, 100, 0, true)], 2500).get(0), 12.5);
});
test('a rushed non-front with no ordinary fronts uses 4.5 m; runaway always uses 17.5 m', () => {
    const ranges = getSpeedUpCheckRanges([horse(0, 2, 90, 3), horse(1, 1, 120, 0, true)], 2500);
    assert.equal(ranges.get(0), 4.5); assert.equal(ranges.get(1), 17.5);
});
test('two rushed fronts each show 4.5 m, not a distance-scaled value', () => {
    for (const distance of [1200, 2500, 3200]) {
        assert.deepEqual([...getSpeedUpCheckRanges([horse(0, 1, 100, 3), horse(1, 1, 90, 4)], distance).values()], [4.5, 4.5]);
    }
});
test('only the leading ordinary front qualifies without rush, and non-front leaders do not qualify', () => {
    assert.deepEqual([...getSpeedUpCheckRanges([horse(0, 1, 100), horse(1, 1, 90)], 2500).keys()], [0]);
    assert.equal(getSpeedUpCheckRanges([horse(0, 2, 120), horse(1, 1, 90)], 2500).size, 0);
});
test('rush-as-late and rush-as-pace are excluded, rush boost is eligible', () => {
    const ranges = getSpeedUpCheckRanges([horse(0, 4, 100, 1), horse(1, 4, 90, 2), horse(2, 4, 80, 4)], 2500);
    assert.deepEqual([...ranges], [[2, 4.5]]);
});
test('ranges stop at each runner’s position-keep end and reject invalid course length', () => {
    assert.equal(getSpeedUpCheckRanges([horse(0, 1, 500, 3)], 1200).size, 0);
    assert.equal(getSpeedUpCheckRanges([horse(0, 1, 499, 3)], 1200).get(0), 12.5);
    assert.equal(getSpeedUpCheckRanges([horse(0, 1, 100)], 0).size, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaceSimulateData } from './race_data_pb';
import type { DetailedHorseMetrics } from './DetailedRaceSimulation';
import { freezeHpAtFinish } from './FinishHp';

function replay() {
    return { horseResult: [{ finishTimeRaw: 10 }, { finishTimeRaw: 12 }],
        frame: [9, 10, 11, 12, 13].map(time => ({ time,
            horseFrame: [{ hp: time < 11 ? 33 : 0 }, { hp: 100 - time }] })) } as RaceSimulateData;
}
function metrics(finalHp: number, deltas: Array<[number, number]>) {
    return { 0: { horseIndex: 0, worldTransformDistanceLoss: 0, finalHp, hpExhaustedTime: 11, hpExhaustedDistance: 2600, hpDeficit: 5,
        hpSkillApplications: deltas.map(([time, appliedHpDelta]) => ({ time, appliedHpDelta,
            requestedHpDelta: appliedHpDelta * 3, casterHorseIndex: 1, targetHorseIndex: 0, skillId: 201161 })) } } as Record<number, DetailedHorseMetrics>;
}

test('reported zero-HP finishers recover their precise finish HP from clamped applied drains', () => {
    for (const hp of [33.171607971191406, 71.02568054199219, 88.0364761352539]) {
        const race = replay(), original = metrics(0, [[11, -hp]]);
        const locked = freezeHpAtFinish(race, original);
        assert.equal(locked.metrics![0].finalHp, hp);
        assert.equal(locked.metrics![0].hpExhaustedTime, null);
        assert.equal(locked.metrics![0].hpDeficit, 0);
        assert.equal(locked.raceData!.frame[2].horseFrame[0].hp, hp);
        assert.equal(locked.raceData!.frame[2].horseFrame[1].hp, 89, 'still-racing opponent is untouched');
        assert.equal(original[0].finalHp, 0, 'raw simulator output stays intact');
        assert.equal(race.frame[2].horseFrame[0].hp, 0, 'raw replay stays intact');
    }
});

test('late heals and drains are both reversed; pre-finish effects and exhaustion are retained', () => {
    const original = metrics(110, [[9, -20], [11, 100], [12, -40]]);
    original[0].hpExhaustedTime = 8; original[0].hpExhaustedDistance = 1800;
    const locked = freezeHpAtFinish(replay(), original);
    assert.equal(locked.metrics![0].finalHp, 50);
    assert.equal(locked.metrics![0].hpExhaustedTime, 8);
    assert.equal(locked.metrics![0].hpDeficit, 5);
});

test('recorded races freeze the crossing sample separately for each runner', () => {
    const locked = freezeHpAtFinish(replay(), undefined).raceData!;
    assert.equal(locked.frame[4].horseFrame[0].hp, 33);
    assert.equal(locked.frame[4].horseFrame[1].hp, 88);
});

test('HP changes at the finish boundary are excluded and absent replay is safe', () => {
    assert.equal(freezeHpAtFinish(replay(), metrics(0, [[10, -33]])).metrics![0].finalHp, 33);
    assert.equal(freezeHpAtFinish(undefined, undefined).raceData, undefined);
});

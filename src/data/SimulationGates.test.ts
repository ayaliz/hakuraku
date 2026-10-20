import assert from "node:assert/strict";
import test from "node:test";
import { horseInfoWithSimulationGates, randomSimulationGates, readRandomGatesPreference, saveRandomGatesPreference, validateSimulationGates, withSimulationGates } from "./SimulationGates";

test("remembers both gate preferences and defaults to off for a new browser", () => {
    const items = new Map<string, string>();
    const storage = { getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => { items.set(key, value); } };
    assert.equal(readRandomGatesPreference(storage), false);
    saveRandomGatesPreference(true, storage);
    assert.equal(readRandomGatesPreference(storage), true);
    saveRandomGatesPreference(false, storage);
    assert.equal(readRandomGatesPreference(storage), false);
});

test("blocked browser storage does not break the toggle", () => {
    assert.equal(readRandomGatesPreference({ getItem: () => { throw new Error("Blocked"); } }), false);
    assert.doesNotThrow(() => saveRandomGatesPreference(true, { setItem: () => { throw new Error("Blocked"); } }));
});

test("random gate draws are complete permutations", () => {
    for (const count of [3, 9, 18]) {
        for (let index = 0; index < 20; index++) validateSimulationGates(randomSimulationGates(count), count);
    }
    assert.throws(() => validateSimulationGates([1, 1, 3]));
    assert.throws(() => validateSimulationGates([0, 2, 3]));
});

test("gate override follows original gates rather than capture array order and preserves metadata", () => {
    const capture = { random_seed: 123, race_scenario: "original", race_horse_data_array: [
        { frame_order: 3, card_id: 30, fan_count: 300 },
        { frame_order: 1, card_id: 10, fan_count: 100 },
        { frame_order: 2, card_id: 20, fan_count: 200 },
    ] };
    const result = withSimulationGates(capture, [3, 1, 2]) as typeof capture;
    assert.deepEqual(result.race_horse_data_array.map(h => [h.card_id, h.frame_order, h.fan_count]), [[10, 3, 100], [20, 1, 200], [30, 2, 300]]);
    assert.equal(capture.race_horse_data_array[0].frame_order, 3);
    assert.equal(result.race_scenario, "original");
    assert.equal(withSimulationGates(capture), capture);
});

test("HorseACT training metadata remains attached to the right runner", () => {
    const capture = { raceHorse: [1, 2, 3].map(id => ({
        _responseHorseData: { frame_order: id, card_id: id }, trainedCharaData: { fans: id * 100 },
    })) };
    const result = withSimulationGates(capture, [2, 3, 1]) as typeof capture;
    assert.equal(result.raceHorse[0]._responseHorseData.frame_order, 2);
    assert.equal(result.raceHorse[0].trainedCharaData.fans, 100);
    const info = horseInfoWithSimulationGates([{ frame_order: 3, card_id: 30 }, { frame_order: 1, card_id: 10 }, { frame_order: 2, card_id: 20 }], [2, 3, 1]);
    assert.deepEqual(info.map(h => h.card_id), [30, 10, 20]);
    assert.deepEqual(info.map(h => h.frame_order), [1, 2, 3]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_TRAINED_CHARA_DATA_WARNING, hasEmptyTrainedCharaData } from "./RaceUploadWarnings";

test("warns on empty player training data even without an exporter version", () => {
    assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{
        responseHorseData: { npc_type: 11, card_id: 102402 }, trainedCharaData: {},
    }] }), true);
    assert.match(EMPTY_TRAINED_CHARA_DATA_WARNING, /trainedCharaData.*some features unavailable/);
});

test("recognizes null training records and legacy field names", () => {
    assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{ _responseHorseData: { npc_type: 11 }, trainedCharaData: null }] }), true);
    assert.equal(hasEmptyTrainedCharaData({ "<RaceHorse>k__BackingField": [{
        "<ResponseHorseData>k__BackingField": { npc_type: 21 }, "<TrainedCharaData>k__BackingField": {},
    }] }), true);
    assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{ TrainedCharaData: {} }] }), true);
});

test("one incomplete player among populated records is sufficient", () => {
    assert.equal(hasEmptyTrainedCharaData({ horseACT_version: "1.1.7", raceHorse: [
        { trainedCharaData: { fans: 200000 } }, { trainedCharaData: {} },
    ] }), true);
});

test("does not warn for populated training data, including explicit zero fans", () => {
    assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{ trainedCharaData: { fans: 0 } }] }), false);
    assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{ trainedCharaData: { fans: 200000 } }] }), false);
});

test("does not mistake NPC filler records for incomplete player exports", () => {
    for (const response of [{ npc_type: 0 }, { mob_id: 123 }, { chara_id: 1 }]) {
        assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{ responseHorseData: response, trainedCharaData: {} }] }), false);
    }
    for (const npc_type of [11, 20, 21, 22]) {
        assert.equal(hasEmptyTrainedCharaData({ raceHorse: [{ responseHorseData: { npc_type }, trainedCharaData: {} }] }), true);
    }
});

test("does not warn for network, generated or malformed formats without training wrappers", () => {
    for (const capture of [null, undefined, {}, { race_horse_data_array: [{}] }, { schemaVersion: 2, horses: [{}] },
        { raceHorse: [] }, { raceHorse: [null, {}, { trainedCharaData: [] }] }]) {
        assert.equal(hasEmptyTrainedCharaData(capture), false);
    }
});

test("does not mutate the uploaded capture", () => {
    const capture = { raceHorse: [{ trainedCharaData: {} }] };
    const before = structuredClone(capture);
    hasEmptyTrainedCharaData(capture);
    assert.deepEqual(capture, before);
});

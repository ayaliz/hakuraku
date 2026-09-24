import assert from "node:assert/strict";
import test from "node:test";
import { anonymizeSharedRaceHorse, getDetailedRaceCaptureRaceType, buildDetailedRaceCaptureFromSharedData, getDetailedRaceCaptureRaceInstanceId, getDetailedRaceCaptureStartTimeType, buildDetailedRaceSimulationRequest, normalizeDetailedRaceCaptureForSimulation, resolveDetailedRaceInstanceId, withDetailedRaceCaptureSeed } from "./DetailedRaceEligibility";

test("associates missing race metadata with a known G1 instance for the detected course", () => {
    const known = {
        600035: { id: 600035, courseSetId: 10808 },
        102501: { id: 102501, courseSetId: 10808 },
        101701: { id: 101701, courseSetId: 10808 },
        100001: { id: 100001, courseSetId: 99999 },
    };
    assert.equal(resolveDetailedRaceInstanceId({}, 10808, known), 101701);
    assert.equal(resolveDetailedRaceInstanceId({ race_instance_id: 800017 }, 10808, known), 800017);
    assert.equal(resolveDetailedRaceInstanceId({}, 99998, known), null);
    assert.equal(buildDetailedRaceSimulationRequest({}, 10808, undefined, known).raceInstanceId, 101701);
    const reconstructed = buildDetailedRaceCaptureFromSharedData({
        raceHorseInfo: [], raceScenario: "replay", detectedCourseId: 10808, randomSeed: 42,
        trackDetails: { condition: "Good", weather: "Sunny", season: "Fall" },
    }, known)!;
    assert.equal(getDetailedRaceCaptureRaceInstanceId(reconstructed), 101701);
});

test("anonymous sharing retains runner inputs and viewer presence without identity", () => {
    const original = { viewer_id: 987654, popularity: 3, fan_count: 293258,
        team_rank: 4, single_mode_win_count: 12, skill_array: [{ skill_id: 210071, level: 1 }] };
    const anonymous = anonymizeSharedRaceHorse(original);
    assert.equal(anonymous.viewer_id, 0);
    assert.equal(anonymous.has_viewer_id, true);
    assert.equal(original.viewer_id, 987654);
    const shared = JSON.parse(JSON.stringify({ raceHorseInfo: [anonymous,
        anonymizeSharedRaceHorse({ viewer_id: 0, popularity: 1, fan_count: 0 })],
        raceScenario: "replay", raceTypeCode: 8, randomSeed: 42,
        trackDetails: { condition: "Good", weather: "Sunny", season: "Fall" } }));
    const reconstructed = buildDetailedRaceCaptureFromSharedData(shared)!;
    const horses = reconstructed.race_horse_data_array as any[];
    assert.equal(horses[0].viewer_id, 1);
    assert.equal(horses[1].viewer_id, 0);
    assert.equal(horses[0].popularity, 3);
    assert.equal(horses[0].fan_count, 293258);
    assert.equal(horses[0].team_rank, 4);
    assert.equal(horses[0].single_mode_win_count, 12);
    assert.deepEqual(horses[0].skill_array, original.skill_array);
    assert.equal(getDetailedRaceCaptureRaceType(reconstructed), 8);
    assert.equal(anonymizeSharedRaceHorse(anonymous).has_viewer_id, true);
});

test("shared race JSON preserves Monte Carlo metadata when reconstructed and shared again", () => {
    const original = { room_info: { race_instance_id: 123456 }, start_time_type: 0 };
    const shared = JSON.parse(JSON.stringify({
        raceHorseInfo: JSON.stringify([{ card_id: 100101, viewer_id: 0 }]),
        raceScenario: "replay", detectedCourseId: 10808, randomSeed: 42,
        trackDetails: { condition: "Good", weather: "Sunny", season: "Fall" },
        raceInstanceId: getDetailedRaceCaptureRaceInstanceId(original),
        startTimeType: getDetailedRaceCaptureStartTimeType(original),
    }));
    const reconstructed = buildDetailedRaceCaptureFromSharedData(shared)!;
    const request = buildDetailedRaceSimulationRequest(reconstructed, 10808);
    assert.equal(getDetailedRaceCaptureRaceInstanceId(request.capture), 123456);
    assert.equal(getDetailedRaceCaptureStartTimeType(request.capture), 0);
    assert.equal(getDetailedRaceCaptureRaceInstanceId(reconstructed), shared.raceInstanceId);
});

test("shared races remain readable when no known course association is available", () => {
    const shared = { raceHorseInfo: [], raceScenario: "replay", randomSeed: 42,
        trackDetails: { condition: "Good", weather: "Sunny", season: "Fall" } };
    const reconstructed = buildDetailedRaceCaptureFromSharedData(shared)!;
    assert.ok(reconstructed);
    assert.equal(getDetailedRaceCaptureRaceInstanceId(reconstructed), null);
    assert.equal(getDetailedRaceCaptureStartTimeType(reconstructed), null);
    const invalid = buildDetailedRaceCaptureFromSharedData({ ...shared,
        raceInstanceId: -1, startTimeType: 256 })!;
    assert.equal(getDetailedRaceCaptureRaceInstanceId(invalid), null);
    assert.equal(getDetailedRaceCaptureStartTimeType(invalid), null);
});

test("what-if requests preserve recorded seed and send the requested seed separately", () => {
    const capture = { random_seed: 42, season: 4, weather: 2, ground_condition: 2 };
    const request = buildDetailedRaceSimulationRequest(capture, 10506, 99);
    assert.equal(request.isCareer, false);
    assert.equal(request.recordedSeed, 42);
    assert.equal(request.seed, 99);
    assert.equal((request.capture as any).random_seed, 42);
    assert.equal(capture.random_seed, 42);
    assert.equal(buildDetailedRaceSimulationRequest(capture, 10506).seed, undefined);
    assert.equal(buildDetailedRaceSimulationRequest(capture, 10506, undefined, {}, true).isCareer, true);
});

test("copies legacy trained fan counts into simulator runner data without mutation", () => {
    const capture = { randomSeed: 42, season: "Winter", weather: "Cloudy", groundCondition: "Soft",
        simDataBase64: "replay", raceHorse: [{ responseHorseData: { fan_count: 0 }, trainedCharaData: { fans: 900 } },
            { _responseHorseData: { card_id: 1 }, trainedCharaData: { fans: 293258 } },
            { responseHorseData: { card_id: 2 } }] };
    const normalized = normalizeDetailedRaceCaptureForSimulation(capture) as any;
    assert.equal(normalized.random_seed, 42);
    assert.equal(normalized.raceHorse[0].responseHorseData.fan_count, 0);
    assert.equal(normalized.raceHorse[1]._responseHorseData.fan_count, 293258);
    assert.equal(normalized.raceHorse[2].responseHorseData.fan_count, undefined);
    assert.equal((capture.raceHorse[1]._responseHorseData as any).fan_count, undefined);
    assert.deepEqual(normalizeDetailedRaceCaptureForSimulation(normalized), normalized);
});

test("converts lobby simulator input to canonical capture fields", () => {
    const capture = { schemaVersion: 2, randomSeed: -42, courseId: 10506, season: 4, weather: 2,
        groundCondition: 1, race_scenario: "original", horses: [{ gateNumber: 5, teamId: 2,
            teamMemberId: 1, popularity: 3, fanCount: 344762, singleModeWinCount: 12,
            identity: { charaId: 1001, cardId: 100101, viewerId: 0 }, runningStyle: 3,
            rawStats: { speed: 1000, stamina: 900, power: 800, guts: 700, wisdom: 600 },
            motivation: 4, distanceAptitude: 0, surfaceAptitude: 1, strategyAptitude: "A",
            skills: [{ skillId: 210071, level: 1 }] }] };
    const normalized = normalizeDetailedRaceCaptureForSimulation(capture) as any;
    assert.equal(normalized.random_seed, -42);
    assert.equal(normalized.ground_condition, 2);
    assert.equal(normalized.horses, undefined);
    assert.equal(normalized.schemaVersion, undefined);
    assert.equal(normalized.race_scenario, "original");
    const horse = normalized.race_horse_data_array[0];
    assert.equal(horse.fan_count, 344762);
    assert.equal(horse.frame_order, 5);
    assert.equal(horse.running_style, 4);
    assert.equal(horse.proper_distance_long, 8);
    assert.equal(horse.proper_distance_middle, 1);
    assert.equal(horse.proper_ground_turf, 7);
    assert.equal(horse.proper_running_style_oikomi, 7);
    assert.deepEqual(horse.skill_array, [{ skill_id: 210071, level: 1 }]);
    assert.deepEqual(normalizeDetailedRaceCaptureForSimulation(normalized), normalized);
    assert.equal(capture.groundCondition, 1);
});

test("replaces capture seeds without mutating the uploaded race", () => {
    const capture = { random_seed: 42, season: 4 };
    const seeded = withDetailedRaceCaptureSeed(capture, -123) as Record<string, unknown>;

    assert.equal(seeded.random_seed, -123);
    assert.equal(capture.random_seed, 42);
    assert.notEqual(seeded, capture);
});

test("preserves the capture's seed naming convention", () => {
    const capture = { RandomSeed: 42 };
    const seeded = withDetailedRaceCaptureSeed(capture, 99) as Record<string, unknown>;

    assert.deepEqual(seeded, { RandomSeed: 99 });
});

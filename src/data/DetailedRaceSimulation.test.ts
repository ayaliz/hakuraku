import assert from "node:assert/strict";
import test from "node:test";
import {
    getDetailedRaceReplacementError,
    getDetailedRaceWhatIfError,
    readDetailedRaceSimulationResponse,
    type DetailedRaceSimulationProgress,
    type DetailedRaceSimulationResponse,
} from "./DetailedRaceSimulation";
import type { RaceSimulateData } from "./race_data_pb";

function result(): DetailedRaceSimulationResponse {
    return {
        engineBuild: "test-build",
        seed: 42,
        replay: { data: "replay" },
        annotations: { schemaVersion: 1, flags: {}, horses: [] },
    };
}

test("reads incremental detailed-simulation status and result events", async () => {
    const encoder = new TextEncoder();
    const expected = result();
    const chunks = [
        'event: queued\ndata: {"position":3}\n\n',
        'event: running\ndata: {"status":"running"}\r\n\r\n',
        'event: timing\ndata: {"server_timing":{}}\n\n',
        `event: result\ndata: ${JSON.stringify(expected)}\n\n`,
    ];
    const response = new Response(new ReadableStream({
        start(controller) {
            chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
            controller.close();
        },
    }), { headers: { "Content-Type": "text/event-stream" } });
    const progress: DetailedRaceSimulationProgress[] = [];

    assert.deepEqual(await readDetailedRaceSimulationResponse(response, event => progress.push(event)), expected);
    assert.deepEqual(progress.map(event => [event.stage, event.percent]), [
        ["queued", 20],
        ["running", 50],
        ["receiving", 80],
        ["receiving", 90],
    ]);
    assert.equal(progress[0].queuePosition, 3);
});

test("continues to accept the database proxy's JSON response", async () => {
    const expected = result();
    const progress: DetailedRaceSimulationProgress[] = [];
    const response = Response.json(expected);
    assert.deepEqual(await readDetailedRaceSimulationResponse(response, event => progress.push(event)), expected);
    assert.equal(progress.at(-1)?.stage, "receiving");
});

test("surfaces an SSE simulation error", async () => {
    const response = new Response('event: error\ndata: {"error":"No runners"}\n\n', {
        headers: { "Content-Type": "text/event-stream" },
    });
    await assert.rejects(() => readDetailedRaceSimulationResponse(response), /No runners/);
});

function replay(
    finishOrders = [0, 1, 2],
    finishTimeOffset = 0,
    startDelayOffset = 0,
): RaceSimulateData {
    const runnerCount = finishOrders.length;
    const horseFrame = Array.from({ length: runnerCount }, (_, index) => ({
        distance: 0,
        lanePosition: index * 500,
        speed: 300,
        hp: 3000,
        temptationMode: 0,
        blockFrontHorseIndex: -1,
    }));
    return {
        header: { maxLength: 4, version: 100000002 },
        horseNum: runnerCount,
        horseFrameSize: 12,
        horseResultSize: 31,
        frameCount: 2,
        frameSize: 4 + runnerCount * 12,
        frame: [
            { time: 0, horseFrame },
            { time: 123, horseFrame },
        ],
        eventCount: 0,
        event: [],
        horseResult: finishOrders.map((finishOrder, index) => ({
            finishOrder,
            finishTime: 120 + finishOrder + finishTimeOffset,
            finishTimeRaw: 120 + finishOrder + finishTimeOffset,
            finishDiffTime: finishOrder === 0 ? 0 : 1,
            startDelayTime: 0.01 + index * 0.01 + startDelayOffset,
            gutsOrder: index,
            wizOrder: runnerCount - index - 1,
            lastSpurtStartDistance: 800 + index,
            runningStyle: index % 4 + 1,
            defeat: finishOrder === 0 ? 1 : 2,
        })),
    } as unknown as RaceSimulateData;
}

function detailedResponse(seed = 42, runnerCount = 3): DetailedRaceSimulationResponse {
    return {
        ...result(),
        seed,
        diagnostics: { simulationMilliseconds: 1 },
        annotations: {
            schemaVersion: 7,
            flags: {
                positionKeepSpeedUp: 1,
                positionKeepOvertake: 2,
                positionKeepPaceUp: 4,
                positionKeepPaceDown: 8,
                positionKeepPaceUpEx: 16,
                downhill: 32,
                spotStruggle: 64,
                dueling: 128,
                conservePower: 256,
            },
            sampleTimes: [0, 123],
            paceMakerSpans: [],
            horses: Array.from({ length: runnerCount }, (_, horseIndex) => ({
                horseIndex,
                spans: [],
                frontBlockSpans: [],
                temptationSpans: [],
                positionKeepReferenceSpans: [],
                positionKeepDecisions: [],
                baseTargetSpeedSections: [],
                worldTransformDistanceLoss: 0,
                lastSpurtDecision: null,
                lastSpurtDecisions: [],
                rushedFrames: 0,
                startHp: 3000,
                finalHp: 100,
                hpDeficit: 0,
                maxHp: 3000,
                hpExhaustedTime: null,
                hpExhaustedDistance: null,
                lostStartAccelerationFrame: false,
                finishDistanceToPrevious: horseIndex === 0 ? null : 1,
                targetSpeeds: [3, 20],
                accelerationRates: [null, 1],
                activeSkillSpans: [],
                skillActivationDecisions: [],
                hpSkillApplications: [],
                temptationDecision: null,
            })),
        },
    };
}

test("accepts a detailed replay with the recorded deterministic fingerprint", () => {
    assert.equal(getDetailedRaceReplacementError(
        replay(),
        replay(),
        detailedResponse(),
        42,
    ), null);

    const oneUlpFinishGap = replay();
    oneUlpFinishGap.horseResult[1].finishDiffTime += 0.00001;
    assert.equal(getDetailedRaceReplacementError(
        replay(),
        oneUlpFinishGap,
        detailedResponse(),
        42,
    ), null);
});

test("accepts an active skill that starts on the final simulator tick", () => {
    const response = detailedResponse();
    response.annotations.horses[0].activeSkillSpans = [{
        skillId: 100171,
        detailIndex: 0,
        startTime: 123,
        endTime: 123,
    }];

    assert.equal(getDetailedRaceReplacementError(replay(), replay(), response, 42), null);
});

test("rejects a detailed replay produced from a different race", () => {
    const recorded = replay();
    assert.match(getDetailedRaceReplacementError(recorded, replay(), detailedResponse(43), 42) ?? "", /seed 43/);
    assert.match(getDetailedRaceReplacementError(recorded, replay([1, 0, 2]), detailedResponse(), 42) ?? "", /finish order/);
    assert.match(getDetailedRaceReplacementError(recorded, replay([0, 1, 2], 0, 0.000001), detailedResponse(), 42) ?? "", /starting RNG/);
    assert.match(getDetailedRaceReplacementError(recorded, replay([0, 1, 2], 0.5), detailedResponse(), 42) ?? "", /finish time/);
    const wrongFinishGap = replay();
    wrongFinishGap.horseResult[1].finishDiffTime += 0.001;
    assert.match(getDetailedRaceReplacementError(recorded, wrongFinishGap, detailedResponse(), 42) ?? "", /finish gap/);
    assert.match(getDetailedRaceReplacementError(recorded, replay([0, 1]), detailedResponse(42, 2), 42) ?? "", /runner field/);
});

test("accepts a structurally valid different-seed what-if replay", () => {
    const alternateResponse = detailedResponse(43);
    alternateResponse.annotations.horses[0].finishDistanceToPrevious = 1;
    alternateResponse.annotations.horses[1].finishDistanceToPrevious = null;
    assert.equal(getDetailedRaceWhatIfError(
        replay(),
        replay([1, 0, 2], 0.5),
        alternateResponse,
        43,
    ), null);
    assert.match(getDetailedRaceWhatIfError(
        replay(),
        replay([1, 0, 2], 0.5),
        detailedResponse(44),
        43,
    ) ?? "", /requested seed 43/);
});

test("rejects malformed game and simulator result structures", () => {
    const recorded = replay();
    recorded.horseResult[2].gutsOrder = 1;
    assert.match(getDetailedRaceReplacementError(recorded, replay(), detailedResponse(), 42) ?? "", /recorded race.*rankings/);

    const malformedReplay = replay();
    malformedReplay.frame[1].horseFrame.pop();
    assert.match(getDetailedRaceReplacementError(replay(), malformedReplay, detailedResponse(), 42) ?? "", /simulator replay.*frame/);
});

test("rejects incomplete or internally inconsistent schema 7 annotations", () => {
    const missingTelemetry = detailedResponse();
    missingTelemetry.annotations.horses[0].targetSpeeds = [];
    assert.match(getDetailedRaceReplacementError(replay(), replay(), missingTelemetry, 42) ?? "", /continuous telemetry/);

    const badExhaustionPair = detailedResponse();
    badExhaustionPair.annotations.horses[0].hpExhaustedTime = 12;
    assert.match(getDetailedRaceReplacementError(replay(), replay(), badExhaustionPair, 42) ?? "", /HP exhaustion/);

    const reversedSkillSpan = detailedResponse();
    reversedSkillSpan.annotations.horses[0].activeSkillSpans = [{
        skillId: 100171,
        detailIndex: 0,
        startTime: 12,
        endTime: 11,
    }];
    assert.match(getDetailedRaceReplacementError(replay(), replay(), reversedSkillSpan, 42) ?? "", /active-skill spans/);

    const badLastSpurtSummary = detailedResponse();
    badLastSpurtSummary.annotations.horses[0].lastSpurtDecision = {
        result: "True",
        checkDistance: 80,
        checkHp: 100,
        fullSpurtNeedHp: 90,
        fullSpurtTargetSpeed: 24,
        selectedStartDistance: 80,
        selectedTargetSpeed: 24,
        delayPenalty: false,
        speedPenalty: false,
        calculationCount: 1,
        time: 100,
    };
    assert.match(getDetailedRaceReplacementError(replay(), replay(), badLastSpurtSummary, 42) ?? "", /last-spurt summary/);
});

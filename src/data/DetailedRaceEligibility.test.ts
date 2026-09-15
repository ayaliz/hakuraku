import assert from "node:assert/strict";
import test from "node:test";
import { withDetailedRaceCaptureSeed } from "./DetailedRaceEligibility";

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

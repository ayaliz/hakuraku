import assert from "node:assert/strict";
import test from "node:test";
import { raceWinRatePercent } from "./RaceWinRateSimulation";

test("omits redundant percentage decimals but preserves meaningful ones", () => {
    assert.equal(raceWinRatePercent(0.37), "37%");
    assert.equal(raceWinRatePercent(0.125), "12.5%");
    assert.equal(raceWinRatePercent(1 / 3), "33.3%");
});

import assert from "node:assert/strict";
import test from "node:test";

import type { Pair } from "./types";

import {
    buildPerformerFilterOptions,
    matcherKey,
    matchersFromRequirement,
    requirementFromMatchers,
} from "./performerFilterModel";

test("performer filter requirements round-trip alternatives and exclusions", () => {
    const alternatives = [{ card: 100101, style: 1 }, { chara: 1002, style: 2 }];
    const requirement = requirementFromMatchers(alternatives, true);
    assert.deepEqual(requirement, { anyOf: alternatives, exclude: true });
    assert.deepEqual(matchersFromRequirement(requirement), alternatives);
    assert.equal(matcherKey(alternatives[0]), "100101_1");
    assert.equal(matcherKey({}), null);
});

test("performer filter options include styles, costume-wide choices, and exact pairs", () => {
    const pair: Pair = {
        key: "100101_1",
        card: 100101,
        chara: 1001,
        style: 1,
        name: "Runner",
        outfit: "Default",
        owners: 6,
        teamExposures: 12,
        teamWins: 3,
        team: 0.25,
        teamAdjusted: 0.24,
        teamCI: [0.2, 0.3],
        teamPop: 0.1,
        runners: 6,
        runnerExposures: 12,
        individualWins: 2,
        individual: 1 / 6,
        individualAdjusted: 0.16,
        individualCI: [0.1, 0.22],
        pop: 0.1,
        winShare: 0.2,
        stylePop: 0.3,
        evaluatedTeams: 6,
        evaluatedOwners: 6,
    };
    const options = buildPerformerFilterOptions([pair]);
    assert.ok(options.some((option) => option.key === "style_1"));
    const anyStyle = options.find((option) => option.key === "card_100101_any");
    const exact = options.find((option) => option.key === "100101_1");
    assert.equal(anyStyle?.detail, "Any style");
    assert.equal(exact?.detail, "Front Runner");
    assert.match(exact?.search ?? "", /default/);
});

import assert from "node:assert/strict";
import test from "node:test";

import type { Pair } from "./types";

import {
    buildPerformerFilterOptions,
    matcherKey,
    matchersFromRequirement,
    requirementFromMatchers,
} from "./performerFilterModel";
import { matchesTeam, parseQuery, queryText } from "./query";

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

test("detailed performer requirements serialize and match the same team member", () => {
    const slots = [{ style: 1, details: [
        { kind: "number" as const, field: "speed" as const, min: 1500 },
        { kind: "aptitude" as const, field: "distance" as const, mode: "atLeast" as const, grade: 7 },
        { kind: "skill" as const, id: 200331 },
        { kind: "support" as const, id: 30028, exclude: true },
    ] }, {}, {}];
    const text = queryText(slots, {});
    assert.match(text, /^v2:/);
    assert.deepEqual(parseQuery(text, {}), slots);
    const members = [
        { id: "a", card: 1, chara: 1, style: 1 as const, racingStyle: 1, score: 1, stats: [1500, 1000, 1000, 1000, 1000] as [number, number, number, number, number], skillPoints: 3000, aptitudes: ['A', 'A', 'A'] as [string, string, string], skills: [[200331, 1]] as [number, number][], deck: [] },
        { id: "b", card: 2, chara: 2, style: 2 as const, racingStyle: 2, score: 1 },
        { id: "c", card: 3, chara: 3, style: 3 as const, racingStyle: 3, score: 1 },
    ];
    assert.equal(matchesTeam(members, slots), true);
    assert.equal(matchesTeam([{ ...members[0], deck: [{ position: 1, id: 30028, lb: 4, exp: 0 }] }, members[1], members[2]], slots), false);
});

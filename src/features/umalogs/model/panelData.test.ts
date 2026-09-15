import assert from "node:assert/strict";
import test from "node:test";

import type { HorseEntry } from "../../../pages/MultiRacePage/types";
import {
    buildGroupPanelData,
    computeTeamStatsFromHorses,
} from "./panelData";

function horse(overrides: Partial<HorseEntry> = {}): HorseEntry {
    return {
        raceId: "race-complete",
        frameOrder: 1,
        finishOrder: 2,
        charaId: 1001,
        charaName: "Test Runner",
        cardId: 100101,
        strategy: 1,
        trainerName: "",
        activatedSkillIds: new Set(),
        learnedSkillIds: new Set(),
        finishTime: 100,
        raceDistance: 1600,
        careerWinCount: 2,
        speed: 1200,
        stamina: 900,
        pow: 1000,
        guts: 700,
        wiz: 800,
        rankScore: 15000,
        motivation: 3,
        activationChance: 0.8,
        isPlayer: false,
        teamId: 1,
        supportCardIds: [],
        supportCardLimitBreaks: [],
        ...overrides,
    };
}

function completeTeamRace(): HorseEntry[] {
    return [
        horse({ frameOrder: 1, finishOrder: 1, cardId: 100101, charaId: 1001, strategy: 1, teamId: 1, finishTime: 98 }),
        horse({ frameOrder: 2, finishOrder: 2, cardId: 100201, charaId: 1002, strategy: 2, teamId: 1 }),
        horse({ frameOrder: 3, finishOrder: 3, cardId: 100301, charaId: 1003, strategy: 3, teamId: 1 }),
        horse({ frameOrder: 4, finishOrder: 4, cardId: 100101, charaId: 1001, strategy: 1, teamId: 2 }),
        horse({ frameOrder: 5, finishOrder: 5, cardId: 100201, charaId: 1002, strategy: 2, teamId: 2 }),
        horse({ frameOrder: 6, finishOrder: 6, cardId: 100301, charaId: 1003, strategy: 3, teamId: 2 }),
    ];
}

test("team aggregation only accepts complete multi-team races", () => {
    const complete = computeTeamStatsFromHorses(completeTeamRace());
    assert.equal(complete.length, 1);
    assert.equal(complete[0].appearances, 2);
    assert.equal(complete[0].wins, 1);
    assert.equal(complete[0].expectedWins, 1);
    assert.deepEqual(complete[0].memberWins, [1, 0, 0]);

    const incomplete = completeTeamRace().slice(0, 5).map((entry) => ({
        ...entry,
        raceId: "race-incomplete",
    }));
    assert.deepEqual(computeTeamStatsFromHorses(incomplete), []);
});

test("panel aggregation produces the complete shared contract", () => {
    const panel = buildGroupPanelData("cm-test", 101, completeTeamRace(), (entry) => ({
        raceId: entry.raceId,
        frameOrder: entry.frameOrder,
    }));

    assert.equal(panel.cmId, "cm-test");
    assert.equal(panel.courseId, 101);
    assert.equal(panel.winningTimeHistogram?.mean, 98);
    assert.equal(panel.scoreHistogramAll?.mean, 15000);
    assert.deepEqual(panel.topHorses.fastestWin, { raceId: "race-complete", frameOrder: 1 });
    assert.equal(panel.styleCompositionRows.length, 1);
    assert.equal(panel.styleCompositionRows[0].appearances, 2);
    assert.equal(panel.styleCompositionRows[0].wins, 1);
    assert.equal(panel.characterTeamRates.length, 3);
});

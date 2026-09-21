import assert from "node:assert/strict";
import test from "node:test";
import {
    extraHpNeededForRate,
    extraMaxHpNeeded,
    firstSpurtHpMargin,
    hpRateMilestones,
    placementHistogram,
    raceWinRateBatchGates,
    raceWinRatePercent,
    rawStaminaNeededForMaxHp,
    survivalHpMargin,
    type RaceWinRateRace,
    type RaceWinRateRunner,
} from "./RaceWinRateSimulation";

test("reconstructs batch gate assignments in lobby slot order", () => {
    const runners = Array.from({ length: 9 }, (_, slot) => ({
        slot,
        teamIndex: Math.floor(slot / 3),
        memberIndex: slot % 3,
        teamId: `team-${Math.floor(slot / 3)}`,
        frameOrder: 8 - slot,
        gateNumber: 9 - slot,
        cardId: 100000 + slot,
        charaId: 1000 + slot,
        wins: 0,
        winRate: 0,
    })) satisfies RaceWinRateRunner[];

    assert.deepEqual(raceWinRateBatchGates(runners), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
    assert.equal(raceWinRateBatchGates(runners.slice(0, 8)), null);
    assert.equal(raceWinRateBatchGates(runners.map((runner, index) => index === 8
        ? { ...runner, gateNumber: 8 }
        : runner)), null);
});

test("omits redundant percentage decimals but preserves meaningful ones", () => {
    assert.equal(raceWinRatePercent(0.37), "37%");
    assert.equal(raceWinRatePercent(0.125), "12.5%");
    assert.equal(raceWinRatePercent(1 / 3), "33.3%");
});

test("reports the extra HP needed to cover a target share of races", () => {
    assert.equal(extraHpNeededForRate([...Array(94).fill(0), 12, 50, 80, 100, 120, 140]), 12);
    assert.equal(extraHpNeededForRate([...Array(95).fill(0), 12, 50, 80, 100, 120]), 0);
    assert.equal(extraHpNeededForRate([], 0.95), null);
});

test("reads first-spurt and survival HP margins in source-input order", () => {
    const race = {
        index: 0,
        seed: 1,
        finishOrder: [1, 0],
        checkHp: [[120, 80], [75]],
        fullSpurtNeedHp: [[100, 95], [90]],
        finalHp: [42, 0],
        hpDeficit: [0, 18],
    } satisfies RaceWinRateRace;
    assert.equal(firstSpurtHpMargin(race, 0), 20);
    assert.equal(firstSpurtHpMargin(race, 1), -15);
    assert.equal(survivalHpMargin(race, 0), 42);
    assert.equal(survivalHpMargin(race, 1), -18);
});

test("accounts for MaxHP-scaled effects when converting a raw HP deficit", () => {
    const race = {
        index: 0,
        seed: 1,
        finishOrder: [0],
        checkHp: [[900]],
        fullSpurtNeedHp: [[1000]],
        finalHp: [0],
        hpDeficit: [100],
        hpEffectRateBeforeFirstSpurt: [0.25],
        hpEffectRate: [-0.2],
    } satisfies RaceWinRateRace;
    assert.equal(extraMaxHpNeeded(race, 0, "spurt"), 80);
    assert.equal(extraMaxHpNeeded(race, 0, "survival"), 125);
});

test("converts MaxHP to raw stamina using mood and the overcap transform", () => {
    // Sashi: 80 MaxHP = 100 adjusted stamina. Great mood needs 97 raw stamina.
    assert.equal(rawStaminaNeededForMaxHp(80, 1000, 5, 2), 97);
    // Crossing 1200: 10 points at full value, then 180 at half value.
    assert.equal(rawStaminaNeededForMaxHp(80, 1190, 3, 2), 190);
    // Senkou's lower HP coefficient requires more stamina for the same MaxHP.
    assert.equal(rawStaminaNeededForMaxHp(80, 1000, 3, 1), 113);
});

test("builds exact placement counts and prioritizes high HP milestones", () => {
    const races = [
        { index: 0, seed: 1, finishOrder: [1, 0] },
        { index: 1, seed: 2, finishOrder: [0, 1] },
        { index: 2, seed: 3, finishOrder: [1, 0] },
    ] satisfies RaceWinRateRace[];
    assert.deepEqual(placementHistogram(races, 0, 2), [1, 2]);

    const margins = [...Array(87).fill(1), -10, -20, -30, -40, -50, -60, -70, -80, -90, -100, -110, -120];
    assert.deepEqual(hpRateMilestones(margins), [
        { rate: 0.9, extraHp: 30 },
        { rate: 0.95, extraHp: 80 },
        { rate: 1, extraHp: 120 },
    ]);

    const lowRateMargins = [...Array(25).fill(1), ...Array(75).fill(-1)];
    assert.deepEqual(hpRateMilestones(lowRateMargins).map(item => item.rate), [
        0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1,
    ]);
});

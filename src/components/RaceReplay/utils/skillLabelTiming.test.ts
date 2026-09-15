import assert from "node:assert/strict";
import test from "node:test";
import {
    formatRaceStateLabel,
    formatSkillDurationSuffix,
    getSkillEffectRemainingSeconds,
    isSkillLabelVisible,
    MIN_SKILL_LABEL_VISIBLE_SECONDS,
    raceStateLabelIdentity,
} from "./skillLabelTiming";
import { isAutomaticPassiveSkillDefinition } from "./SkillDataUtils";
import { getDetailedSkillActivationDuration } from "../../../data/DetailedRaceSimulation";

test("uses the simulator span for the condition branch that activated", () => {
    const spans = [
        { skillId: 123, detailIndex: 0, startTime: 10, endTime: 11 },
        { skillId: 123, detailIndex: 1, startTime: 10, endTime: 13.5 },
        { skillId: 456, detailIndex: 0, startTime: 10, endTime: 20 },
    ];
    assert.equal(getDetailedSkillActivationDuration(spans, 123, 10, 0), 1);
    assert.equal(getDetailedSkillActivationDuration(spans, 123, 10, 1), 3.5);
    assert.equal(getDetailedSkillActivationDuration(spans, 999, 10, 0), 0);
    assert.equal(getDetailedSkillActivationDuration(undefined, 123, 10, 0), undefined);
});

test("identifies automatic passive skills without suppressing wit-rolled passives or active skills", () => {
    assert.equal(isAutomaticPassiveSkillDefinition({
        activateLot: 0,
        conditionGroups: [{ baseTime: -1 }],
    }), true);
    assert.equal(isAutomaticPassiveSkillDefinition({
        activateLot: 1,
        conditionGroups: [{ baseTime: -1 }],
    }), false);
    assert.equal(isAutomaticPassiveSkillDefinition({
        activateLot: 0,
        conditionGroups: [{ baseTime: 50_000 }],
    }), false);
});

test("keeps a one-frame skill label visible for two seconds", () => {
    const activationTime = 10;
    const oneFrame = 1 / 60;

    assert.equal(isSkillLabelVisible(activationTime, oneFrame, 11.999), true);
    assert.equal(isSkillLabelVisible(activationTime, oneFrame, 12), false);
    assert.equal(MIN_SKILL_LABEL_VISIBLE_SECONDS, 2);
});

test("does not shorten labels for effects lasting longer than two seconds", () => {
    assert.equal(isSkillLabelVisible(10, 3.5, 13.49), true);
    assert.equal(isSkillLabelVisible(10, 3.5, 13.5), false);
});

test("reports the real effect duration after a short effect has ended", () => {
    assert.equal(getSkillEffectRemainingSeconds(10, 1 / 60, 11), 0);
});

test("hides the duration while a short skill label is visible only through its display minimum", () => {
    const remaining = getSkillEffectRemainingSeconds(10, 1 / 60, 11);
    assert.equal(isSkillLabelVisible(10, 1 / 60, 11), true);
    assert.equal(formatSkillDurationSuffix(remaining, true), "");
    assert.equal(formatSkillDurationSuffix(1.25, true), " 1.3s");
    assert.equal(formatSkillDurationSuffix(1.25, false), "");
});

test("shows remaining time for detailed race states", () => {
    assert.equal(formatRaceStateLabel("Fully Charged", 10, 4.25, 11, true), "Fully Charged 3.3s");
    assert.equal(formatRaceStateLabel("Pace Up", 10, 4.25, 11, true), "Pace Up 3.3s");
    assert.equal(formatRaceStateLabel("Downhill Mode", 10, 4.25, 11, true), "Downhill Mode 3.3s");
    assert.equal(formatRaceStateLabel("Rushed (Front)", 10, 4.25, 11, true), "Rushed (Front) 3.3s");
});

test("does not present display-only markers as timed states", () => {
    assert.equal(formatRaceStateLabel("Spurt delayed", 10, 2, 11, true), "Spurt delayed");
    assert.equal(formatRaceStateLabel("Fully Charged", 10, 4, 11, false), "Fully Charged");
});

test("uses one display identity for duplicate race-state labels from different sources", () => {
    assert.equal(raceStateLabelIdentity("Rushed (Front)"), "Rushed (Front)");
    assert.equal(raceStateLabelIdentity("Spot Struggle 1.4s"), "Spot Struggle");
    assert.equal(raceStateLabelIdentity("Competes (Pos)"), "Spot Struggle");
    assert.equal(raceStateLabelIdentity("Dueling"), "Dueling");
    assert.equal(raceStateLabelIdentity("Competes (Speed)"), "Dueling");
});

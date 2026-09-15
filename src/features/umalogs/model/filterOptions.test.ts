import assert from "node:assert/strict";
import test from "node:test";
import { createCharacterRequirement, defaultStatValueForProperty } from "./filterOptions";

test("creates a requirement with shared Explorer and Replay defaults", () => {
    const requirement = createCharacterRequirement(
        "requirement-1",
        [{ skillId: 101 }],
        [{ supportCardId: 301 }],
    );

    assert.deepEqual(requirement, {
        id: "requirement-1",
        truthMode: "require",
        property: "none",
        statOp: ">",
        statValue: defaultStatValueForProperty("none"),
        skillId: 101,
        skillMode: "learned",
        supportCardId: 301,
        supportCardPresent: true,
        supportCardLb: -1,
    });
});

test("creates an empty requirement when entity options are unavailable", () => {
    const requirement = createCharacterRequirement("requirement-2");

    assert.equal(requirement.skillId, null);
    assert.equal(requirement.supportCardId, null);
});

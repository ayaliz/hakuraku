import assert from "node:assert/strict";
import test from "node:test";
import { compileFriendlyNames, type QueryEntityEntry, type SkillNameEntry } from "./queryFriendlyNames";

const skills: SkillNameEntry[] = [
    { id: 1001, names: ["Taking the Lead"], iconUrl: null },
    { id: 9001, names: ["Taking the Lead (inherit)"], iconUrl: null, isInherited: true },
    { id: 1002, names: ["Angling and Scheming"], iconUrl: null },
];
const characters: QueryEntityEntry[] = [
    { id: 10101, names: ["Wild Frontier"], iconUrl: null, type: "character" },
];
const supports: QueryEntityEntry[] = [
    { id: 30101, names: ["Fire at My Heels"], iconUrl: null, type: "support" },
];

test("compiles friendly skill functions and aliases to IDs", () => {
    const compiled = compileFriendlyNames(
        "select skill_activation_rate(Angling and Scheming) where has_skill(Taking the Lead)",
        skills,
        characters,
        supports,
    );
    assert.equal(compiled, "select activation_rate(1002) where learned has 1001");
});

test("compiles character and support-card names while preserving limit breaks", () => {
    const compiled = compileFriendlyNames(
        "where character = [Wild Frontier] and support_cards has Fire at My Heels at lb 4",
        skills,
        characters,
        supports,
    );
    assert.equal(compiled, "where character = 10101 and support_cards has 30101 at lb 4");
});

test("compiles the preferred Uma alias while retaining character compatibility", () => {
    const compiled = compileFriendlyNames(
        "where uma = [Wild Frontier]",
        skills,
        characters,
        supports,
    );
    assert.equal(compiled, "where uma = 10101");
});

test("compiles friendly skill lists and inherited variants", () => {
    const compiled = compileFriendlyNames(
        "where learned has all (Taking the Lead, Angling and Scheming) and activated has Taking the Lead (inherit)",
        skills,
        characters,
        supports,
    );
    assert.equal(compiled, "where learned has all (1001, 1002) and activated has 9001");
});

test("compiles inherited names inside skill functions", () => {
    const compiled = compileFriendlyNames(
        "select activation_rate(Taking the Lead (inherit)) where has_skill(Taking the Lead (inherit))",
        skills,
        characters,
        supports,
    );
    assert.equal(compiled, "select activation_rate(9001) where learned has 9001");
});

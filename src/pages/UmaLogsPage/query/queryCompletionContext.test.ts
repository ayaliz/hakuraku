import assert from "node:assert/strict";
import test from "node:test";

import {
    findTopLevelQueryClause,
    getActiveQueryClause,
    getEntityCompletionContext,
    getOrderDirectionCompletionContext,
    getSkillCompletionContext,
    getValueCompletionContext,
    isEmptyCompletionTrigger,
    parseQueryClauses,
    splitQueryCommaList,
} from "./queryCompletionContext";

test("query clause parsing ignores clause words inside strings and functions", () => {
    const query = "select character, activation_rate('Where Is It?') where strategy = 1 order by entries desc limit 10";
    const clauses = parseQueryClauses(query);

    assert.equal(findTopLevelQueryClause(query, "where"), query.indexOf("where strategy"));
    assert.deepEqual(clauses, {
        startsWithSelect: true,
        selectText: "character, activation_rate('Where Is It?')",
        whereText: "strategy = 1",
        groupText: "",
        havingText: "",
        orderText: "entries desc",
        limitText: "10",
        offsetText: "",
    });
});

test("comma lists preserve nested and quoted commas", () => {
    assert.deepEqual(
        splitQueryCommaList("character, activation_rate('Speed, Now'), any(foo, bar)"),
        ["character", "activation_rate('Speed, Now')", "any(foo, bar)"],
    );
});

test("completion contexts identify skills, entities, values, clauses, and order direction", () => {
    assert.deepEqual(getSkillCompletionContext("select activation_rate(Ang"), { from: 23, token: "Ang" });
    assert.deepEqual(getSkillCompletionContext("where learned has any(Speed, Ang"), { from: 28, token: " Ang" });
    assert.deepEqual(getEntityCompletionContext("where uma = Special"), { from: 12, token: "Special", type: "character" });
    assert.deepEqual(getEntityCompletionContext("where character = Special"), { from: 18, token: "Special", type: "character" });
    assert.deepEqual(getEntityCompletionContext("where support has any(Fine"), { from: 22, token: "Fine", type: "support" });
    assert.deepEqual(getValueCompletionContext("where strategy = fro"), { from: 17, token: "fro", field: "strategy" });
    assert.equal(getActiveQueryClause("select character where strategy = 1 group by "), "group");
    assert.equal(isEmptyCompletionTrigger("select character where ", "where"), true);
    assert.deepEqual(getOrderDirectionCompletionContext("select character order by entries de"), { from: 34, token: "de" });
});

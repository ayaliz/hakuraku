import assert from "node:assert/strict";
import test from "node:test";

import type { ReplayExactBuildFilter } from "./replaysShared";
import type { UmaLogsQuerySpec } from "./umaLogsQueryShared";
import {
    clearReplayNavigationParams,
    decodeReplayEntryQuerySpecParam,
    decodeReplayExactBuildParam,
    decodeReplayUqlParam,
    encodeReplayExactBuildParam,
    encodeReplayUqlParam,
    parseReplayCardId,
    readReplayExactBuildFilter,
    setReplayEntryQueryNavigation,
    setReplayExactBuildNavigation,
} from "./replayNavigation";

const build: ReplayExactBuildFilter = {
    cardId: 100101,
    strategy: 2,
    isDebuffer: false,
    speed: 1200,
    stamina: 900,
    pow: 1000,
    guts: 700,
    wiz: 800,
    rankScore: 15000,
    careerWinCount: 3,
    supportCardIds: [1, 2, 3, 4, 5, 6],
    supportCardLimitBreaks: [4, 4, 4, 4, 4, 4],
    learnedSkillIds: [100, 200],
};

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
    };
}

test("replay build and written-query codecs round-trip validated values", () => {
    assert.deepEqual(decodeReplayExactBuildParam(encodeReplayExactBuildParam(build)), build);
    assert.equal(decodeReplayUqlParam(encodeReplayUqlParam("  chara = 'メジロ'  ")), "chara = 'メジロ'");
    assert.equal(decodeReplayExactBuildParam("invalid"), null);
    assert.equal(parseReplayCardId("100101"), 100101);
    assert.equal(parseReplayCardId("-1"), null);
});

test("query-spec navigation validates URL data and clears incompatible filters", () => {
    const querySpec = {
        version: 1,
        subject: "entries",
        select: ["card_id"],
        where: null,
        groupBy: [],
        orderBy: [],
        limit: 20,
    } as UmaLogsQuerySpec;
    const storage = memoryStorage();
    const params = new URLSearchParams("tab=overview&replayCardId=1&replayBuild=old&unrelated=kept");

    setReplayEntryQueryNavigation(params, querySpec, storage);

    assert.equal(params.get("tab"), "replays");
    assert.equal(params.get("replayCardId"), null);
    assert.equal(params.get("unrelated"), "kept");
    assert.equal(params.get("replayAutoRun"), "1");
    assert.deepEqual(decodeReplayEntryQuerySpecParam(params.get("replayEntryQuerySpec")), querySpec);
    assert.equal(decodeReplayEntryQuerySpecParam(encodeReplayUqlParam("not a query spec")), null);
});

test("exact-build navigation keeps a session fallback and cleanup is exhaustive", () => {
    const storage = memoryStorage();
    const params = setReplayExactBuildNavigation(new URLSearchParams("replayUql=old"), build, storage);
    const key = params.get("replayBuildKey");

    assert.deepEqual(readReplayExactBuildFilter(key, storage), build);
    assert.deepEqual(decodeReplayExactBuildParam(params.get("replayBuild")), build);
    assert.equal(params.get("replayUql"), null);
    clearReplayNavigationParams(params);
    assert.equal([...params.keys()].some((name) => name.startsWith("replay")), false);
});

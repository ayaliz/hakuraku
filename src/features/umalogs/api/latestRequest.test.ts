import assert from "node:assert/strict";
import test from "node:test";

import { LatestRequestRunner } from "./latestRequest";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((next) => { resolve = next; });
    return { promise, resolve };
}

test("only accepts the newest completion when an older operation ignores abort", async () => {
    const runner = new LatestRequestRunner();
    const first = deferred<string>();
    const firstResult = runner.run(() => first.promise);
    const secondResult = runner.run(async () => "second");

    first.resolve("first");

    assert.deepEqual(await secondResult, { status: "success", value: "second" });
    assert.deepEqual(await firstResult, { status: "cancelled" });
});

test("aborts the previous operation when a newer request starts", async () => {
    const runner = new LatestRequestRunner();
    let abortObserved = false;
    const first = deferred<string>();
    const firstResult = runner.run((signal) => {
        signal.addEventListener("abort", () => { abortObserved = true; });
        return first.promise;
    });

    const secondResult = runner.run(async () => "second");
    first.resolve("first");

    assert.equal(abortObserved, true);
    assert.equal((await firstResult).status, "cancelled");
    assert.equal((await secondResult).status, "success");
});

test("returns current errors while treating explicit cancellation as inert", async () => {
    const runner = new LatestRequestRunner();
    const failed = await runner.run(async () => { throw new Error("failed"); });
    assert.equal(failed.status, "error");
    if (failed.status === "error") assert.equal(failed.error.message, "failed");

    const pending = deferred<string>();
    const cancelledResult = runner.run(() => pending.promise);
    runner.cancel();
    pending.resolve("late");
    assert.deepEqual(await cancelledResult, { status: "cancelled" });
});

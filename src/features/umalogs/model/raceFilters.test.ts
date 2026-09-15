import assert from "node:assert/strict";
import test from "node:test";

import {
    createRaceFilter,
    removeRaceFilter,
    sanitizeStoredRaceFilters,
    updateRaceFilter,
} from "./raceFilters";

test("creates, updates, and removes race filters without mutating prior state", () => {
    const initial = [createRaceFilter("first")];
    const updated = updateRaceFilter(initial, "first", { field: "room_debuffer_count", value: 2 });

    assert.deepEqual(initial, [{ id: "first", field: "room_front_count", operator: "=", value: 0 }]);
    assert.deepEqual(updated, [{ id: "first", field: "room_debuffer_count", operator: "=", value: 2 }]);
    assert.deepEqual(removeRaceFilter(updated, "first"), []);
});

test("restores valid session filters and rejects malformed values", () => {
    const input = [
        { id: "valid", field: "room_front_count", operator: ">=", value: "2.8" },
        { id: "", field: "room_front_count", operator: "=", value: 1 },
        { id: "bad-field", field: "unknown", operator: "=", value: 1 },
        { id: "negative", field: "room_end_count", operator: "=", value: -1 },
    ];

    assert.deepEqual(sanitizeStoredRaceFilters(input), [
        { id: "valid", field: "room_front_count", operator: ">=", value: 2 },
    ]);
    assert.deepEqual(sanitizeStoredRaceFilters(null), []);
});

test("caps restored filters at the supported maximum", () => {
    const input = Array.from({ length: 12 }, (_, index) => ({
        id: `filter-${index}`,
        field: "room_pace_count",
        operator: "<=",
        value: index,
    }));

    assert.equal(sanitizeStoredRaceFilters(input).length, 10);
});

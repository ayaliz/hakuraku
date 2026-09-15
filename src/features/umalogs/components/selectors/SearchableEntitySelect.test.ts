import assert from "node:assert/strict";
import test from "node:test";

import { filterSearchableItems } from "./SearchableEntitySelect";

const entries = [
    { id: 1, label: "Oguri Cap Original" },
    { id: 2, label: "Kitasan Black Support" },
    { id: 3, label: "Angling and Scheming (inherit)" },
];

test("searches entity labels case-insensitively and trims the query", () => {
    assert.deepEqual(
        filterSearchableItems(entries, "  kITASAN ", (entry) => entry.label).map((entry) => entry.id),
        [2],
    );
    assert.deepEqual(
        filterSearchableItems(entries, "INHERIT", (entry) => entry.label).map((entry) => entry.id),
        [3],
    );
});

test("returns a new complete list for an empty query", () => {
    const result = filterSearchableItems(entries, "   ", (entry) => entry.label);
    assert.deepEqual(result, entries);
    assert.notEqual(result, entries);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
    isUmaLogsSection,
    UMA_LOGS_PANEL_DATA_SECTIONS,
    UMA_LOGS_ROUTE_SECTIONS,
    UMA_LOGS_SECTIONS,
    UMA_LOGS_SECTION_LABELS,
} from "./sections";

test("keeps queries routable without exposing it in the primary navigation", () => {
    assert.equal(UMA_LOGS_SECTIONS.includes("queries"), false);
    assert.equal(UMA_LOGS_ROUTE_SECTIONS.includes("queries"), true);
    assert.equal(isUmaLogsSection("queries"), true);
});

test("defines labels and panel-data requirements for every visible section", () => {
    for (const section of UMA_LOGS_SECTIONS) {
        assert.ok(UMA_LOGS_SECTION_LABELS[section]);
    }
    assert.deepEqual(UMA_LOGS_PANEL_DATA_SECTIONS, ["overview", "strategy", "character"]);
    assert.equal(isUmaLogsSection("not-a-section"), false);
    assert.equal(isUmaLogsSection(null), false);
});

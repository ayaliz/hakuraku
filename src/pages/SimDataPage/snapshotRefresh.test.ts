import assert from 'node:assert/strict';
import test from 'node:test';
import { gzip } from 'pako';
import { readSimDataResponse, replacementSnapshot } from './snapshotRefresh';
import type { Snapshot } from './types';

const snapshot = (cmId: string, day: string) => ({ cmId, snapshotId: `${cmId}-${day}`, meta: { capturedThrough: day } } as Snapshot);

test('offers a same-event replacement without switching to another CM', () => {
    const old = snapshot('cm20', '2026-10-10');
    const latest = snapshot('cm20', '2026-10-11');
    assert.equal(replacementSnapshot(old, [snapshot('cm21', '2026-10-12'), latest]), latest);
    assert.equal(replacementSnapshot(old, [old]), undefined);
    assert.equal(replacementSnapshot(old, [snapshot('cm21', '2026-10-12')]), undefined);
    assert.equal(replacementSnapshot(undefined, [latest]), undefined);
});

test('reads JSON and compressed static result files', async () => {
    const payload = { snapshotId: 'cm20-2026-10-11', rows: [] };
    assert.deepEqual(await readSimDataResponse(new Response(JSON.stringify(payload))), payload);
    assert.deepEqual(await readSimDataResponse(new Response(gzip(JSON.stringify(payload)))), payload);
});

test('HTML fallback and HTTP failures produce readable errors, not JSON syntax errors', async () => {
    await assert.rejects(readSimDataResponse(new Response('<!DOCTYPE html><html></html>')), /page instead of result data/);
    await assert.rejects(readSimDataResponse(new Response('{}', { status: 404 })), /HTTP 404/);
    await assert.rejects(readSimDataResponse(new Response('Bad Gateway', { status: 502 })), /HTTP 502/);
});

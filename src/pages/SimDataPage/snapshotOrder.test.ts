import assert from 'node:assert/strict';
import test from 'node:test';
import { newestCmBadgeLabel, newestSimDataSnapshots } from './snapshotOrder';
import type { Snapshot } from './types';

function snapshot(cmId: string, snapshotId: string, capturedThrough?: string): Snapshot {
    return {
        schemaVersion: 1,
        cmId,
        snapshotId,
        label: snapshotId,
        sourceSha256: '',
        engineSha256: '',
        meta: { capturedThrough } as Snapshot['meta'],
    };
}

test('navbar badge names the newest CM, regardless of manifest order', () => {
    assert.equal(newestCmBadgeLabel([{ cmId: 'cm20' }, { cmId: 'cm21' }, { cmId: 'cm19' }]), 'CM21 updated!');
    assert.equal(newestCmBadgeLabel([{ cmId: 'cm21' }, { cmId: 'cm20' }]), 'CM21 updated!');
    assert.equal(newestCmBadgeLabel([{ cmId: 'cm20' }]), 'CM20 updated!');
    assert.equal(newestCmBadgeLabel([{ cmId: 'cm9' }, { cmId: ' CM16-post ' }]), 'CM16 updated!');
    assert.equal(newestCmBadgeLabel([{ cmId: 'local-preview' }]), 'Check this out!');
    assert.equal(newestCmBadgeLabel([]), 'Check this out!');
});

test('defaults to the newest CM regardless of manifest publication order', () => {
    const ordered = newestSimDataSnapshots([
        snapshot('cm17', 'cm17-20260919', '2026-09-19'),
        snapshot('cm20', 'cm20-2026-09-18', '2026-09-18'),
        snapshot('cm16-post', 'cm16-post-20260918', '2026-09-18'),
    ]);
    assert.deepEqual(ordered.map(item => item.cmId), ['cm20', 'cm17', 'cm16-post']);
});

test('uses the newest snapshot within the newest CM', () => {
    const ordered = newestSimDataSnapshots([
        snapshot('cm20', 'cm20-2026-09-18', '2026-09-18'),
        snapshot('cm20', 'cm20-2026-09-19', '2026-09-19'),
        snapshot('cm19', 'cm19-older', '2026-09-20'),
    ]);
    assert.equal(ordered[0].snapshotId, 'cm20-2026-09-19');
});

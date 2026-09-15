import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTeamLinkTarget, encodeTeamLinkTarget } from './teamLinks';

test('packs hash-based team links into their underlying bytes', () => {
    const teamId = 'ab'.repeat(32);
    const encoded = encodeTeamLinkTarget(teamId);
    assert.equal(encoded.length, 44);
    assert.deepEqual(decodeTeamLinkTarget(encoded), { teamId });
});

test('round-trips compact static IDs and accepts legacy links', () => {
    const encoded = encodeTeamLinkTarget('t123');
    assert.deepEqual(decodeTeamLinkTarget(encoded), { teamId: 't123' });
    assert.deepEqual(decodeTeamLinkTarget('t123', 'b456'), { teamId: 't123' });
});

test('rejects malformed team link payloads', () => {
    assert.equal(decodeTeamLinkTarget('not-a-team'), null);
    assert.equal(decodeTeamLinkTarget('hnot_base64!'), null);
});

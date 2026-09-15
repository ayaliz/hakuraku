export type TeamLinkTarget = { teamId: string };

const hashId = /^[a-f0-9]{64}$/i;
const teamDisplayId = /^t\d+$/;

function validTeamId(value: string): boolean {
    return hashId.test(value) || teamDisplayId.test(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
    try {
        const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
        return Uint8Array.from(binary, character => character.charCodeAt(0));
    } catch {
        return null;
    }
}

function hexToBytes(value: string): Uint8Array {
    return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function bytesToHex(value: Uint8Array): string {
    return [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function encodeTeamLinkTarget(teamId: string): string {
    if (!validTeamId(teamId)) throw new Error('Invalid SimData team link target.');
    return hashId.test(teamId)
        ? `h${bytesToBase64Url(hexToBytes(teamId))}`
        : `j${bytesToBase64Url(new TextEncoder().encode(teamId))}`;
}

export function decodeTeamLinkTarget(team: string | null, _legacyMember: string | null = null): TeamLinkTarget | null {
    if (!team) return null;
    if (validTeamId(team)) {
        return { teamId: team };
    }
    const bytes = base64UrlToBytes(team.slice(1));
    if (!bytes) return null;
    if (team[0] === 'h' && (bytes.length === 32 || bytes.length === 64)) {
        return { teamId: bytesToHex(bytes.slice(0, 32)) };
    }
    if (team[0] === 'j') {
        try {
            const decoded = new TextDecoder().decode(bytes);
            const legacy = decoded.startsWith('[') ? JSON.parse(decoded)?.[0] : decoded;
            return typeof legacy === 'string' && validTeamId(legacy) ? { teamId: legacy } : null;
        } catch {
            return null;
        }
    }
    return null;
}

export function teamShareUrl(teamId: string): string {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ tab: 'archetypes', team: encodeTeamLinkTarget(teamId) }).toString();
    url.hash = '';
    return url.toString();
}

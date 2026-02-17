import pako from "pako";
import { Veteran } from "./types";

export function encodeVeterans(veterans: Veteran[]): string {
    const json = JSON.stringify(veterans);
    const compressed = pako.deflate(json);
    // Use chunked fromCharCode to avoid stack overflow on large arrays
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < compressed.length; i += chunk) {
        binary += String.fromCharCode(...compressed.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export function decodeVeterans(encoded: string): Veteran[] {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const json = pako.inflate(bytes, { to: 'string' });
    return JSON.parse(json);
}

export function getVeteransFromUrl(): Veteran[] | null {
    const hash = window.location.hash;
    const match = hash.match(/[#&]v=([^&]*)/);
    if (!match) return null;
    try {
        return decodeVeterans(match[1]);
    } catch {
        return null;
    }
}

export function setVeteransInUrl(veterans: Veteran[]): void {
    const encoded = encodeVeterans(veterans);
    window.location.hash = `v=${encoded}`;
}

export async function copyRosterToClipboard(veterans: Veteran[]): Promise<void> {
    const encoded = encodeVeterans(veterans);
    const url = `${window.location.origin}${window.location.pathname}#v=${encoded}`;
    await navigator.clipboard.writeText(url);
}

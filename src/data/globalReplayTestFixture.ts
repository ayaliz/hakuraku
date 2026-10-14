import pako from "pako";

/** Minimal Global replay with nine result entries, for route eligibility tests. */
export function globalReplayTestFixture(): string {
    const bytes = new Uint8Array(48 + 9 * 31);
    const view = new DataView(bytes.buffer);
    view.setInt32(0, 4, true);
    view.setInt32(12, 9, true);
    view.setInt32(16, 12, true);
    view.setInt32(20, 31, true);
    for (let index = 0; index < 9; index++) {
        view.setInt32(40 + index * 31, index, true);
        view.setFloat32(44 + index * 31, 120 + index, true);
    }
    return btoa(String.fromCharCode(...pako.deflate(bytes)));
}

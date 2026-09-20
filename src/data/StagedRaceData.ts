const STORAGE_PREFIX = "hakuraku:staged-race:";
const tokenPattern = /^[a-f0-9-]{20,80}$/i;

function removeStagedRaces(storage: Storage) {
    try {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (key?.startsWith(STORAGE_PREFIX)) storage.removeItem(key);
        }
    } catch {
        // Storage may be unavailable under strict browser privacy settings.
    }
}

export function stageRaceData(payload: unknown): string {
    const token = crypto.randomUUID();
    const key = `${STORAGE_PREFIX}${token}`;
    const serialized = JSON.stringify(payload);
    removeStagedRaces(sessionStorage);
    try {
        localStorage.setItem(key, serialized);
    } catch {
        removeStagedRaces(localStorage);
        try {
            localStorage.setItem(key, serialized);
        } catch {
            throw new Error("The generated race could not be passed to RaceData because browser storage is unavailable.");
        }
    }
    return token;
}

export function consumeStagedRaceData(token: string): unknown | null {
    if (!tokenPattern.test(token)) return null;
    const key = `${STORAGE_PREFIX}${token}`;
    const serialized = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!serialized) return null;
    removeStagedRaces(sessionStorage);
    localStorage.removeItem(key);
    try {
        return JSON.parse(serialized) as unknown;
    } catch {
        return null;
    }
}

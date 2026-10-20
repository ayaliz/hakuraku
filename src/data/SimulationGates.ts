import { getDetailedRaceCaptureHorses, normalizeDetailedRaceCaptureForSimulation } from "./DetailedRaceEligibility";

const RANDOM_GATES_PREFERENCE_KEY = "hakuraku.racedata.randomizedGates";

export function readRandomGatesPreference(storage?: Pick<Storage, "getItem">): boolean {
    try {
        return (storage ?? globalThis.localStorage)?.getItem(RANDOM_GATES_PREFERENCE_KEY) === "true";
    } catch {
        return false;
    }
}

export function saveRandomGatesPreference(enabled: boolean, storage?: Pick<Storage, "setItem">): void {
    try {
        (storage ?? globalThis.localStorage)?.setItem(RANDOM_GATES_PREFERENCE_KEY, String(enabled));
    } catch {
        // The toggle still works for this page if browser storage is unavailable.
    }
}

/** One-based gates indexed by original (gate-ordered) runner index. */
export function validateSimulationGates(gates: readonly number[], count = gates.length): void {
    if (gates.length !== count || new Set(gates).size !== count
        || gates.some(gate => !Number.isInteger(gate) || gate < 1 || gate > count)) {
        throw new Error("The simulator returned invalid gate assignments.");
    }
}

export function randomSimulationGates(count: number): number[] {
    const gates = Array.from({ length: count }, (_, index) => index + 1);
    for (let index = count - 1; index > 0; index--) {
        // Rejection sampling avoids modulo bias.
        const limit = 0x100000000 - (0x100000000 % (index + 1));
        const word = new Uint32Array(1);
        do { crypto.getRandomValues(word); } while (word[0] >= limit);
        const other = word[0] % (index + 1);
        [gates[index], gates[other]] = [gates[other], gates[index]];
    }
    return gates;
}

export function withSimulationGates(capture: unknown, gates?: readonly number[]): unknown {
    if (!gates) return capture;
    const normalized = normalizeDetailedRaceCaptureForSimulation(capture) as Record<string, any>;
    const horses = getDetailedRaceCaptureHorses(normalized);
    if (!horses) throw new Error("Race runners are unavailable for gate assignment.");
    validateSimulationGates(gates, horses.length);
    const response = (value: any) => value?._responseHorseData ?? value?.responseHorseData ?? value;
    const key = ["race_horse_data_array", "raceHorseDataArray", "<RaceHorse>k__BackingField", "raceHorse"]
        .find(key => Array.isArray(normalized[key]));
    if (!key) throw new Error("Race runners are unavailable for gate assignment.");
    const sorted = [...horses].sort((a, b) => Number(response(a).frame_order) - Number(response(b).frame_order));
    return { ...normalized, [key]: sorted.map((value, index) => {
        const horse = response(value);
        const updated = { ...horse, frame_order: gates[index] };
        if (horse === value) return updated;
        const responseKey = (value as any)._responseHorseData !== undefined ? "_responseHorseData" : "responseHorseData";
        return { ...(value as any), [responseKey]: updated };
    }) };
}

export function horseInfoWithSimulationGates(horses: any[], gates?: readonly number[]): any[] {
    if (!gates) return horses;
    validateSimulationGates(gates, horses.length);
    return [...horses].sort((a, b) => Number(a.frame_order) - Number(b.frame_order))
        .map((horse, index) => ({ ...horse, frame_order: gates[index] }))
        .sort((a, b) => a.frame_order - b.frame_order);
}

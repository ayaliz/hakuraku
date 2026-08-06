import React, { useReducer } from "react";

export type Toggles = { speed: boolean; accel: boolean; skills: boolean; slopes: boolean; blocked: boolean; course: boolean; positionKeep: boolean; heuristics: boolean; skillDuration: boolean; minimap: boolean };

const STORAGE_KEY = "hakuraku:race-replay-toggles";
const DEFAULT_TOGGLES: Toggles = {
    speed: false,
    accel: false,
    skills: true,
    slopes: true,
    blocked: true,
    course: true,
    positionKeep: false,
    heuristics: false,
    skillDuration: false,
    minimap: false,
};

function readStoredToggles(): Partial<Toggles> {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};

        return Object.fromEntries(
            Object.keys(DEFAULT_TOGGLES)
                .filter((key) => typeof parsed[key] === "boolean")
                .map((key) => [key, parsed[key]])
        ) as Partial<Toggles>;
    } catch {
        return {};
    }
}

function writeStoredToggles(toggles: Toggles) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles));
    } catch {
        // Ignore storage failures; toggles should still work for the current mount.
    }
}

export function useToggles(initial?: Partial<Toggles>) {
    const [t, set] = useReducer(
        (s: Toggles, a: Partial<Toggles>) => {
            const next = { ...s, ...a };
            writeStoredToggles(next);
            return next;
        },
        undefined,
        () => ({ ...DEFAULT_TOGGLES, ...readStoredToggles(), ...(initial || {}) })
    );
    const bind = (k: keyof Toggles) => ({
        checked: t[k],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.checked } as Partial<Toggles>),
    });
    const setAll = (enabled: boolean) => set(
        Object.fromEntries(Object.keys(DEFAULT_TOGGLES).map((key) => [key, enabled])) as Toggles,
    );
    return { t, bind, setAll };
}

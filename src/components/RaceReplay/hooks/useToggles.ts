import React, { useReducer } from "react";

type Toggles = { speed: boolean; accel: boolean; skills: boolean; slopes: boolean; blocked: boolean; course: boolean; positionKeep: boolean; hp: boolean };

export function useToggles(initial?: Partial<Toggles>) {
    const [t, set] = useReducer(
        (s: Toggles, a: Partial<Toggles>) => ({ ...s, ...a }),
        { speed: false, accel: false, skills: true, slopes: true, blocked: true, course: true, positionKeep: false, hp: false, ...(initial || {}) }
    );
    const bind = (k: keyof Toggles) => ({
        checked: t[k],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.checked } as Partial<Toggles>),
    });
    return { t, bind };
}

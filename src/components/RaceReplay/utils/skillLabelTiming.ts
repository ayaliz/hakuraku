export const MIN_SKILL_LABEL_VISIBLE_SECONDS = 2;

export function isSkillLabelVisible(
    activationTime: number,
    effectDuration: number,
    currentTime: number,
): boolean {
    const visibleDuration = Math.max(
        MIN_SKILL_LABEL_VISIBLE_SECONDS,
        Math.max(0, effectDuration),
    );
    return currentTime >= activationTime && currentTime < activationTime + visibleDuration;
}

export function getSkillEffectRemainingSeconds(
    activationTime: number,
    effectDuration: number,
    currentTime: number,
): number {
    return Math.max(0, activationTime + Math.max(0, effectDuration) - currentTime);
}

export function formatSkillDurationSuffix(remainingSeconds: number, showTimer: boolean): string {
    return showTimer && remainingSeconds > 0
        ? ` ${remainingSeconds.toFixed(1)}s`
        : "";
}

export function raceStateLabelIdentity(name: string): string {
    if (name.includes("Spot Struggle") || name.includes("Competes (Pos)")) return "Spot Struggle";
    if (name.includes("Dueling") || name.includes("Competes (Speed)")) return "Dueling";
    return name;
}

const TIMED_RACE_STATE_LABELS = new Set([
    "Speed Up",
    "Overtake",
    "Pace Up",
    "Pace Down",
    "Pace Up EX",
    "Downhill Mode",
    "Spot Struggle",
    "Dueling",
    "Fully Charged",
    "Rushed",
]);

export function formatRaceStateLabel(
    name: string,
    startTime: number,
    duration: number,
    currentTime: number,
    showTimer: boolean,
): string {
    const isTimedState = TIMED_RACE_STATE_LABELS.has(name) || name.startsWith("Rushed (");
    if (!showTimer || !isTimedState) {
        return name;
    }

    const remaining = getSkillEffectRemainingSeconds(startTime, duration, currentTime);
    return `${name} ${remaining.toFixed(1)}s`;
}

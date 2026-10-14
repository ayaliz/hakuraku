const COURSE_FACTOR_BASE_DISTANCE = 1000;
const COURSE_FACTOR_MULTIPLIER = 0.0008;

export const POSITION_KEEP_RANGE_LEEWAY = 0.5;

export type PositionKeepRange = {
    min: number;
    max: number;
};

export type SpeedUpCheckHorse = {
    index: number; distance: number; runningStyle: number; isRunaway: boolean; temptationMode: number;
};

/** Potential Speed Up check ranges, not an assertion that its lottery succeeded. */
export function getSpeedUpCheckRanges(horses: SpeedUpCheckHorse[], courseLength: number): Map<number, number> {
    const result = new Map<number, number>();
    if (!(courseLength > 0) || !horses.length) return result;
    const valid = horses.filter(horse => Number.isFinite(horse.distance));
    const leader = valid.reduce<SpeedUpCheckHorse | undefined>((best, horse) => !best || horse.distance > best.distance ? horse : best, undefined);
    const fronts = valid.filter(horse => horse.runningStyle === 1 && !horse.isRunaway).length;
    for (const horse of valid) {
        if (horse.distance < 0 || horse.distance >= courseLength * (10 / 24)) continue;
        const rushed = horse.temptationMode !== 0;
        const forcedFront = horse.temptationMode === 3 || horse.temptationMode === 4;
        const front = horse.runningStyle === 1 || horse.isRunaway;
        if (forcedFront || front && !rushed && horse.index === leader?.index) {
            result.set(horse.index, horse.isRunaway ? 17.5 : fronts === 1 ? 12.5 : 4.5);
        }
    }
    return result;
}

export function getPositionKeepCourseFactor(courseLength: number): number {
    return 1 + (courseLength - COURSE_FACTOR_BASE_DISTANCE) * COURSE_FACTOR_MULTIPLIER;
}

export function getPositionKeepRange(strategy: number, courseLength: number): PositionKeepRange | null {
    const courseFactor = getPositionKeepCourseFactor(courseLength);

    switch (strategy) {
        case 1:
            return { min: 0, max: 3 };
        case 2:
            return { min: 3, max: 5 * courseFactor };
        case 3:
            return { min: 6.5 * courseFactor, max: 7 * courseFactor };
        case 4:
            return { min: 7.5 * courseFactor, max: 8 * courseFactor };
        default:
            return null;
    }
}

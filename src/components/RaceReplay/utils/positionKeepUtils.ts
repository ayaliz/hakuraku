const COURSE_FACTOR_BASE_DISTANCE = 1000;
const COURSE_FACTOR_MULTIPLIER = 0.0008;

export const POSITION_KEEP_RANGE_LEEWAY = 0.5;

export type PositionKeepRange = {
    min: number;
    max: number;
};

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

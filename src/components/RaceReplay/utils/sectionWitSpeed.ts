import { BASE_SPEED_CONSTANT, BASE_SPEED_COURSE_OFFSET, BASE_SPEED_COURSE_SCALE } from './raceConstants';

/** Section wit variance is a percentage of course base speed, not current target speed. */
export function sectionWitSpeedAddend(courseDistance: number, percentage: number): number {
    const baseSpeed = BASE_SPEED_CONSTANT
        - (courseDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE;
    return baseSpeed * percentage / 100;
}

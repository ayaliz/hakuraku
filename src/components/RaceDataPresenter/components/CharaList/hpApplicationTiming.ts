/** HP changes at/after a runner's finish cannot affect their last spurt. */
export function isHpApplicationBeforeFinish(time: number, finishTimeRaw: number | undefined): boolean {
    if (!Number.isFinite(time)) return false;
    // Old/incomplete captures may not supply a finish time; do not hide real hits.
    return finishTimeRaw === undefined || !Number.isFinite(finishTimeRaw) || finishTimeRaw <= 0
        || time < finishTimeRaw;
}

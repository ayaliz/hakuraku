import type { RaceSimulateData } from './race_data_pb';
import type { DetailedHorseMetrics } from './DetailedRaceSimulation';

/** Presentation only: preserve the original replay and simulator response. */
export function freezeHpAtFinish(
    raceData: RaceSimulateData | undefined,
    metrics: Record<number, DetailedHorseMetrics> | undefined,
): { raceData: RaceSimulateData | undefined; metrics: Record<number, DetailedHorseMetrics> | undefined } {
    if (!raceData) return { raceData, metrics };
    const finishHp = new Map<number, number>();
    const lockedMetrics = metrics ? { ...metrics } : undefined;
    raceData.horseResult.forEach((result, index) => {
        const finish = result.finishTimeRaw;
        if (!Number.isFinite(finish) || finish <= 0) return;
        const horse = metrics?.[index];
        let hp: number | undefined;
        if (horse?.finalHp !== undefined) {
            // Applied deltas include clamping, unlike requested deltas. Reversing
            // them exactly restores HP even when a late hit drained it to zero.
            const postFinishDelta = (horse.hpSkillApplications ?? [])
                .filter(application => application.targetHorseIndex === index && application.time >= finish)
                .reduce((sum, application) => sum + application.appliedHpDelta, 0);
            hp = Math.max(0, horse.finalHp - postFinishDelta);
            if (lockedMetrics) {
                const exhaustedAfterFinish = horse.hpExhaustedTime != null && horse.hpExhaustedTime >= finish;
                lockedMetrics[index] = { ...horse, finalHp: hp,
                    ...(exhaustedAfterFinish ? { hpExhaustedTime: null, hpExhaustedDistance: null, hpDeficit: 0 } : {}) };
            }
        } else {
            // Recorded HP is sampled: use the finish-crossing sample, not the
            // last sample after every runner (and subsequent skills) has finished.
            const crossing = raceData.frame.find(frame => frame.time >= finish && frame.horseFrame[index]);
            hp = crossing?.horseFrame[index]?.hp;
        }
        if (hp !== undefined && Number.isFinite(hp)) finishHp.set(index, hp);
    });
    const frames = raceData.frame.map(frame => {
        let changed = false;
        const horses = frame.horseFrame.map((horse, index) => {
            const hp = finishHp.get(index);
            if (hp === undefined || frame.time < raceData.horseResult[index].finishTimeRaw) return horse;
            changed = true;
            return { ...horse, hp };
        });
        return changed ? { ...frame, horseFrame: horses } : frame;
    });
    return { raceData: { ...raceData, frame: frames }, metrics: lockedMetrics };
}

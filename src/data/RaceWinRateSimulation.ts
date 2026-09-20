import { adjustStat } from "../components/RaceReplay/utils/speedCalculations";

export type RaceWinRateBatchStatus = "queued" | "running" | "cancel_requested" | "completed" | "cancelled" | "failed";

export type RaceWinRateRunner = {
    slot: number;
    teamIndex: number;
    memberIndex: number;
    teamId: string;
    frameOrder: number;
    gateNumber: number;
    cardId: number;
    charaId: number;
    rawStamina?: number;
    motivation?: number;
    /** Internal running-style index: Nige=0 through Oonige=4. */
    runningStyle?: number;
    wins: number;
    winRate: number;
    skillActivations?: RaceWinRateSkillActivation[];
};

export type RaceWinRateSkillActivation = {
    skillId: number;
    racesActivated: number;
    activations: number;
    additionalActivations: number;
    setupActivations: number;
};

export type RaceWinRateTeam = {
    teamId: string;
    wins: number;
    winRate: number;
};

export type RaceWinRateRace = {
    index: number;
    seed: number;
    finishOrder: number[];
    lastSpurtDecisions?: number[];
    finalHp?: number[];
    hpDeficit?: number[];
    /** Per runner, HP at each last-spurt calculation; the first item is the initial decision. */
    checkHp?: number[][];
    /** Per runner, HP required for a full spurt at each corresponding calculation. */
    fullSpurtNeedHp?: number[][];
    spurtCalculationResults?: number[][];
    maxHp?: number[];
    hpEffectRate?: number[];
    hpEffectRateBeforeFirstSpurt?: number[];
    winner?: {
        runnerIndex?: number;
        gateNumber?: number;
        cardId?: number;
        charaId?: number;
        teamId?: string;
        buildId?: string;
    };
};

export type RaceWinRateBatch = {
    jobId: string;
    accessToken?: string;
    status: RaceWinRateBatchStatus;
    seedStart: number;
    totalRaces: number;
    completedRaces: number;
    progress: number;
    queue: { position: number; jobsAhead: number; racesAhead: number } | null;
    results: {
        engineBuild: string | null;
        teams: RaceWinRateTeam[];
        runners: RaceWinRateRunner[];
        races: RaceWinRateRace[];
    };
    error: string | null;
    links: {
        status: string;
        heartbeat: string;
        cancel: string;
    };
};

export function isActiveRaceWinRateBatch(batch: RaceWinRateBatch | undefined): boolean {
    return batch?.status === "queued" || batch?.status === "running" || batch?.status === "cancel_requested";
}

export function raceWinRatePercent(value: number): string {
    return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
}

/** Smallest extra HP that would cover the requested share of observed races. */
export function extraHpNeededForRate(samples: number[], targetRate = 0.95): number | null {
    const valid = samples.filter(value => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
    if (!valid.length || !Number.isFinite(targetRate) || targetRate <= 0 || targetRate > 1) return null;
    return valid[Math.max(0, Math.ceil(valid.length * targetRate) - 1)];
}

export function firstSpurtHpMargin(race: RaceWinRateRace, runnerIndex: number): number | null {
    const checkHp = race.checkHp?.[runnerIndex]?.[0];
    const requiredHp = race.fullSpurtNeedHp?.[runnerIndex]?.[0];
    return Number.isFinite(checkHp) && Number.isFinite(requiredHp)
        ? Number(checkHp) - Number(requiredHp)
        : null;
}

export function survivalHpMargin(race: RaceWinRateRace, runnerIndex: number): number | null {
    const finalHp = race.finalHp?.[runnerIndex];
    const deficit = race.hpDeficit?.[runnerIndex];
    if (Number.isFinite(finalHp) && Number(finalHp) > 0) return Number(finalHp);
    if (Number.isFinite(deficit) && Number(deficit) > 0) return -Number(deficit);
    return Number.isFinite(finalHp) ? Number(finalHp) : null;
}

export type HpThresholdKind = "spurt" | "survival";

/** Extra maximum HP needed after accounting for MaxHP-scaled recovery and debuff effects. */
export function extraMaxHpNeeded(
    race: RaceWinRateRace,
    runnerIndex: number,
    kind: HpThresholdKind,
): number | null {
    const margin = kind === "spurt"
        ? firstSpurtHpMargin(race, runnerIndex)
        : survivalHpMargin(race, runnerIndex);
    if (margin === null) return null;
    if (margin >= 0) return 0;
    const rate = kind === "spurt"
        ? race.hpEffectRateBeforeFirstSpurt?.[runnerIndex]
        : race.hpEffectRate?.[runnerIndex];
    const multiplier = 1 + Number(rate);
    return Number.isFinite(multiplier) && multiplier > 0
        ? -margin / multiplier
        : null;
}

const HP_STRATEGY_COEFFICIENT: Record<number, number> = {
    0: 0.95,  // Nige
    1: 0.89,  // Senkou
    2: 1.0,   // Sashi
    3: 0.995, // Oikomi
    4: 0.86,  // Oonige
};

/**
 * Smallest whole raw-stamina increase that supplies the requested MaxHP.
 * adjustStat applies the shared overcap and mood rules; passive bonuses are
 * intentionally absent because the simulator adds them after mood adjustment.
 */
export function rawStaminaNeededForMaxHp(
    extraMaxHp: number,
    rawStamina: number,
    motivation: number,
    runningStyle: number,
): number | null {
    const strategyCoefficient = HP_STRATEGY_COEFFICIENT[runningStyle];
    if (!Number.isFinite(extraMaxHp) || extraMaxHp < 0
        || !Number.isFinite(rawStamina) || rawStamina < 0
        || !Number.isFinite(motivation) || !strategyCoefficient) return null;
    if (extraMaxHp === 0) return 0;
    const neededAdjustedStamina = extraMaxHp / (0.8 * strategyCoefficient);
    const startingAdjustedStamina = adjustStat(rawStamina, motivation, 0);
    const suppliesEnough = (increase: number) =>
        adjustStat(rawStamina + increase, motivation, 0) - startingAdjustedStamina + 1e-7
            >= neededAdjustedStamina;
    let high = Math.max(1, Math.ceil(neededAdjustedStamina));
    while (!suppliesEnough(high) && high < 1_000_000) high *= 2;
    if (!suppliesEnough(high)) return null;
    let low = 0;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (suppliesEnough(middle)) high = middle;
        else low = middle + 1;
    }
    return low;
}

export type HpRateMilestone = { rate: number; extraHp: number };

export function hpRateMilestones(margins: number[], step = 0.05, maxRegularMilestones = 6): HpRateMilestone[] {
    const valid = margins.filter(Number.isFinite);
    if (!valid.length || !Number.isFinite(step) || step <= 0 || step > 1) return [];
    const deficits = valid.map(value => Math.max(0, -value));
    const successes = valid.filter(value => value >= 0).length;
    const currentRate = successes / valid.length;
    const firstTarget = Math.min(1, (Math.floor((currentRate + 1e-10) / step) + 1) * step);
    const targets: number[] = [];
    for (let target = firstTarget; target <= 1 + 1e-10; target += step) {
        targets.push(Math.round(Math.min(1, target) * 1e10) / 1e10);
    }
    if (targets.at(-1) !== 1) targets.push(1);
    const displayedTargets = targets.slice(-Math.max(1, Math.floor(maxRegularMilestones) + 1));
    return displayedTargets.map(rate => ({
        rate,
        extraHp: extraHpNeededForRate(deficits, rate) ?? 0,
    }));
}

export function placementHistogram(races: RaceWinRateRace[], runnerIndex: number, positionCount = 9): number[] {
    const counts = Array.from({ length: positionCount }, () => 0);
    for (const race of races) {
        const placement = race.finishOrder?.indexOf(runnerIndex) ?? -1;
        if (placement >= 0 && placement < positionCount) counts[placement] += 1;
    }
    return counts;
}

import type { RaceSimulateData, RaceSimulateEventData } from "../../../data/race_data_pb";
import { RaceSimulateEventData_SimulateEventType } from "../../../data/race_data_pb";
import { isSkillEventTargetingFrame } from "../../../data/RaceDataUtils";
import { getSkillDef } from "./SkillDataUtils";

export const RANDOM_SELF_HP_DRAIN_SKILL_IDS = new Set([202031, 202032]);

// Negative type-9 effects are otherwise opponent debuffs. Keep the self-cost
// distinction explicit so mixed skills such as Every Rose Has Its Fangs are
// not mistaken for self drains.
export const FIXED_SELF_HP_DRAIN_SKILL_IDS = new Set([
    100711,
    900711,
    202151,
    202152,
    202391,
    202392,
    210101,
]);

export const SELF_HP_DRAIN_SKILL_IDS = new Set([
    ...RANDOM_SELF_HP_DRAIN_SKILL_IDS,
    ...FIXED_SELF_HP_DRAIN_SKILL_IDS,
]);

export const RANDOM_SELF_HP_DRAIN_OUTCOMES = [0, 0.02, 0.04] as const;
export type RandomSelfHpDrainRatio = typeof RANDOM_SELF_HP_DRAIN_OUTCOMES[number];

export type RandomSelfHpDrainEstimate = {
    skillId: number;
    frameOrder: number;
    activationTime: number;
    drainRatio: RandomSelfHpDrainRatio;
    estimatedDrainRatio: number;
    estimatedHpDrain: number;
    classifiedHpDrain: number;
    classificationErrorRatio: number;
    maxHp: number;
    observedWindowLoss: number;
    expectedConsumptionLoss: number;
    otherHpEffectLoss: number;
    intervalStartTime: number;
    intervalEndTime: number;
    previousConsumptionRate: number;
    nextConsumptionRate: number;
};

function getConditionGroupEffects(skillId: number, conditionGroupIndex?: number) {
    const def = getSkillDef(skillId);
    if (!def || def.conditionGroups.length === 0) return [];
    const index = conditionGroupIndex !== undefined
        && Number.isInteger(conditionGroupIndex)
        && conditionGroupIndex >= 0
        && conditionGroupIndex < def.conditionGroups.length
        ? conditionGroupIndex
        : 0;
    return def.conditionGroups[index]?.effects ?? [];
}

export function isSelfHpDrainSkill(skillId: number): boolean {
    return SELF_HP_DRAIN_SKILL_IDS.has(skillId);
}

export function getFixedSelfHpDrainRatio(skillId: number, conditionGroupIndex?: number): number {
    if (!FIXED_SELF_HP_DRAIN_SKILL_IDS.has(skillId)) return 0;
    return getConditionGroupEffects(skillId, conditionGroupIndex).reduce((total, effect) => (
        effect.type === 9 && effect.value < 0
            ? total + Math.abs(effect.value) / 10000
            : total
    ), 0);
}

function getSelfRecoveryRatio(skillId: number, conditionGroupIndex?: number): number {
    return getConditionGroupEffects(skillId, conditionGroupIndex).reduce((total, effect) => (
        effect.type === 9 && effect.value > 0
            ? total + effect.value / 10000
            : total
    ), 0);
}

function getTargetHpDrainRatio(skillId: number, conditionGroupIndex?: number): number {
    return getConditionGroupEffects(skillId, conditionGroupIndex).reduce((total, effect) => (
        effect.type === 9 && effect.value < 0
            ? total + Math.abs(effect.value) / 10000
            : total
    ), 0);
}

function eventHpLossAdjustment(
    raceData: RaceSimulateData,
    event: RaceSimulateEventData,
    targetFrameOrder: number,
    maxHp: number,
    raceHorseInfo?: any[],
    ignoredRandomEvent?: RaceSimulateEventData,
): number {
    if (event.type !== RaceSimulateEventData_SimulateEventType.SKILL || !event.param) return 0;

    const casterFrameOrder = event.param[0];
    const skillId = event.param[1];
    const conditionGroupIndex = event.param?.[3];
    let loss = 0;

    if (casterFrameOrder === targetFrameOrder) {
        loss -= maxHp * getSelfRecoveryRatio(skillId, conditionGroupIndex);
        if (event !== ignoredRandomEvent) {
            loss += maxHp * getFixedSelfHpDrainRatio(skillId, conditionGroupIndex);
        }
    }

    if (isSkillEventTargetingFrame(raceData, event, targetFrameOrder, raceHorseInfo)) {
        loss += maxHp * getTargetHpDrainRatio(skillId, conditionGroupIndex);
    }

    return loss;
}

function hpLossAdjustmentInInterval(
    raceData: RaceSimulateData,
    targetFrameOrder: number,
    maxHp: number,
    startTime: number,
    endTime: number,
    raceHorseInfo?: any[],
    ignoredRandomEvent?: RaceSimulateEventData,
): number {
    return raceData.event.reduce((total, wrappedEvent) => {
        const event = wrappedEvent?.event;
        const time = event?.frameTime ?? 0;
        if (!event || time <= startTime || time > endTime) return total;
        return total + eventHpLossAdjustment(
            raceData,
            event,
            targetFrameOrder,
            maxHp,
            raceHorseInfo,
            ignoredRandomEvent,
        );
    }, 0);
}

function adjustedConsumptionRate(
    raceData: RaceSimulateData,
    targetFrameOrder: number,
    maxHp: number,
    startFrameIndex: number,
    raceHorseInfo?: any[],
): number | undefined {
    const startFrame = raceData.frame[startFrameIndex];
    const endFrame = raceData.frame[startFrameIndex + 1];
    const startHorse = startFrame?.horseFrame?.[targetFrameOrder];
    const endHorse = endFrame?.horseFrame?.[targetFrameOrder];
    if (!startFrame || !endFrame || !startHorse || !endHorse) return undefined;

    const startTime = startFrame.time ?? 0;
    const endTime = endFrame.time ?? startTime;
    const duration = endTime - startTime;
    if (!(duration > 0)) return undefined;

    const observedLoss = (startHorse.hp ?? 0) - (endHorse.hp ?? 0);
    const hpEffectLoss = hpLossAdjustmentInInterval(
        raceData,
        targetFrameOrder,
        maxHp,
        startTime,
        endTime,
        raceHorseInfo,
    );
    return Math.max(0, observedLoss - hpEffectLoss) / duration;
}

export function estimateRandomSelfHpDrain(
    raceData: RaceSimulateData,
    event: RaceSimulateEventData,
    raceHorseInfo?: any[],
): RandomSelfHpDrainEstimate | undefined {
    if (
        event.type !== RaceSimulateEventData_SimulateEventType.SKILL
        || !event.param
        || !RANDOM_SELF_HP_DRAIN_SKILL_IDS.has(event.param[1])
    ) return undefined;

    const frameOrder = event.param[0];
    const activationTime = event.frameTime ?? 0;
    const endFrameIndex = raceData.frame.findIndex(frame => (frame.time ?? 0) >= activationTime);
    const startFrameIndex = endFrameIndex - 1;
    if (startFrameIndex < 1 || endFrameIndex < 0 || endFrameIndex + 1 >= raceData.frame.length) return undefined;

    const startFrame = raceData.frame[startFrameIndex];
    const endFrame = raceData.frame[endFrameIndex];
    const startHorse = startFrame?.horseFrame?.[frameOrder];
    const endHorse = endFrame?.horseFrame?.[frameOrder];
    const maxHp = raceData.frame[0]?.horseFrame?.[frameOrder]?.hp ?? 0;
    if (!startFrame || !endFrame || !startHorse || !endHorse || !(maxHp > 0)) return undefined;

    const intervalStartTime = startFrame.time ?? 0;
    const intervalEndTime = endFrame.time ?? intervalStartTime;
    const intervalDuration = intervalEndTime - intervalStartTime;
    if (!(intervalDuration > 0)) return undefined;

    const previousConsumptionRate = adjustedConsumptionRate(
        raceData,
        frameOrder,
        maxHp,
        startFrameIndex - 1,
        raceHorseInfo,
    );
    const nextConsumptionRate = adjustedConsumptionRate(
        raceData,
        frameOrder,
        maxHp,
        endFrameIndex,
        raceHorseInfo,
    );
    if (previousConsumptionRate === undefined || nextConsumptionRate === undefined) return undefined;

    // The activation's instantaneous HP change is folded into the received-frame
    // interval containing it. Estimate ordinary consumption from the clean
    // intervals on either side, after removing any known instant HP effects.
    const expectedConsumptionLoss = (
        (previousConsumptionRate + nextConsumptionRate) / 2
    ) * intervalDuration;
    const observedWindowLoss = (startHorse.hp ?? 0) - (endHorse.hp ?? 0);
    const otherHpEffectLoss = hpLossAdjustmentInInterval(
        raceData,
        frameOrder,
        maxHp,
        intervalStartTime,
        intervalEndTime,
        raceHorseInfo,
        event,
    );
    const estimatedHpDrain = observedWindowLoss - expectedConsumptionLoss - otherHpEffectLoss;
    const estimatedDrainRatio = estimatedHpDrain / maxHp;
    const drainRatio = RANDOM_SELF_HP_DRAIN_OUTCOMES.reduce((nearest, outcome) => (
        Math.abs(outcome - estimatedDrainRatio) < Math.abs(nearest - estimatedDrainRatio)
            ? outcome
            : nearest
    ), RANDOM_SELF_HP_DRAIN_OUTCOMES[0]);

    return {
        skillId: event.param[1],
        frameOrder,
        activationTime,
        drainRatio,
        estimatedDrainRatio,
        estimatedHpDrain,
        classifiedHpDrain: maxHp * drainRatio,
        classificationErrorRatio: Math.abs(estimatedDrainRatio - drainRatio),
        maxHp,
        observedWindowLoss,
        expectedConsumptionLoss,
        otherHpEffectLoss,
        intervalStartTime,
        intervalEndTime,
        previousConsumptionRate,
        nextConsumptionRate,
    };
}

export function getSelfHpDrainEstimate(
    raceData: RaceSimulateData,
    event: RaceSimulateEventData,
    raceHorseInfo?: any[],
): { drainRatio: number; estimatedHpDrain: number; randomEstimate?: RandomSelfHpDrainEstimate } | undefined {
    const skillId = event.param?.[1];
    if (!SELF_HP_DRAIN_SKILL_IDS.has(skillId)) return undefined;

    if (RANDOM_SELF_HP_DRAIN_SKILL_IDS.has(skillId)) {
        const randomEstimate = estimateRandomSelfHpDrain(raceData, event, raceHorseInfo);
        if (!randomEstimate) return undefined;
        return {
            drainRatio: randomEstimate.drainRatio,
            estimatedHpDrain: randomEstimate.classifiedHpDrain,
            randomEstimate,
        };
    }

    const drainRatio = getFixedSelfHpDrainRatio(skillId, event.param?.[3]);
    const frameOrder = event.param[0];
    const maxHp = raceData.frame[0]?.horseFrame?.[frameOrder]?.hp ?? 0;
    return {
        drainRatio,
        estimatedHpDrain: maxHp * drainRatio,
    };
}

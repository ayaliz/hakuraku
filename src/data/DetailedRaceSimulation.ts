import type { RaceSimulateData } from "./race_data_pb";

export type RaceModeSpan = {
    startTime: number;
    endTime: number;
    mask: number;
    phase?: number;
};

export type DetailedSkillActiveSpan = {
    skillId: number;
    detailIndex: number;
    startTime: number;
    endTime: number;
};

/**
 * Resolves the simulator-observed active duration for one skill activation.
 * A detail index identifies the condition branch that activated, rather than
 * an individual effect within that branch.
 *
 * `undefined` means this race has no authoritative span data. A zero means
 * authoritative data is present, but the activation had no timed effect.
 */
export function getDetailedSkillActivationDuration(
    spans: DetailedSkillActiveSpan[] | undefined,
    skillId: number,
    activationTime: number,
    detailIndex?: number,
): number | undefined {
    if (spans === undefined) return undefined;
    const closest = spans
        .filter(span => span.skillId === skillId
            && (detailIndex === undefined || span.detailIndex === detailIndex))
        .sort((a, b) => Math.abs(a.startTime - activationTime) - Math.abs(b.startTime - activationTime))[0];
    if (!closest || Math.abs(closest.startTime - activationTime) > 0.15) return 0;
    return Math.max(0, closest.endTime - closest.startTime);
}

export type DetailedFrontBlockSpan = {
    startTime: number;
    endTime: number;
    blockerHorseIndex: number;
};

export type DetailedTemptationSpan = {
    startTime: number;
    endTime: number;
    mode: number;
};

export type DetailedPaceMakerSpan = {
    startTime: number;
    endTime: number;
    horseIndex: number;
};

export type DetailedPositionKeepReferenceSpan = {
    startTime: number;
    endTime: number;
    referenceHorseIndex: number;
};

export type DetailedPositionKeepDecision = {
    time: number;
    sequence: number;
    attemptedMode: number;
    referenceHorseIndex: number;
    outcome: string;
    roll?: number | null;
    threshold?: number | null;
};

export type DetailedBaseTargetSpeedSection = {
    sectionIndex: number;
    phase: number;
    baseTargetSpeed: number;
    random: number;
    randomPercentage: number;
};

export type DetailedSkillActivationDecision = {
    skillId: number;
    required: boolean;
    passed: boolean;
    roll?: number | null;
    threshold?: number | null;
    activated: boolean;
};

export type DetailedHpSkillApplication = {
    time: number;
    skillId: number;
    casterHorseIndex: number;
    targetHorseIndex: number;
    requestedHpDelta: number;
    appliedHpDelta: number;
};

export type DetailedTemptationDecision = {
    roll: number;
    threshold: number;
    enabled: boolean;
    startSection: number;
    preventedByModifier: boolean;
};

export type DetailedLastSpurtDecision = {
    result: string;
    checkDistance: number;
    checkHp: number;
    fullSpurtNeedHp: number;
    fullSpurtTargetSpeed: number;
    selectedStartDistance: number;
    selectedTargetSpeed: number;
    delayPenalty: boolean;
    speedPenalty: boolean;
    calculationCount?: number;
    time?: number;
};

export type DetailedHorseMetrics = {
    horseIndex: number;
    worldTransformDistanceLoss: number;
    lastSpurtDecision?: DetailedLastSpurtDecision | null;
    lastSpurtDecisions?: DetailedLastSpurtDecision[];
    rushedFrames?: number;
    startHp?: number;
    finalHp?: number;
    hpDeficit?: number;
    maxHp?: number;
    hpExhaustedTime?: number | null;
    hpExhaustedDistance?: number | null;
    lostStartAccelerationFrame?: boolean;
    finishDistanceToPrevious?: number | null;
    // Continuous telemetry is deliberately sampled only at normal replay-capture
    // times. Tick-exact spans below annotate events; they are not position samples.
    sampleTimes?: number[];
    targetSpeeds?: number[];
    accelerationRates?: (number | null)[];
    frontBlockSpans?: DetailedFrontBlockSpan[];
    temptationSpans?: DetailedTemptationSpan[];
    paceMakerSpans?: DetailedPaceMakerSpan[];
    positionKeepReferenceSpans?: DetailedPositionKeepReferenceSpan[];
    positionKeepDecisions?: DetailedPositionKeepDecision[];
    baseTargetSpeedSections?: DetailedBaseTargetSpeedSection[];
    activeSkillSpans?: DetailedSkillActiveSpan[];
    skillActivationDecisions?: DetailedSkillActivationDecision[];
    hpSkillApplications?: DetailedHpSkillApplication[];
    temptationDecision?: DetailedTemptationDecision | null;
};

export type DetailedRaceSimulationResponse = {
    engineBuild: string;
    seed: number;
    replay: { data: string };
    annotations: {
        schemaVersion: number;
        flags: Record<string, number>;
        sampleTimes?: number[];
        paceMakerSpans?: DetailedPaceMakerSpan[];
        horses: (DetailedHorseMetrics & { spans: RaceModeSpan[] })[];
    };
    diagnostics?: { simulationMilliseconds?: number };
};

const CURRENT_REPLAY_VERSION = 100000002;
const DETAILED_ANNOTATION_SCHEMA_VERSION = 7;
const HORSE_FRAME_SIZE = 12;
const HORSE_RESULT_SIZE = 31;
const FINISH_DIFF_MATCH_TOLERANCE_SECONDS = 0.0001;
const REQUIRED_ANNOTATION_FLAGS: Record<string, number> = {
    positionKeepSpeedUp: 1,
    positionKeepOvertake: 2,
    positionKeepPaceUp: 4,
    positionKeepPaceDown: 8,
    positionKeepPaceUpEx: 16,
    downhill: 32,
    spotStruggle: 64,
    dueling: 128,
    conservePower: 256,
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
    return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isPermutation(values: unknown[], count: number): boolean {
    return values.length === count
        && values.every(value => isIntegerBetween(value, 0, count - 1))
        && new Set(values).size === count;
}

function getReplayStructureError(
    replay: RaceSimulateData,
    source: "recorded race" | "simulator replay",
    expectedRunnerCount?: number,
): string | null {
    const runnerCount = Number(replay.horseNum);
    const frames = replay.frame ?? [];
    const results = replay.horseResult ?? [];
    const events = replay.event ?? [];
    const invalid = (detail: string) => `The ${source} has invalid ${detail}.`;

    if (!Number.isInteger(runnerCount) || runnerCount <= 0
        || (expectedRunnerCount !== undefined && runnerCount !== expectedRunnerCount)
        || results.length !== runnerCount) return invalid("runner/result counts");
    if (!replay.header
        || replay.header.maxLength !== 4
        || replay.header.version !== CURRENT_REPLAY_VERSION) return invalid("binary replay version");
    if (replay.horseFrameSize !== HORSE_FRAME_SIZE
        || replay.horseResultSize !== HORSE_RESULT_SIZE
        || replay.frameSize !== 4 + runnerCount * HORSE_FRAME_SIZE) return invalid("binary record sizes");
    if (frames.length < 2 || replay.frameCount !== frames.length) return invalid("frame count");
    if (replay.eventCount !== events.length) return invalid("event count");

    let previousFrameTime = -Infinity;
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const frame = frames[frameIndex];
        if (!isFiniteNumber(frame.time)
            || (frameIndex === 0 ? frame.time !== 0 : frame.time <= previousFrameTime)
            || frame.horseFrame.length !== runnerCount) return invalid("frame chronology or runner data");
        previousFrameTime = frame.time;
        for (const horse of frame.horseFrame) {
            if (!isFiniteNumber(horse.distance)
                || !isIntegerBetween(horse.lanePosition, 0, 0xffff)
                || !isIntegerBetween(horse.speed, 0, 0xffff)
                || !isIntegerBetween(horse.hp, 0, 0xffff)
                || !isIntegerBetween(horse.temptationMode, 0, 4)
                || !(horse.blockFrontHorseIndex === -1
                    || isIntegerBetween(horse.blockFrontHorseIndex, 0, runnerCount - 1))) {
                return invalid("horse-frame values");
            }
        }
    }

    if (!isPermutation(results.map(result => result.finishOrder), runnerCount)
        || !isPermutation(results.map(result => result.gutsOrder), runnerCount)
        || !isPermutation(results.map(result => result.wizOrder), runnerCount)) {
        return invalid("result rankings");
    }
    for (const result of results) {
        if (!isFiniteNumber(result.finishTime) || result.finishTime <= 0
            || !isFiniteNumber(result.finishTimeRaw) || result.finishTimeRaw <= 0
            || !isFiniteNumber(result.finishDiffTime) || result.finishDiffTime < 0
            || !isFiniteNumber(result.startDelayTime)
            || result.startDelayTime < 0 || result.startDelayTime > 1
            || !isFiniteNumber(result.lastSpurtStartDistance)
            || !isIntegerBetween(result.runningStyle, 1, 4)
            || !isIntegerBetween(result.defeat, 0, 14)) return invalid("horse-result values");
    }
    const byFinishOrder = [...results].sort((left, right) => left.finishOrder - right.finishOrder);
    if (byFinishOrder[0].finishDiffTime !== 0
        || byFinishOrder.some((result, index) => index > 0
            && result.finishTimeRaw < byFinishOrder[index - 1].finishTimeRaw)) {
        return invalid("finish-time ordering");
    }

    const horizon = frames.at(-1)!.time;
    let previousEventTime = -Infinity;
    for (const wrapper of events) {
        const event = wrapper.event;
        if (!event
            || !isFiniteNumber(event.frameTime)
            || event.frameTime < previousEventTime
            || event.frameTime < 0
            || event.frameTime > horizon
            || !isIntegerBetween(event.type, 0, 255)
            || !isIntegerBetween(event.paramCount, 0, 64)
            || event.param.length !== event.paramCount
            || wrapper.eventSize !== 6 + 4 * event.paramCount
            || event.param.some(value => !Number.isInteger(value))) return invalid("event data");
        previousEventTime = event.frameTime;
        if (event.type === 3
            && (event.param.length !== 6
                || !isIntegerBetween(event.param[0], 0, runnerCount - 1)
                || !Number.isInteger(event.param[1]) || event.param[1] <= 0
                || !Number.isInteger(event.param[3]) || event.param[3] < 0
                || !isIntegerBetween(event.param[4], 0, (1 << runnerCount) - 1)
                || (source === "simulator replay" && event.param[2] < 0))) {
            return invalid("skill-event data");
        }
    }
    return null;
}

function validTimeSpan(value: unknown, horizon: number): value is { startTime: number; endTime: number } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const span = value as Record<string, unknown>;
    return isFiniteNumber(span.startTime)
        && isFiniteNumber(span.endTime)
        && span.startTime >= 0
        && span.startTime < span.endTime
        && span.endTime <= horizon;
}

function nullableFinite(value: unknown): boolean {
    return value === null || isFiniteNumber(value);
}

function sameLastSpurtDecision(left: DetailedLastSpurtDecision | null, right: DetailedLastSpurtDecision): boolean {
    return left !== null
        && left.result === right.result
        && left.checkDistance === right.checkDistance
        && left.checkHp === right.checkHp
        && left.fullSpurtNeedHp === right.fullSpurtNeedHp
        && left.fullSpurtTargetSpeed === right.fullSpurtTargetSpeed
        && left.selectedStartDistance === right.selectedStartDistance
        && left.selectedTargetSpeed === right.selectedTargetSpeed
        && left.delayPenalty === right.delayPenalty
        && left.speedPenalty === right.speedPenalty
        && left.calculationCount === right.calculationCount
        && left.time === right.time;
}

function getDetailedAnnotationsError(
    response: DetailedRaceSimulationResponse,
    replay: RaceSimulateData,
): string | null {
    const invalid = (detail: string) => `The simulator annotations violate schema 7 (${detail}).`;
    const annotations = response.annotations;
    const runnerCount = replay.horseNum;
    const horizon = replay.frame.at(-1)!.time;
    if (annotations.schemaVersion !== DETAILED_ANNOTATION_SCHEMA_VERSION) return invalid("schema version");
    if (!annotations.flags || Object.entries(REQUIRED_ANNOTATION_FLAGS).some(
        ([name, value]) => annotations.flags[name] !== value)) return invalid("mode flags");
    if (!Array.isArray(annotations.sampleTimes)
        || annotations.sampleTimes.length !== replay.frame.length
        || annotations.sampleTimes.some((time, index) => !isFiniteNumber(time)
            || time !== replay.frame[index].time
            || (index > 0 && time < annotations.sampleTimes![index - 1]))) {
        return invalid("sample times");
    }
    if (!Array.isArray(annotations.paceMakerSpans)
        || annotations.paceMakerSpans.some(span => !validTimeSpan(span, horizon)
            || !isIntegerBetween(span.horseIndex, 0, runnerCount - 1))) return invalid("pace-maker spans");
    if (!Array.isArray(annotations.horses)
        || annotations.horses.length !== runnerCount
        || annotations.horses.some((horse, index) => horse.horseIndex !== index)) {
        return invalid("horse ordering");
    }

    const requiredArrayFields = [
        "spans",
        "frontBlockSpans",
        "temptationSpans",
        "positionKeepReferenceSpans",
        "positionKeepDecisions",
        "baseTargetSpeedSections",
        "lastSpurtDecisions",
        "targetSpeeds",
        "accelerationRates",
        "activeSkillSpans",
        "skillActivationDecisions",
        "hpSkillApplications",
    ] as const;
    for (const horse of annotations.horses) {
        if (requiredArrayFields.some(field => !Array.isArray(horse[field]))) return invalid("missing horse arrays");
        if (horse.targetSpeeds!.length !== annotations.sampleTimes.length
            || horse.accelerationRates!.length !== annotations.sampleTimes.length
            || horse.targetSpeeds!.some(value => !isFiniteNumber(value))
            || horse.accelerationRates!.some(value => !nullableFinite(value))) return invalid("continuous telemetry");
        if (!isFiniteNumber(horse.worldTransformDistanceLoss) || horse.worldTransformDistanceLoss < 0
            || !isIntegerBetween(horse.rushedFrames, 0, Number.MAX_SAFE_INTEGER)
            || !isFiniteNumber(horse.startHp) || horse.startHp < 0
            || !isFiniteNumber(horse.finalHp) || horse.finalHp < 0
            || !isFiniteNumber(horse.hpDeficit) || horse.hpDeficit < 0
            || !isFiniteNumber(horse.maxHp) || horse.maxHp < 0
            || typeof horse.lostStartAccelerationFrame !== "boolean"
            || !nullableFinite(horse.finishDistanceToPrevious)
            || (horse.finishDistanceToPrevious !== null && horse.finishDistanceToPrevious! < 0)) {
            return invalid("horse metrics");
        }
        const exhaustionTimeValid = nullableFinite(horse.hpExhaustedTime);
        const exhaustionDistanceValid = nullableFinite(horse.hpExhaustedDistance);
        if (!exhaustionTimeValid || !exhaustionDistanceValid
            || (horse.hpExhaustedTime === null) !== (horse.hpExhaustedDistance === null)) {
            return invalid("HP exhaustion metrics");
        }
        if (horse.spans!.some(span => !validTimeSpan(span, horizon)
            || !isIntegerBetween(span.mask, 1, 0x1ff)
            || !isIntegerBetween(span.phase, 0, 4))) return invalid("race-mode spans");
        if (horse.frontBlockSpans!.some(span => !validTimeSpan(span, horizon)
            || !isIntegerBetween(span.blockerHorseIndex, 0, runnerCount - 1))) return invalid("front-block spans");
        if (horse.temptationSpans!.some(span => !validTimeSpan(span, horizon)
            || !isIntegerBetween(span.mode, 1, 4))) return invalid("temptation spans");
        if (horse.positionKeepReferenceSpans!.some(span => !validTimeSpan(span, horizon)
            || !isIntegerBetween(span.referenceHorseIndex, 0, runnerCount - 1))) {
            return invalid("position-keep spans");
        }
        const positionKeepOutcomes = new Set(["Started", "FailedRoll", "Rejected", "NoMode"]);
        if (horse.positionKeepDecisions!.some((decision, index) => !isFiniteNumber(decision.time)
            || decision.time < 0 || decision.time > horizon
            || !Number.isInteger(decision.sequence)
            || (index > 0 && decision.sequence <= horse.positionKeepDecisions![index - 1].sequence)
            || !isIntegerBetween(decision.attemptedMode, 0, 5)
            || !(decision.referenceHorseIndex === -1
                || isIntegerBetween(decision.referenceHorseIndex, 0, runnerCount - 1))
            || !positionKeepOutcomes.has(decision.outcome)
            || !nullableFinite(decision.roll)
            || !nullableFinite(decision.threshold)
            || (decision.roll === null) !== (decision.threshold === null))) {
            return invalid("position-keep decisions");
        }
        if (horse.baseTargetSpeedSections!.some((section, index) => section.sectionIndex !== index
            || !isIntegerBetween(section.phase, 0, 4)
            || !isFiniteNumber(section.baseTargetSpeed)
            || !isFiniteNumber(section.random)
            || !isFiniteNumber(section.randomPercentage))) return invalid("base target-speed sections");
        if (horse.activeSkillSpans!.some(span => !validTimeSpan(span, horizon)
            || !Number.isInteger(span.skillId) || span.skillId <= 0
            || !Number.isInteger(span.detailIndex) || span.detailIndex < 0)) return invalid("active-skill spans");
        if (horse.skillActivationDecisions!.some((decision, index) => !Number.isInteger(decision.skillId)
            || decision.skillId <= 0
            || (index > 0 && decision.skillId <= horse.skillActivationDecisions![index - 1].skillId)
            || typeof decision.required !== "boolean"
            || typeof decision.passed !== "boolean"
            || typeof decision.activated !== "boolean"
            || !nullableFinite(decision.roll)
            || !nullableFinite(decision.threshold)
            || (decision.roll === null) !== (decision.threshold === null))) {
            return invalid("skill activation decisions");
        }
        if (horse.hpSkillApplications!.some(application => !isFiniteNumber(application.time)
            || application.time < 0 || application.time > horizon
            || !Number.isInteger(application.skillId) || application.skillId <= 0
            || !isIntegerBetween(application.casterHorseIndex, 0, runnerCount - 1)
            || !isIntegerBetween(application.targetHorseIndex, 0, runnerCount - 1)
            || !isFiniteNumber(application.requestedHpDelta)
            || !isFiniteNumber(application.appliedHpDelta))) return invalid("HP skill applications");

        const decisions = horse.lastSpurtDecisions!;
        const validResults = new Set(["TrueExceedNeedMaximumHp", "True", "FalseBelowNeedMinimumHp", "False"]);
        if (decisions.some((decision, index) => !validResults.has(decision.result)
            || [decision.checkDistance, decision.checkHp, decision.fullSpurtNeedHp,
                decision.fullSpurtTargetSpeed, decision.selectedStartDistance,
                decision.selectedTargetSpeed, decision.time].some(value => !isFiniteNumber(value))
            || !Number.isInteger(decision.calculationCount) || decision.calculationCount! < 0
            || typeof decision.delayPenalty !== "boolean"
            || typeof decision.speedPenalty !== "boolean"
            || decision.time! < 0 || decision.time! > horizon
            || (index > 0 && (decision.calculationCount! < decisions[index - 1].calculationCount!
                || decision.time! < decisions[index - 1].time!)))) return invalid("last-spurt history");
        const latestDecision = decisions.at(-1);
        if (latestDecision
            ? !sameLastSpurtDecision(horse.lastSpurtDecision ?? null, latestDecision)
            : horse.lastSpurtDecision !== null) return invalid("last-spurt summary");
        const temptation = horse.temptationDecision;
        if (temptation !== null
            && (temptation === undefined
                || !isFiniteNumber(temptation.roll)
                || !isFiniteNumber(temptation.threshold)
                || typeof temptation.enabled !== "boolean"
                || !Number.isInteger(temptation.startSection) || temptation.startSection < -1
                || typeof temptation.preventedByModifier !== "boolean")) {
            return invalid("temptation decision");
        }
        const finishOrder = replay.horseResult[horse.horseIndex].finishOrder;
        if ((finishOrder === 0) !== (horse.finishDistanceToPrevious === null)) {
            return invalid("finish-distance ordering");
        }
    }
    if (!response.diagnostics
        || !isFiniteNumber(response.diagnostics.simulationMilliseconds)
        || response.diagnostics.simulationMilliseconds < 0) return invalid("diagnostics");
    return null;
}

/**
 * Protects the recorded-race view from a structurally valid response that was
 * simulated with different inputs. Exact deterministic result fields must match;
 * fields such as frame sampling and finishDiffTime may differ by representation.
 */
export function getDetailedRaceReplacementError(
    recorded: RaceSimulateData | undefined,
    detailed: RaceSimulateData,
    response: DetailedRaceSimulationResponse,
    expectedSeed: number,
): string | null {
    if (!recorded) return "The recorded replay is unavailable for comparison.";
    if (!Number.isInteger(expectedSeed) || expectedSeed < -2147483648 || expectedSeed > 2147483647) {
        return "The recorded race has an invalid random seed.";
    }
    if (!Number.isInteger(response.seed)
        || response.seed < -2147483648 || response.seed > 2147483647
        || response.seed !== expectedSeed) {
        return `The simulator returned seed ${response.seed} instead of the recorded seed ${expectedSeed}.`;
    }
    if (typeof response.engineBuild !== "string" || !response.engineBuild.trim()) {
        return "The simulator did not identify its engine build.";
    }

    const recordedResults = recorded.horseResult ?? [];
    const detailedResults = detailed.horseResult ?? [];
    const runnerCount = recordedResults.length;
    if (runnerCount === 0 || detailedResults.length !== runnerCount) {
        return "The simulator returned a different runner field from the recorded race.";
    }
    const recordedStructureError = getReplayStructureError(recorded, "recorded race", runnerCount);
    if (recordedStructureError) return recordedStructureError;
    const detailedStructureError = getReplayStructureError(detailed, "simulator replay", runnerCount);
    if (detailedStructureError) return detailedStructureError;
    for (let horseIndex = 0; horseIndex < runnerCount; horseIndex += 1) {
        const original = recordedResults[horseIndex];
        const replacement = detailedResults[horseIndex];
        if (Number(original.finishOrder) !== Number(replacement.finishOrder)) {
            return `The simulator returned a different finish order at gate ${horseIndex + 1}.`;
        }

        if (original.startDelayTime !== replacement.startDelayTime) {
            return `The simulator returned different starting RNG at gate ${horseIndex + 1}.`;
        }

        if (original.finishTimeRaw !== replacement.finishTimeRaw
            || original.finishTime !== replacement.finishTime) {
            return `The simulator returned a different finish time at gate ${horseIndex + 1}.`;
        }
        // uma.moe reconstructs this display-only delta from float32 finish
        // times, which can differ from the game's stored value by one ULP.
        if (Math.abs(original.finishDiffTime - replacement.finishDiffTime)
            > FINISH_DIFF_MATCH_TOLERANCE_SECONDS) {
            return `The simulator returned a different finish gap at gate ${horseIndex + 1}.`;
        }
        if (original.gutsOrder !== replacement.gutsOrder
            || original.wizOrder !== replacement.wizOrder
            || original.lastSpurtStartDistance !== replacement.lastSpurtStartDistance
            || original.runningStyle !== replacement.runningStyle
            || original.defeat !== replacement.defeat) {
            return `The simulator returned different race results at gate ${horseIndex + 1}.`;
        }
    }
    return getDetailedAnnotationsError(response, detailed);
}

/**
 * Validates a deliberately different-seed replay before it replaces the race
 * presenter. Unlike the recorded-seed guard above, deterministic results are
 * expected to differ; runner identity, replay shape, seed, and annotations are
 * still required to be internally consistent.
 */
export function getDetailedRaceWhatIfError(
    recorded: RaceSimulateData | undefined,
    detailed: RaceSimulateData,
    response: DetailedRaceSimulationResponse,
    expectedSeed: number,
): string | null {
    if (!recorded) return "The recorded replay is unavailable for comparison.";
    if (!Number.isInteger(expectedSeed) || expectedSeed < -2147483648 || expectedSeed > 2147483647) {
        return "The requested what-if race has an invalid random seed.";
    }
    if (!Number.isInteger(response.seed)
        || response.seed < -2147483648 || response.seed > 2147483647
        || response.seed !== expectedSeed) {
        return `The simulator returned seed ${response.seed} instead of the requested seed ${expectedSeed}.`;
    }
    if (typeof response.engineBuild !== "string" || !response.engineBuild.trim()) {
        return "The simulator did not identify its engine build.";
    }

    const runnerCount = recorded.horseResult?.length ?? 0;
    if (runnerCount === 0 || (detailed.horseResult?.length ?? 0) !== runnerCount) {
        return "The simulator returned a different runner field from the recorded race.";
    }
    const recordedStructureError = getReplayStructureError(recorded, "recorded race", runnerCount);
    if (recordedStructureError) return recordedStructureError;
    const detailedStructureError = getReplayStructureError(detailed, "simulator replay", runnerCount);
    if (detailedStructureError) return detailedStructureError;
    return getDetailedAnnotationsError(response, detailed);
}

export type DetailedRaceSimulationProgress = {
    stage: "submitting" | "queued" | "running" | "receiving" | "preparing";
    message: string;
    percent: number;
    queuePosition?: number;
};

type UnknownRecord = Record<string, unknown>;

function simulationRecord(value: unknown): UnknownRecord | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as UnknownRecord
        : null;
}

function simulationErrorMessage(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    const record = simulationRecord(value);
    if (!record) return null;
    for (const key of ["error", "message", "detail"]) {
        if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
    }
    return null;
}

function completeDetailedRaceResponse(value: unknown): DetailedRaceSimulationResponse | null {
    const record = simulationRecord(value);
    if (!record) return null;
    const replay = simulationRecord(record.replay);
    const annotations = simulationRecord(record.annotations);
    if (typeof record.engineBuild !== "string"
        || typeof record.seed !== "number"
        || typeof replay?.data !== "string"
        || !annotations
        || !Array.isArray(annotations.horses)) return null;
    return record as DetailedRaceSimulationResponse;
}

function queuePosition(value: unknown): number | undefined {
    const record = simulationRecord(value);
    const queue = simulationRecord(record?.queue);
    const position = Number(record?.position ?? record?.queuePosition ?? record?.queue_position
        ?? queue?.position ?? queue?.queuePosition ?? queue?.queue_position);
    return Number.isInteger(position) && position > 0 ? position : undefined;
}

function parseServerEvent(block: string): { event: string; data: unknown } | null {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        if (field === "data") dataLines.push(value);
    }
    if (dataLines.length === 0) return null;
    const text = dataLines.join("\n");
    try { return { event, data: JSON.parse(text) }; }
    catch { return { event, data: text }; }
}

/** Reads either the simulator's incremental SSE response or the legacy JSON proxy response. */
export async function readDetailedRaceSimulationResponse(
    response: Response,
    onProgress?: (progress: DetailedRaceSimulationProgress) => void,
): Promise<DetailedRaceSimulationResponse> {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/event-stream")) {
        const payload = await response.json().catch(() => ({})) as unknown;
        if (!response.ok) throw new Error(simulationErrorMessage(payload) || `HTTP ${response.status}`);
        const complete = completeDetailedRaceResponse(payload);
        if (!complete) throw new Error("The simulator returned an incomplete detailed report.");
        onProgress?.({ stage: "receiving", message: "Detailed race received", percent: 85 });
        return complete;
    }
    if (!response.ok) {
        throw new Error(await response.text().catch(() => "") || `HTTP ${response.status}`);
    }
    if (!response.body) throw new Error("The simulator returned an empty event stream.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: DetailedRaceSimulationResponse | null = null;

    const consume = (block: string) => {
        const parsed = parseServerEvent(block);
        if (!parsed) return;
        const dataRecord = simulationRecord(parsed.data);
        const event = (parsed.event === "message" && typeof dataRecord?.status === "string"
            ? dataRecord.status
            : parsed.event).trim().toLowerCase();
        if (["queue", "queued", "waiting"].includes(event)) {
            const position = queuePosition(parsed.data);
            onProgress?.({
                stage: "queued",
                message: position ? `Queued at position ${position}` : "Queued for detailed simulation",
                percent: 20,
                ...(position ? { queuePosition: position } : {}),
            });
            return;
        }
        if (["running", "started", "start"].includes(event)) {
            onProgress?.({ stage: "running", message: "Running detailed simulation", percent: 50 });
            return;
        }
        if (["timing", "processing"].includes(event)) {
            onProgress?.({ stage: "receiving", message: "Simulation finished; receiving race data", percent: 80 });
            return;
        }
        if (["error", "failed", "failure"].includes(event)) {
            throw new Error(simulationErrorMessage(parsed.data) || "Detailed simulation failed.");
        }
        if (["result", "complete", "completed"].includes(event)) {
            const candidate = completeDetailedRaceResponse(dataRecord?.result ?? parsed.data);
            if (!candidate) throw new Error("The simulator returned an incomplete detailed report.");
            result = candidate;
            onProgress?.({ stage: "receiving", message: "Detailed race received", percent: 90 });
        }
    };

    while (!result) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let match = /\r?\n\r?\n/.exec(buffer);
        while (match) {
            consume(buffer.slice(0, match.index));
            buffer = buffer.slice(match.index + match[0].length);
            if (result) break;
            match = /\r?\n\r?\n/.exec(buffer);
        }
        if (done) {
            if (buffer.trim()) consume(buffer);
            break;
        }
    }
    if (!result) throw new Error("The simulator event stream ended before returning a result.");
    await reader.cancel().catch(() => undefined);
    return result;
}

/**
 * Durable share representation of a detailed simulation. The replay itself is
 * stored in the share's existing raceScenario field, so keeping it out of this
 * object avoids paying for the (large) base64 payload twice.
 */
export type SharedDetailedRaceSimulation = {
    schemaVersion: 1;
    engineBuild: string;
    seed: number;
    annotations: DetailedRaceSimulationResponse['annotations'];
    diagnostics?: DetailedRaceSimulationResponse['diagnostics'];
};

export function buildSharedDetailedRaceSimulation(
    response: DetailedRaceSimulationResponse,
): SharedDetailedRaceSimulation {
    return {
        schemaVersion: 1,
        engineBuild: response.engineBuild,
        seed: response.seed,
        annotations: response.annotations,
        diagnostics: response.diagnostics,
    };
}

export function restoreSharedDetailedRaceSimulation(
    value: unknown,
    replayData: string,
): DetailedRaceSimulationResponse | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const shared = value as Record<string, unknown>;
    const annotations = shared.annotations;
    if (shared.schemaVersion !== 1
        || typeof shared.engineBuild !== 'string'
        || typeof shared.seed !== 'number'
        || !Number.isFinite(shared.seed)
        || !annotations
        || typeof annotations !== 'object'
        || Array.isArray(annotations)) return null;

    const annotationRecord = annotations as Record<string, unknown>;
    if (typeof annotationRecord.schemaVersion !== 'number'
        || !annotationRecord.flags
        || typeof annotationRecord.flags !== 'object'
        || Array.isArray(annotationRecord.flags)
        || !Array.isArray(annotationRecord.horses)) return null;

    return {
        engineBuild: shared.engineBuild,
        seed: shared.seed,
        replay: { data: replayData },
        annotations: annotations as DetailedRaceSimulationResponse['annotations'],
        diagnostics: shared.diagnostics as DetailedRaceSimulationResponse['diagnostics'],
    };
}

export function buildDetailedHorseMetrics(
    response: DetailedRaceSimulationResponse,
): Record<number, DetailedHorseMetrics> {
    return Object.fromEntries((response.annotations.horses ?? []).map(horse => [
        horse.horseIndex,
        {
            horseIndex: horse.horseIndex,
            worldTransformDistanceLoss: horse.worldTransformDistanceLoss,
            lastSpurtDecision: horse.lastSpurtDecision,
            lastSpurtDecisions: horse.lastSpurtDecisions,
            rushedFrames: horse.rushedFrames,
            startHp: horse.startHp,
            finalHp: horse.finalHp,
            hpDeficit: horse.hpDeficit,
            maxHp: horse.maxHp,
            hpExhaustedTime: horse.hpExhaustedTime,
            hpExhaustedDistance: horse.hpExhaustedDistance,
            lostStartAccelerationFrame: horse.lostStartAccelerationFrame,
            finishDistanceToPrevious: horse.finishDistanceToPrevious,
            sampleTimes: response.annotations.sampleTimes,
            targetSpeeds: horse.targetSpeeds,
            accelerationRates: horse.accelerationRates,
            frontBlockSpans: horse.frontBlockSpans,
            temptationSpans: horse.temptationSpans,
            paceMakerSpans: response.annotations.paceMakerSpans,
            positionKeepReferenceSpans: horse.positionKeepReferenceSpans,
            positionKeepDecisions: horse.positionKeepDecisions,
            baseTargetSpeedSections: horse.baseTargetSpeedSections,
            activeSkillSpans: horse.activeSkillSpans,
            skillActivationDecisions: horse.skillActivationDecisions,
            hpSkillApplications: horse.hpSkillApplications,
            temptationDecision: horse.temptationDecision,
        },
    ]));
}

export type RaceModeEvent = { time: number; duration: number; name: string; phase?: number };

const LABELS: Record<string, string> = {
    positionKeepSpeedUp: "Speed Up",
    positionKeepOvertake: "Overtake",
    positionKeepPaceUp: "Pace Up",
    positionKeepPaceDown: "Pace Down",
    positionKeepPaceUpEx: "Pace Up EX",
    downhill: "Downhill Mode",
    spotStruggle: "Spot Struggle",
    dueling: "Dueling",
    conservePower: "Fully Charged",
};

export function buildAuthoritativeModeEvents(
    response: DetailedRaceSimulationResponse,
): Record<number, RaceModeEvent[]> {
    const result: Record<number, RaceModeEvent[]> = {};
    for (const horse of response.annotations.horses ?? []) {
        const events: RaceModeEvent[] = [];
        for (const span of horse.spans ?? []) {
            for (const [flagName, flag] of Object.entries(response.annotations.flags ?? {})) {
                const name = LABELS[flagName];
                if (!name || !(span.mask & flag)) continue;
                const previous = events[events.length - 1];
                if (previous?.name === name && previous.phase === span.phase
                    && Math.abs(previous.time + previous.duration - span.startTime) < 0.001) {
                    previous.duration = span.endTime - previous.time;
                } else {
                    events.push({
                        time: span.startTime,
                        duration: Math.max(0, span.endTime - span.startTime),
                        name,
                        phase: span.phase,
                    });
                }
            }
        }
        result[horse.horseIndex] = events.sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
    }
    return result;
}

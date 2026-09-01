import { RaceSimulateData, RaceSimulateEventData_SimulateEventType } from "../../../data/race_data_pb";
import { CharaSkill, fromRaceHorseData, TrainedCharaData } from "../../../data/TrainedCharaData";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import { filterCharaSkills } from "../../../data/RaceDataUtils";
import { getPassiveStatModifiers, getRushedChanceModifier } from "../../RaceReplay/utils/SkillDataUtils";
import { STRATEGY_PROFICIENCY_MODIFIER } from "../../RaceReplay/utils/speedCalculations";
import { CAREER_RACE_STAT_BONUS } from "../../RaceReplay/utils/raceConstants";

// skill_data.activate_lot, read live off the generated master.mdb data (UMDatabaseWrapper.skills) rather
// than a hand-maintained static table — see umdb/data.proto's Skill.activate_lot and
// umdb/generate_db.py's populate_skills().
const hasSkillActivateLot = UMDatabaseWrapper.hasSkillActivateLot;

const MBIG = 2147483647;
const MSEED = 161803398;
const MAX_BASE_SCAN = 2500;
export const RACE_SECTION_COUNT = 24;
const BYPASS_RETRIGGER_WINDOW_S = 0.5;
const BYPASS_UNIQUE_IDS = new Set([110071, 910071]);

function buildStartDelayAbility(rawModifier: number): number {
    return Math.fround(rawModifier / 10000 - 1);
}

const START_DELAY_SKILL_ABILITY = new Map<number, number>([
    [200431, buildStartDelayAbility(4000)],
    [200432, buildStartDelayAbility(9000)],
    [200433, buildStartDelayAbility(15000)],
]);

export type SkillLotteryCategory =
    | "WON_AND_FIRED"
    | "WON_NOT_TRIGGERED"
    | "LOTTERY_FAILED"
    | "GUARANTEED_FIRED"
    | "GUARANTEED_NOT_TRIGGERED";

export type SkillLotteryResult = {
    skillId: number;
    activateLot: 0 | 1;
    wonLottery: boolean | null;
    triggered: boolean;
    triggeredBy564: boolean;
    retriggered: boolean;
    category: SkillLotteryCategory;
    roll?: number;
    perThreshold: number;
    margin?: number;
    witNeeded?: number;
};

export type RaceSkillLotteryResult = {
    streamVerified: boolean;
    measuredBase?: number;
    totalLots: number;
    byFrameOrder: Map<number, Map<number, SkillLotteryResult>>;
    /** Raw NextDouble() uniforms for race sections 1..24, keyed by one-based frame order. */
    sectionWitRollsByFrameOrder: Map<number, number[]>;
    rushedByFrameOrder: Map<number, RushedLotteryResult>;
};

export type RushedLotteryResult = {
    wisdomFinal: number;
    enableRoll: number;
    thresholdModifier: number;
    threshold: number;
    enabled: boolean;
    sectionRoll?: number;
    section?: number;
};

class DotNetRandom {
    private readonly seedArray = new Int32Array(56);
    private inext = 0;
    private inextp = 21;

    constructor(seed: number) {
        const subtraction = seed === -2147483648 ? 2147483647 : Math.abs(seed);
        let mj = (MSEED - subtraction) | 0;
        this.seedArray[55] = mj;
        let mk = 1;
        for (let i = 1; i < 55; i++) {
            const ii = (21 * i) % 55;
            this.seedArray[ii] = mk;
            mk = (mj - mk) | 0;
            if (mk < 0) mk = (mk + MBIG) | 0;
            mj = this.seedArray[ii];
        }
        for (let k = 1; k < 5; k++) {
            for (let i = 1; i < 56; i++) {
                this.seedArray[i] = (this.seedArray[i] - this.seedArray[1 + ((i + 30) % 55)]) | 0;
                if (this.seedArray[i] < 0) this.seedArray[i] = (this.seedArray[i] + MBIG) | 0;
            }
        }
    }

    private internalSample(): number {
        let localInext = this.inext;
        let localInextp = this.inextp;
        if (++localInext >= 56) localInext = 1;
        if (++localInextp >= 56) localInextp = 1;
        let ret = (this.seedArray[localInext] - this.seedArray[localInextp]) | 0;
        if (ret === MBIG) ret = (ret - 1) | 0;
        if (ret < 0) ret = (ret + MBIG) | 0;
        this.seedArray[localInext] = ret;
        this.inext = localInext;
        this.inextp = localInextp;
        return ret;
    }

    nextDouble(): number {
        return this.internalSample() * (1.0 / MBIG);
    }
}

function drawSamples(seed: number, count: number): number[] {
    const rng = new DotNetRandom(seed);
    const samples = new Array<number>(count);
    for (let index = 0; index < count; index++) samples[index] = rng.nextDouble();
    return samples;
}

function f32Bits(value: number): number {
    return new DataView(new Float32Array([value]).buffer).getUint32(0, true);
}

function startDelayF32(sample: number, ability: number): number {
    const raw = Math.fround(Math.fround(0.1) * Math.fround(sample));
    const scale = Math.fround(1.0 + ability);
    return Math.fround(raw * scale);
}

function toSignedInt32(seed: number): number {
    const truncated = Math.trunc(seed);
    return truncated > 2147483647 ? truncated - 4294967296 : truncated;
}

function uniqueSkillIdForOutfit(cardId: number): number | undefined {
    const text = String(cardId);
    if (text.length < 4) return undefined;
    const charaPart = Number(text.slice(1, -2));
    const outfitVersion = Number(text.slice(-2));
    if (!Number.isFinite(charaPart) || !Number.isFinite(outfitVersion)) return undefined;
    return 100000 + 10000 * (outfitVersion - 1) + charaPart * 10 + 1;
}

function isCharacterUnique(skillId: number): boolean {
    return /^1\d{5}$/.test(String(skillId));
}

function normalizeEquippedSkillId(skillId: number, trainedChara: TrainedCharaData): number {
    const ownedUniqueId = uniqueSkillIdForOutfit(Number(trainedChara.cardId));
    if (ownedUniqueId !== undefined && skillId !== ownedUniqueId && isCharacterUnique(skillId)) {
        return Number(`9${String(skillId).slice(1)}`);
    }
    return skillId;
}

function buildWisdom(rawWit: number, motivation: number): number {
    const overcapAdjusted = rawWit <= 1200 ? rawWit : 1200 + (rawWit - 1200) / 2;
    const mood = Number.isFinite(motivation) ? motivation - 3 : 0;
    return Math.min(2000, Math.max(1, overcapAdjusted * (1 + 0.02 * mood)));
}

function perThresholdOf(wisdom: number): number {
    return Math.max(20, 100 - 9000 / wisdom);
}

function rollFor(sample: number, wisdom: number): { roll: number; perThreshold: number; wonLottery: boolean; margin: number } {
    const roll = Math.fround(100 * Math.fround(sample));
    const perThreshold = perThresholdOf(wisdom);
    const margin = perThreshold - roll;
    return {
        roll,
        perThreshold,
        wonLottery: roll < perThreshold,
        margin,
    };
}

function witNeededFor(roll: number): number | undefined {
    const denominator = 100 - roll;
    return denominator > 0 ? 9000 / denominator : undefined;
}

function categoryFor(wonLottery: boolean | null, triggered: boolean): SkillLotteryCategory {
    if (wonLottery === true) return triggered ? "WON_AND_FIRED" : "WON_NOT_TRIGGERED";
    if (wonLottery === false) return "LOTTERY_FAILED";
    return triggered ? "GUARANTEED_FIRED" : "GUARANTEED_NOT_TRIGGERED";
}

type EquippedHorse = {
    frameOrder: number;
    trainedChara: TrainedCharaData;
    skills: { rawId: number; normalizedId: number }[];
    wisdom: number;
};

function buildEquippedHorses(raceHorseInfo: any[], horseCount: number): EquippedHorse[] {
    const horses: EquippedHorse[] = [];
    raceHorseInfo.forEach((horseData, fallbackIndex) => {
        const frameOrderRaw = Number(horseData?.frame_order ?? horseData?.frameOrder);
        const frameOrder = Number.isFinite(frameOrderRaw) && frameOrderRaw > 0
            ? frameOrderRaw - 1
            : fallbackIndex;
        if (frameOrder < 0 || frameOrder >= horseCount) return;

        const trainedChara = fromRaceHorseData(horseData);
        const skills = trainedChara.skills.map((skill: CharaSkill) => ({
            rawId: skill.skillId,
            normalizedId: normalizeEquippedSkillId(skill.skillId, trainedChara),
        }));
        horses[frameOrder] = {
            frameOrder,
            trainedChara,
            skills,
            wisdom: buildWisdom(Number(trainedChara.wiz) || 0, Number(horseData?.motivation ?? 3)),
        };
    });
    return horses.filter(Boolean).sort((a, b) => a.frameOrder - b.frameOrder);
}

function rushedInputsFor(
    horse: EquippedHorse,
    raceData: RaceSimulateData,
    raceType?: string,
): { wisdomFinal: number; thresholdModifier: number } {
    const activatedSkillGroups = new Map<number, number | undefined>();
    for (const event of filterCharaSkills(raceData, horse.frameOrder)) {
        activatedSkillGroups.set(Number(event.param[1]), event.param?.[3]);
    }
    let passiveWisdom = 0;
    let thresholdModifier = 0;
    activatedSkillGroups.forEach((conditionGroupIndex, skillId) => {
        passiveWisdom += getPassiveStatModifiers(skillId, conditionGroupIndex).wisdom || 0;
        thresholdModifier += getRushedChanceModifier(skillId, conditionGroupIndex);
    });

    const rawStyle = Number(
        horse.trainedChara.rawData?.running_style
        ?? horse.trainedChara.rawData?.runningStyle
        ?? raceData.horseResult[horse.frameOrder]?.runningStyle
        ?? 1,
    );
    const aptitudeStyle = rawStyle === 5 ? 1 : rawStyle;
    const strategyProficiency = horse.trainedChara.properRunningStyles[aptitudeStyle] ?? 7;
    const careerBonus = raceType === "Single" ? CAREER_RACE_STAT_BONUS : 0;
    return {
        wisdomFinal: horse.wisdom * (STRATEGY_PROFICIENCY_MODIFIER[strategyProficiency] ?? 1) + passiveWisdom + careerBonus,
        thresholdModifier,
    };
}

function buildTriggeredSkillEvents(raceData: RaceSimulateData): Map<string, { time: number; real: boolean }[]> {
    const byKey = new Map<string, { time: number; real: boolean }[]>();
    for (const wrapper of raceData.event ?? []) {
        const event = wrapper.event;
        if (!event || event.type !== RaceSimulateEventData_SimulateEventType.SKILL) continue;
        const frameOrder = event.param[0];
        const skillId = event.param[1];
        const key = `${frameOrder}:${skillId}`;
        const entries = byKey.get(key) ?? [];
        entries.push({
            time: event.frameTime ?? 0,
            real: event.param[2] !== -1,
        });
        byKey.set(key, entries);
    }
    for (const entries of byKey.values()) entries.sort((a, b) => a.time - b.time);
    return byKey;
}

function didSkillTrigger(eventsByKey: Map<string, { time: number; real: boolean }[]>, frameOrder: number, skillId: number): boolean {
    return (eventsByKey.get(`${frameOrder}:${skillId}`) ?? []).some(event => event.real);
}

function firstRealSkillTime(eventsByKey: Map<string, { time: number; real: boolean }[]>, frameOrder: number, skillId: number): number | undefined {
    return (eventsByKey.get(`${frameOrder}:${skillId}`) ?? []).find(event => event.real)?.time;
}

function wasTriggeredByBypass(eventsByKey: Map<string, { time: number; real: boolean }[]>, frameOrder: number, skillId: number): boolean {
    if (BYPASS_UNIQUE_IDS.has(skillId)) return false;
    const skillTime = firstRealSkillTime(eventsByKey, frameOrder, skillId);
    if (skillTime === undefined) return false;
    for (const bypassSkillId of BYPASS_UNIQUE_IDS) {
        const bypassEvents = (eventsByKey.get(`${frameOrder}:${bypassSkillId}`) ?? []).filter(event => event.real);
        if (bypassEvents.some(event => {
            const delta = skillTime - event.time;
            return delta >= 0 && delta <= BYPASS_RETRIGGER_WINDOW_S;
        })) {
            return true;
        }
    }
    return false;
}

function calculateGateAbilitiesForBase(horses: EquippedHorse[], samples: number[], base: number, totalLots: number): number[] {
    const abilities = new Array<number>(horses.length).fill(0);
    let lotPosition = base - totalLots;
    for (const horse of horses) {
        let gateAbility = 0;
        for (const skill of horse.skills) {
            if (!hasSkillActivateLot(skill.normalizedId)) continue;
            const gateAbilityForSkill = START_DELAY_SKILL_ABILITY.get(skill.normalizedId);
            if (gateAbilityForSkill !== undefined) {
                const { wonLottery } = rollFor(samples[lotPosition], horse.wisdom);
                if (wonLottery) gateAbility = gateAbilityForSkill;
            }
            lotPosition++;
        }
        abilities[horse.frameOrder] = gateAbility;
    }
    return abilities;
}

function findMeasuredBase(raceData: RaceSimulateData, horses: EquippedHorse[], seed: number, totalLots: number): { base?: number; samples: number[] } {
    const horseCount = raceData.horseResult.length;
    // Keep the post-delay per-section block in the same stream buffer. Its final
    // draw is at base + N + 24*N - 1, and base itself may be MAX_BASE_SCAN.
    const samples = drawSamples(seed, MAX_BASE_SCAN + horseCount * (RACE_SECTION_COUNT + 3));
    const startDelayBits = raceData.horseResult.map(result => f32Bits(result.startDelayTime ?? 0));

    for (let base = totalLots; base <= MAX_BASE_SCAN; base++) {
        const abilities = calculateGateAbilitiesForBase(horses, samples, base, totalLots);
        let allMatch = true;
        for (let frameOrder = 0; frameOrder < horseCount; frameOrder++) {
            const expectedBits = f32Bits(startDelayF32(samples[base + frameOrder], abilities[frameOrder] ?? 0));
            if (expectedBits !== startDelayBits[frameOrder]) {
                allMatch = false;
                break;
            }
        }
        if (allMatch) return { base, samples };
    }
    return { samples };
}

export function computeRaceSkillLottery(
    raceHorseInfo: any[],
    raceData: RaceSimulateData,
    randomSeed: number | undefined,
    raceType?: string,
): RaceSkillLotteryResult | undefined {
    if (randomSeed === undefined || !Number.isFinite(randomSeed) || raceData.horseResult.length === 0) return undefined;

    const horses = buildEquippedHorses(raceHorseInfo, raceData.horseResult.length);
    if (horses.length === 0) return undefined;

    const totalLots = horses.reduce(
        (total, horse) => total + horse.skills.filter(skill => hasSkillActivateLot(skill.normalizedId)).length,
        0,
    );
    const seed = toSignedInt32(randomSeed);
    const { base, samples } = findMeasuredBase(raceData, horses, seed, totalLots);
    if (base === undefined || base - totalLots < 0) {
        return {
            streamVerified: false,
            totalLots,
            byFrameOrder: new Map(),
            sectionWitRollsByFrameOrder: new Map(),
            rushedByFrameOrder: new Map(),
        };
    }

    const eventsByKey = buildTriggeredSkillEvents(raceData);
    const byFrameOrder = new Map<number, Map<number, SkillLotteryResult>>();
    const sectionWitRollsByFrameOrder = new Map<number, number[]>();
    const sectionBlockStart = base + raceData.horseResult.length;
    for (let frameOrder = 0; frameOrder < raceData.horseResult.length; frameOrder++) {
        const start = sectionBlockStart + RACE_SECTION_COUNT * frameOrder;
        sectionWitRollsByFrameOrder.set(
            frameOrder + 1,
            samples.slice(start, start + RACE_SECTION_COUNT),
        );
    }
    const rushedByFrameOrder = new Map<number, RushedLotteryResult>();
    if (horses.length === raceData.horseResult.length) {
        let rushedPosition = sectionBlockStart + RACE_SECTION_COUNT * raceData.horseResult.length;
        for (const horse of horses) {
            const { wisdomFinal, thresholdModifier } = rushedInputsFor(horse, raceData, raceType);
            const enableRoll = Math.trunc(samples[rushedPosition++] * 100);
            const threshold = (6.5 / Math.log10(0.1 * wisdomFinal + 1)) ** 2 + thresholdModifier;
            const enabled = threshold > enableRoll;
            let sectionRoll: number | undefined;
            let section: number | undefined;
            if (enabled) {
                sectionRoll = samples[rushedPosition++];
                section = Math.trunc(sectionRoll * 8) + 2;
            }
            rushedByFrameOrder.set(horse.frameOrder + 1, {
                wisdomFinal,
                enableRoll,
                thresholdModifier,
                threshold,
                enabled,
                sectionRoll,
                section,
            });
        }
    }
    let lotPosition = base - totalLots;

    for (const horse of horses) {
        const skillMap = new Map<number, SkillLotteryResult>();
        for (const skill of horse.skills) {
            const activateLot = hasSkillActivateLot(skill.normalizedId) ? 1 : 0;
            let wonLottery: boolean | null = null;
            let roll: number | undefined;
            let margin: number | undefined;
            let witNeeded: number | undefined;
            const perThreshold = perThresholdOf(horse.wisdom);

            if (activateLot) {
                const rolled = rollFor(samples[lotPosition], horse.wisdom);
                lotPosition++;
                roll = rolled.roll;
                wonLottery = rolled.wonLottery;
                margin = rolled.margin;
                if (!wonLottery) witNeeded = witNeededFor(roll);
            }

            const triggered = didSkillTrigger(eventsByKey, horse.frameOrder, skill.normalizedId)
                || (skill.rawId !== skill.normalizedId && didSkillTrigger(eventsByKey, horse.frameOrder, skill.rawId));
            const triggeredBy564 = wasTriggeredByBypass(eventsByKey, horse.frameOrder, skill.normalizedId)
                || (skill.rawId !== skill.normalizedId && wasTriggeredByBypass(eventsByKey, horse.frameOrder, skill.rawId));
            const retriggered = wonLottery === false && triggeredBy564;
            const result: SkillLotteryResult = {
                skillId: skill.rawId,
                activateLot,
                wonLottery,
                triggered,
                triggeredBy564,
                retriggered,
                category: categoryFor(wonLottery, triggered),
                roll,
                perThreshold,
                margin,
                witNeeded,
            };
            skillMap.set(skill.rawId, result);
            if (skill.rawId !== skill.normalizedId) skillMap.set(skill.normalizedId, result);
        }
        byFrameOrder.set(horse.frameOrder + 1, skillMap);
    }

    return {
        streamVerified: true,
        measuredBase: base,
        totalLots,
        byFrameOrder,
        sectionWitRollsByFrameOrder,
        rushedByFrameOrder,
    };
}

import { ParsedRace } from "../../types";
import { CharaHpSpurtStats } from "./types";
import { filterCharaSkills } from "../../../../data/RaceDataUtils";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { getAvailableTracks, guessTrackId } from "../../../../components/RaceReplay/utils/guessTrackUtils";
import { computeOtherEvents } from "../../../../components/RaceReplay/utils/analysisUtils";
import { computeCharaTableData } from "../../../../components/RaceDataPresenter/components/CharaList/useCharaTableData";
import { getSkillDef } from "../../../../components/RaceReplay/utils/SkillDataUtils";

export const computeHpSpurtStats = (
    races: ParsedRace[],
    targetCharaId?: number,
    onlyPlayer: boolean = false,
    statsFilter?: { speed: number, stamina: number, pow: number, guts: number, wiz: number },
    groupByStats: boolean = false
): CharaHpSpurtStats[] => {
    const statsMap = new Map<string, CharaHpSpurtStats>();

    const getRecoveryValue = (skillId: number): number | null => {
        const def = getSkillDef(skillId);
        if (!def || !def.condition_groups) return null;

        for (const group of def.condition_groups) {
            if (group.effects) {
                for (const effect of group.effects) {
                    if (effect.type === 9 && effect.value > 0) { // Type 9 is HP Recovery, exclude debuffs (< 0)
                        return effect.value;
                    }
                }
            }
        }
        return null;
    };

    races.forEach(race => {
        const raceData = race.raceData;
        const raceDistance = race.raceDistance;

        // Use shared track guessing logic
        const availableTracks = getAvailableTracks(raceDistance);
        const guessedTrack = guessTrackId(race.detectedCourseId, raceDistance, availableTracks);
        const effectiveCourseId = guessedTrack.id ? parseInt(guessedTrack.id) : undefined;

        // Pre-parse skills for ALL horses in the race (not just those in horseInfo)
        const skillActivations: Record<number, { time: number; name: string; param: number[] }[]> = {};
        for (let i = 0; i < raceData.horseResult.length; i++) {
            const frameOrder = i;
            const skills = filterCharaSkills(raceData, frameOrder).map(event => ({
                time: event.frameTime ?? 0,
                name: UMDatabaseWrapper.skillName(event.param[1]),
                param: event.param
            }));
            skillActivations[frameOrder] = skills;
        }

        // Compute "Other Events" (Dueling/Struggle)
        const otherEvents = computeOtherEvents(raceData, race.horseInfo, effectiveCourseId, skillActivations, raceDistance);

        // Use the EXACT same computation as CharaList
        const charaTableData = computeCharaTableData(race.horseInfo, raceData, effectiveCourseId, skillActivations, otherEvents);

        // Extract HP outcomes from the computed data
        charaTableData.forEach(charaData => {
            const frameOrder = charaData.frameOrder - 1; // Convert back to 0-indexed
            const trainedChara = charaData.trainedChara;
            const charaId = trainedChara.charaId;

            // Filters
            if (targetCharaId && charaId !== targetCharaId) return;
            if (onlyPlayer) {
                const isPlayer = race.playerIndices?.has(frameOrder) ?? false;
                if (!isPlayer) return;
            }
            if (statsFilter) {
                if (trainedChara.speed !== statsFilter.speed ||
                    trainedChara.stamina !== statsFilter.stamina ||
                    trainedChara.pow !== statsFilter.pow ||
                    trainedChara.guts !== statsFilter.guts ||
                    trainedChara.wiz !== statsFilter.wiz) {
                    return;
                }
            }

            const chara = UMDatabaseWrapper.charas[charaId];
            const charaName = chara?.name ?? `Unknown (${charaId})`;

            // Determine unique key
            let uniqueId = charaId.toString();
            if (groupByStats) {
                uniqueId = `${charaId}_${trainedChara.speed}_${trainedChara.stamina}_${trainedChara.pow}_${trainedChara.guts}_${trainedChara.wiz}`;
            }

            // Initialize stats if needed
            if (!statsMap.has(uniqueId)) {
                statsMap.set(uniqueId, {
                    uniqueId,
                    charaId,
                    cardId: trainedChara.cardId,
                    charaName,
                    trainedChara, // Populate trainedChara with the first occurrence
                    stats: {
                        speed: trainedChara.speed,
                        stamina: trainedChara.stamina,
                        pow: trainedChara.pow,
                        guts: trainedChara.guts,
                        wiz: trainedChara.wiz
                    },
                    totalRuns: 0,
                    wins: 0,
                    top3Finishes: 0,
                    skillActivationCounts: {},
                    normalizedSkillActivationCounts: {},
                    fullSpurtCount: 0,
                    survivalCount: 0,
                    hpOutcomesFullSpurt: [],
                    hpOutcomesNonFullSpurt: [],
                    recoveryStats: {},
                    sourceRuns: []
                });
            }
            const currentStats = statsMap.get(uniqueId)!;
            currentStats.totalRuns++;
            if (charaData.finishOrder === 1) currentStats.wins++;
            if (charaData.finishOrder <= 3) currentStats.top3Finishes++;

            currentStats.sourceRuns.push({ race, horseFrameOrder: frameOrder });

            // Track Skill Activations
            const frameSkills = skillActivations[frameOrder] || [];
            const activatedIds = new Set(frameSkills.map(s => s.param[1]));

            // Calculate activation chance for this run
            const wiz = trainedChara.wiz ?? 300;
            const motivation = charaData.motivation ?? 3;
            // Mood multipliers: 5=Great(1.04), 4=Good(1.02), 3=Normal(1.0), 2=Bad(0.98), 1=Awful(0.96)
            const moodMultipliers: Record<number, number> = { 5: 1.04, 4: 1.02, 3: 1.0, 2: 0.98, 1: 0.96 };
            const moodMult = moodMultipliers[motivation] ?? 1.0;
            const baseWiz = wiz * moodMult;
            const activationChance = Math.max(100 - 9000 / baseWiz, 20) / 100;

            activatedIds.forEach(skillId => {
                currentStats.skillActivationCounts[skillId] = (currentStats.skillActivationCounts[skillId] || 0) + 1;

                // Normalized Calculation
                const isUnique = skillId >= 100000 && skillId < 200000;
                const def = getSkillDef(skillId);
                const isPassive = def?.condition_groups?.some((group: any) =>
                    group.effects?.some((effect: any) =>
                        [1, 2, 3, 4, 5].includes(effect.type)
                    )
                );
                const isGuaranteed = isUnique || isPassive;

                const valueToAdd = (isGuaranteed || activationChance <= 0) ? 1 : (1 / activationChance);
                currentStats.normalizedSkillActivationCounts[skillId] = (currentStats.normalizedSkillActivationCounts[skillId] || 0) + valueToAdd;
            });

            // Full Spurt Analysis using the computed values
            const lastSpurtStartDist = charaData.horseResultData.lastSpurtStartDistance;
            let didFullSpurt = false;

            if (lastSpurtStartDist && lastSpurtStartDist !== -1) {
                const phase3Start = raceDistance * 2 / 3;
                const spurtDelay = lastSpurtStartDist - phase3Start;

                if (spurtDelay < 3) {
                    const speedDiff = (charaData.maxAdjustedSpeed ?? 0) - (charaData.lastSpurtTargetSpeed ?? 0);
                    const speedReached = speedDiff >= -0.05;

                    if (speedReached) {
                        didFullSpurt = true;
                    }
                }
            }

            if (didFullSpurt) {
                currentStats.fullSpurtCount++;
            }

            // Use the HP outcome computed by CharaList logic
            const hpOutcome = charaData.hpOutcome;

            if (hpOutcome) {
                if (hpOutcome.type === 'survived') {
                    currentStats.survivalCount++;
                }

                // Collect HP Outcome Value - use the EXACT same value CharaList displays
                let outcomeValue = 0;
                if (hpOutcome.type === 'survived') {
                    outcomeValue = hpOutcome.hp;
                } else {
                    outcomeValue = -hpOutcome.deficit;
                }

                if (didFullSpurt) {
                    currentStats.hpOutcomesFullSpurt.push(outcomeValue);
                } else {
                    currentStats.hpOutcomesNonFullSpurt.push(outcomeValue);
                }

                // --- Recovery Skill Analysis ---
                const knownSkills = trainedChara.skills.map(s => s.skillId);
                const knownRecoverySkills = knownSkills
                    .map(id => ({ id, value: getRecoveryValue(id) }))
                    .filter(s => s.value !== null)
                    .map(s => ({ ...s, value: s.value! }));

                // Avoid creating stats if no recovery skills
                if (knownRecoverySkills.length > 0) {
                    // Group by value
                    const valueGroups = new Map<number, { total: number, ids: number[] }>();
                    knownRecoverySkills.forEach(s => {
                        const g = valueGroups.get(s.value) || { total: 0, ids: [] };
                        g.total++;
                        g.ids.push(s.id);
                        valueGroups.set(s.value, g);
                    });

                    // Check activations
                    // skillActivations[frameOrder] contains all skills activated by this chara



                    const scenarioParts: string[] = [];
                    const labelParts: string[] = [];

                    // Sort by value descending
                    const sortedValues = Array.from(valueGroups.keys()).sort((a, b) => b - a);

                    sortedValues.forEach(val => {
                        const group = valueGroups.get(val)!;
                        let activatedCount = 0;
                        group.ids.forEach(id => {
                            if (activatedIds.has(id)) activatedCount++;
                        });

                        const pct = (val / 100).toFixed(1); // 550 -> 5.5
                        const partId = `${val}-${activatedCount}/${group.total}`;
                        scenarioParts.push(partId);
                        labelParts.push(`${pct}% (${activatedCount}/${group.total})`);
                    });

                    const scenarioKey = scenarioParts.join("_");
                    const label = labelParts.join(", ");

                    if (!currentStats.recoveryStats[scenarioKey]) {
                        currentStats.recoveryStats[scenarioKey] = {
                            scenarioId: scenarioKey,
                            label,
                            activationPattern: scenarioKey,
                            totalRuns: 0,
                            fullSpurtCount: 0,
                            survivalCount: 0,
                            fullSpurtSurvivalCount: 0,
                            hpOutcomes: [],
                            hpOutcomesFullSpurt: []
                        };
                    }

                    const recStats = currentStats.recoveryStats[scenarioKey];
                    recStats.totalRuns++;
                    if (didFullSpurt) {
                        recStats.fullSpurtCount++;
                        recStats.hpOutcomesFullSpurt.push(outcomeValue);
                    }
                    if (hpOutcome.type === 'survived') recStats.survivalCount++;
                    if (didFullSpurt && hpOutcome.type === 'survived') recStats.fullSpurtSurvivalCount++;
                    recStats.hpOutcomes.push(outcomeValue);
                }
            }
        });
    });

    return Array.from(statsMap.values()).sort((a, b) => b.totalRuns - a.totalRuns);
};

import React from "react";
import { SkillActivationPoint } from "../../types";
import { STRATS, STRAT_LABELS, DoubleProcBreakdown, DoubleProcRateSummary, LocalDoubleProcSummary } from "./skillUtils";

export function computeDoubleProcSummary(activations: SkillActivationPoint[]): LocalDoubleProcSummary | null {
    const procCountsByHorse = new Map<string, number>();
    activations.forEach((activation) => {
        const key = `${activation.raceId}_${activation.horseFrameOrder}`;
        procCountsByHorse.set(key, (procCountsByHorse.get(key) ?? 0) + 1);
    });

    const doubleProcHorseCount = Array.from(procCountsByHorse.values()).filter((count) => count >= 2).length;
    if (doubleProcHorseCount === 0) return null;

    return {
        doubleProcHorseCount,
    };
}

export function estimateDoubleOpportunityRate(
    learnedHorseObservations: Array<{ activationChance: number; observedCount: number }>
): number | undefined {
    if (learnedHorseObservations.length === 0) return undefined;

    let pi1 = 0.2;
    let pi2 = 0.05;

    for (let iter = 0; iter < 40; iter++) {
        const pi0 = Math.max(0, 1 - pi1 - pi2);
        let sum1 = 0;
        let sum2 = 0;

        for (const observation of learnedHorseObservations) {
            const p = Math.min(Math.max(observation.activationChance, 0.2), 0.999);
            const y = Math.min(observation.observedCount, 2);

            if (y >= 2) {
                sum2 += 1;
                continue;
            }

            if (y === 1) {
                const w1 = pi1 * p;
                const w2 = pi2 * 2 * p * (1 - p);
                const total = w1 + w2;
                if (total <= 0) continue;
                sum1 += w1 / total;
                sum2 += w2 / total;
                continue;
            }

            const w0 = pi0;
            const w1 = pi1 * (1 - p);
            const w2 = pi2 * (1 - p) * (1 - p);
            const total = w0 + w1 + w2;
            if (total <= 0) continue;
            sum1 += w1 / total;
            sum2 += w2 / total;
        }

        pi1 = sum1 / learnedHorseObservations.length;
        pi2 = sum2 / learnedHorseObservations.length;
        if (pi1 + pi2 > 1) {
            const scale = 1 / (pi1 + pi2);
            pi1 *= scale;
            pi2 *= scale;
        }
    }

    return pi2;
}

interface DoubleProcTableProps {
    breakdown: DoubleProcBreakdown | null | undefined;
}

const DoubleProcTable: React.FC<DoubleProcTableProps> = ({ breakdown }) => {
    const byStrategy = breakdown?.byStrategy ?? {};
    const hasAny = STRATS.some((strategy) => breakdown?.byStrategy?.[String(strategy)]?.estimatedDoubleOpportunityRate !== undefined);
    if (!hasAny) return null;

    const fmt = (summary: DoubleProcRateSummary | undefined) => {
        if (!summary || summary.estimatedDoubleOpportunityRate === undefined) {
            return <span className="swb-empty">-</span>;
        }
        return <strong className="swb-double-proc-rate">{(summary.estimatedDoubleOpportunityRate * 100).toFixed(1)}%</strong>;
    };

    return (
        <div className="swb-container">
            <div className="swb-header">Estimated frequency for two proc opportunities during a race</div>
            <table className="swb-table">
                <thead>
                    <tr>
                        <th className="swb-label-col" />
                        {STRATS.map(s => <th key={s} className="swb-strat-col">{STRAT_LABELS[s]}</th>)}
                        <th className="swb-total-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="swb-row--total">
                        <td className="swb-label">All</td>
                        {STRATS.map(s => (
                            <td key={s} className="swb-cell">
                                {fmt(byStrategy[String(s)])}
                            </td>
                        ))}
                        <td className="swb-cell swb-cell--all">
                            {fmt(breakdown?.overall)}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default DoubleProcTable;

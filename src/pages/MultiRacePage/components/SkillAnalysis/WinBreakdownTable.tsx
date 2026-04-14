import React from "react";
import { SkillStats, HorseEntry } from "../../types";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import { STRATS, STRAT_LABELS } from "./skillUtils";

interface WinBreakdownTableProps {
    skill: SkillStats;
    horses: HorseEntry[];
}

const WinBreakdownTable: React.FC<WinBreakdownTableProps> = ({ skill, horses }) => {
    const baseId = Math.floor(skill.skillId / 10);
    // Inherited unique skills (9xxxxx) have baseIds offset by +80000 from their 1xxxxx counterparts
    const inheritedBaseId = (skill.skillId >= 100000 && skill.skillId < 200000) ? baseId + 80000 : null;

    type Cell = { apps: number; wins: number };
    const variantSet = new Set<number>();
    const byVariantStrat = new Map<string, Cell>();
    const byVariantAll = new Map<number, Cell>();
    const byStratAll = new Map<number, Cell>();
    let totalApps = 0, totalWins = 0;

    const bump = (map: Map<any, Cell>, key: any, won: boolean) => {
        if (!map.has(key)) map.set(key, { apps: 0, wins: 0 });
        const c = map.get(key)!;
        c.apps++;
        if (won) c.wins++;
    };

    for (const h of horses) {
        const won = h.finishOrder === 1;
        let activatedAny = false;
        for (const id of h.activatedSkillIds) {
            const idBase = Math.floor(id / 10);
            if (idBase !== baseId && idBase !== inheritedBaseId) continue;
            variantSet.add(id);
            bump(byVariantStrat, `${id}:${h.strategy}`, won);
            bump(byVariantAll, id, won);
            activatedAny = true;
        }
        if (activatedAny) {
            bump(byStratAll, h.strategy, won);
            totalApps++;
            if (won) totalWins++;
        }
    }

    if (variantSet.size === 0) return null;

    const variantIds = [...variantSet].sort();
    const showVariants = variantIds.length > 1;

    const fmtCell = (cell: Cell | undefined) => {
        if (!cell || cell.apps === 0) return { el: <span className="swb-empty">—</span>, title: undefined };
        return {
            el: <span className="swb-pct">{(cell.wins / cell.apps * 100).toFixed(1)}%</span>,
            title: `${cell.wins}W / ${cell.apps}`,
        };
    };

    const rows: { label: string; apps: number; isTotal: boolean; variantId: number | null }[] = [];
    if (showVariants) {
        for (const vid of variantIds) {
            const baseName = UMDatabaseWrapper.skillNameWithEnglishFallback(vid);
            const label = (vid >= 900000 && vid < 1000000) ? `${baseName} (Inherit)` : baseName;
            const apps = byVariantAll.get(vid)?.apps ?? 0;
            rows.push({ label, apps, isTotal: false, variantId: vid });
        }
    }
    rows.push({ label: "All", apps: totalApps, isTotal: true, variantId: null });

    return (
        <div className="swb-container">
            <div className="swb-header">Win rates if skill activated</div>
            <table className="swb-table">
                <thead>
                    <tr>
                        <th className="swb-label-col" />
                        {STRATS.map(s => <th key={s} className="swb-strat-col">{STRAT_LABELS[s]}</th>)}
                        <th className="swb-total-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ label, apps, isTotal, variantId }) => (
                        <tr key={variantId ?? 'all'} className={isTotal ? 'swb-row--total' : ''}>
                            <td className="swb-label" title={`${label} (${apps} activations)`}>
                                {label}
                                <span className="swb-apps"> ({apps} activations)</span>
                            </td>
                            {STRATS.map(s => {
                                const cell = variantId !== null
                                    ? byVariantStrat.get(`${variantId}:${s}`)
                                    : byStratAll.get(s);
                                const { el, title } = fmtCell(cell);
                                return <td key={s} className="swb-cell" title={title}>{el}</td>;
                            })}
                            {(() => {
                                const cell = variantId !== null
                                    ? byVariantAll.get(variantId)
                                    : { apps: totalApps, wins: totalWins };
                                const { el, title } = fmtCell(cell);
                                return <td className="swb-cell swb-cell--all" title={title}>{el}</td>;
                            })()}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default WinBreakdownTable;

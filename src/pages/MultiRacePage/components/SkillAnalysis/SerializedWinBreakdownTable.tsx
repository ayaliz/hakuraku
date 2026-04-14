import React from "react";
import type { SerializedSkillWinBreakdownCell, SerializedSkillWinBreakdownRow } from "../../../UmaLogsPage/skillCache";
import { STRATS, STRAT_LABELS } from "./skillUtils";

function formatSerializedWinBreakdownCell(cell: SerializedSkillWinBreakdownCell | undefined | null) {
    if (!cell || cell.apps === 0) return { el: <span className="swb-empty">-</span>, title: undefined };
    return {
        el: <span className="swb-pct">{(cell.wins / cell.apps * 100).toFixed(1)}%</span>,
        title: `${cell.wins}W / ${cell.apps}`,
    };
}

export function filterWinBreakdownRows(
    rows: SerializedSkillWinBreakdownRow[] | null | undefined,
    selectedStrategy: string,
): SerializedSkillWinBreakdownRow[] | null {
    if (!rows || rows.length === 0 || selectedStrategy === "all") return rows ?? null;

    return rows
        .map((row) => {
            const selectedCell = row.cellsByStrategy[selectedStrategy] ?? null;
            return {
                ...row,
                apps: selectedCell?.apps ?? 0,
                cellsByStrategy: Object.fromEntries(
                    STRATS.map((strategy) => [
                        String(strategy),
                        String(strategy) === selectedStrategy ? selectedCell : null,
                    ]),
                ),
                total: selectedCell,
            };
        })
        .filter((row) => row.total?.apps);
}

interface SerializedWinBreakdownTableProps {
    rows: SerializedSkillWinBreakdownRow[] | null | undefined;
}

const SerializedWinBreakdownTable: React.FC<SerializedWinBreakdownTableProps> = ({ rows }) => {
    if (!rows || rows.length === 0) return null;

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
                    {rows.map(({ label, apps, isTotal, variantId, cellsByStrategy, total }) => (
                        <tr key={variantId ?? "all"} className={isTotal ? "swb-row--total" : ""}>
                            <td className="swb-label" title={`${label} (${apps} activations)`}>
                                {label}
                                <span className="swb-apps"> ({apps} activations)</span>
                            </td>
                            {STRATS.map((strategy) => {
                                const { el, title } = formatSerializedWinBreakdownCell(cellsByStrategy[String(strategy)]);
                                return <td key={strategy} className="swb-cell" title={title}>{el}</td>;
                            })}
                            {(() => {
                                const { el, title } = formatSerializedWinBreakdownCell(total);
                                return <td className="swb-cell swb-cell--all" title={title}>{el}</td>;
                            })()}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default SerializedWinBreakdownTable;

import React from "react";
import type { SkillActivationBuckets, SkillActivationBucketSeries } from "../../types";
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

function sumBucketRange(buckets: number[] | undefined, start: number, end: number): number {
    if (!buckets) return 0;
    let total = 0;
    for (let index = start; index <= end; index++) total += buckets[index] ?? 0;
    return total;
}

export function buildBucketRangeWinBreakdownRows(
    rows: SerializedSkillWinBreakdownRow[] | null | undefined,
    buckets: SkillActivationBuckets,
    start: number,
    end: number,
): SerializedSkillWinBreakdownRow[] | null {
    if (!rows?.length) return null;
    const scopedRows = rows.flatMap((row) => {
        let series: SkillActivationBucketSeries | undefined;
        if (row.cohort === "variant" && row.variantId !== null) {
            series = buckets.byVariant?.[String(row.variantId)];
        } else if (row.cohort === "activatedAny" || row.isTotal) {
            series = buckets;
        }
        // "Neither" has no proc location, and legacy payloads have no per-variant series.
        if (!series) return [];

        const cellsByStrategy = Object.fromEntries(
            STRATS.map((strategy) => {
                const key = String(strategy);
                const activationBuckets = series.byStrategy[key];
                const winBuckets = series.winByStrategy?.[key];
                if (!activationBuckets || !winBuckets) return [key, null];
                return [key, {
                    apps: sumBucketRange(activationBuckets, start, end),
                    wins: sumBucketRange(winBuckets, start, end),
                }];
            }),
        );
        const total = {
            apps: sumBucketRange(series.all, start, end),
            wins: sumBucketRange(series.win, start, end),
        };
        return [{ ...row, apps: total.apps, cellsByStrategy, total }];
    });

    return scopedRows.length > 0 ? scopedRows : null;
}

interface SerializedWinBreakdownTableProps {
    rows: SerializedSkillWinBreakdownRow[] | null | undefined;
    rangeLabel?: string;
    onClearRange?: () => void;
}

const SerializedWinBreakdownTable: React.FC<SerializedWinBreakdownTableProps> = ({ rows, rangeLabel, onClearRange }) => {
    if (!rows || rows.length === 0) return null;
    const hasNeitherCohort = rows.some((row) => row.cohort === "activatedNeither");

    return (
        <div className="swb-container">
            <div className="swb-header">
                <span>{hasNeitherCohort ? "Win rates by skill activation" : "Win rates if skill activated"}</span>
                {rangeLabel && <span className="swb-range-label">{rangeLabel}</span>}
                {rangeLabel && onClearRange && (
                    <button type="button" className="swb-range-clear" onClick={onClearRange}>Clear range</button>
                )}
            </div>
            <table className="swb-table">
                <thead>
                    <tr>
                        <th className="swb-label-col" />
                        {STRATS.map(s => <th key={s} className="swb-strat-col">{STRAT_LABELS[s]}</th>)}
                        <th className="swb-total-col">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ label, apps, isTotal, variantId, cohort, cellsByStrategy, total }) => {
                        const isNeither = cohort === "activatedNeither";
                        const countNoun = isNeither ? "entries" : "activations";
                        return (
                            <tr
                                key={cohort === "variant" ? `variant-${variantId}` : cohort ?? variantId ?? "all"}
                                className={isTotal ? "swb-row--total" : ""}
                            >
                                <td
                                    className="swb-label"
                                    title={isNeither
                                        ? `${label} (${apps} entries where no skill variant activated)`
                                        : `${label} (${apps} activations)`}
                                >
                                    {label}
                                    <span className="swb-apps"> ({apps} {countNoun})</span>
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
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default SerializedWinBreakdownTable;

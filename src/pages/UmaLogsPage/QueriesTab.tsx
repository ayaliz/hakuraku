import React, { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql as sqlLang, SQLite } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";
import { STRATEGY_COLORS, STRATEGY_NAMES } from "../MultiRacePage/components/WinDistributionCharts/constants";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import { UMA_LOGS_API_BASE } from "./umaLogsApi";
import type { UmaLogsQuerySpec } from "./umaLogsQueryShared";
import { useLatestRequest } from "../../features/umalogs/api/latestRequest";
import QueryHelpModal from "./QueryHelpModal";
import {
    queryCompletionSource,
    queryEmptyCompletionTriggerExtension,
    queryHighlightExtension,
} from "./query/queryEditorLanguage";
import { compileFriendlyNames } from "./query/queryFriendlyNames";
import {
    buildCharacterNameEntries,
    buildSkillNameEntries,
    buildSupportCardNameEntries,
    resolveIconSkillId,
} from "./query/queryNameCatalog";
import "./UmaLogsControls.css";
import "./QueryTab.css";

type QueryColumn = {
    key: string;
    label: string;
    type: "number" | "percent" | "dimension";
};

type TextQueryResponse = {
    columns: QueryColumn[];
    rows: Array<Record<string, unknown>>;
    limit: number;
    offset: number;
    source?: "aggregate-cache" | "live" | "compiled";
    querySpec?: UmaLogsQuerySpec;
};

interface QueriesTabProps {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    onFindReplays?: (querySpec: UmaLogsQuerySpec) => void;
    initialQuery?: string;
}

const DEFAULT_QUERY = `select uma, style, is_debuffer, entries, wins, win_rate
group by uma, style, is_debuffer
order by wins desc
limit 20`;
const QUERY_DRAFT_STORAGE_KEY = "umalogs-query-draft";

function buildTextQueryUrl(cmId: string, courseId: number, apiBase = UMA_LOGS_API_BASE): string {
    return `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/queries/run`;
}

function formatValue(column: QueryColumn, value: unknown): string {
    if (value == null) return "-";
    if (column.key === "strategy" || column.key === "winner_strategy") {
        const strategy = Number(value);
        return STRATEGY_NAMES[strategy] ?? `Style ${strategy}`;
    }
    if (column.key === "card_id" || column.key === "winner_card_id") {
        const cardId = Number(value);
        return UMDatabaseWrapper.cards[cardId]?.name ?? `Card ${cardId}`;
    }
    if (column.key === "chara_id" || column.key === "winner_chara_id") {
        const charaId = Number(value);
        return UMDatabaseWrapper.charas[charaId]?.name ?? `Uma ${charaId}`;
    }
    if (column.type === "percent") return `${(Number(value) * 100).toFixed(1)}%`;
    if (column.type === "number" && typeof value === "number") {
        return Number.isInteger(value) ? value.toLocaleString() : Math.round(value).toLocaleString();
    }
    return String(value);
}

function asFiniteNumber(value: unknown): number | null {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function renderQueryCell(column: QueryColumn, row: Record<string, unknown>): React.ReactNode {
    const value = row[column.key];
    if (value == null) return formatValue(column, value);

    if (column.key === "strategy" || column.key === "winner_strategy") {
        const strategy = asFiniteNumber(value);
        const label = formatValue(column, value);
        return (
            <span className="query-style-result-badge">
                {strategy !== null && (
                    <span
                        className="query-style-result-dot"
                        style={{ background: STRATEGY_COLORS[strategy] ?? "#94a3b8" }}
                    />
                )}
                <span>{label}</span>
                {row.is_debuffer === true && <span className="query-debuffer-badge">Debuffer</span>}
            </span>
        );
    }

    if (column.type === "percent") {
        const percent = Math.max(0, Math.min(100, Number(value) * 100));
        return (
            <span className="query-percent-cell">
                <span className="query-percent-bar" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                </span>
                <span>{formatValue(column, value)}</span>
            </span>
        );
    }

    if (typeof value === "boolean") {
        return (
            <span className={`query-boolean-pill${value ? " query-boolean-pill--true" : ""}`}>
                {value ? "Yes" : "No"}
            </span>
        );
    }

    if (column.key === "card_id" || column.key === "winner_card_id") {
        const cardId = asFiniteNumber(value);
        if (cardId === null) return formatValue(column, value);
        const iconUrl = AssetLoader.getCharaThumb(cardId);
        const label = formatValue(column, value);
        return (
            <span className="query-character-cell">
                {iconUrl && (
                    <span className="query-character-portrait">
                        <img
                            src={iconUrl}
                            alt=""
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    </span>
                )}
                <span>{label}</span>
            </span>
        );
    }

    if (column.key !== "chara_id" && column.key !== "winner_chara_id") return formatValue(column, value);

    const charaId = asFiniteNumber(value);
    if (charaId === null) return formatValue(column, value);
    const iconUrl = getCharaIcon(charaId);
    const label = formatValue(column, value);

    return (
        <span className="query-character-cell">
            {iconUrl && (
                <span className="query-character-portrait">
                    <img
                        src={iconUrl}
                        alt=""
                        onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                </span>
            )}
            <span>{label}</span>
        </span>
    );
}

function renderQueryHeader(column: QueryColumn): React.ReactNode {
    const skillMetric = column.key.match(/^(activation_rate|activated_entries)_(\d+)$/);
    if (!skillMetric) return column.label;
    const skillId = Number(skillMetric[2]);
    const iconSkillId = resolveIconSkillId(skillId);
    const iconId = UMDatabaseWrapper.skills[iconSkillId]?.iconId;
    const iconUrl = iconId ? AssetLoader.getSkillIcon(iconId) : null;
    const name = UMDatabaseWrapper.skillNameWithEnglishFallback(skillId);
    return (
        <span className="query-skill-header">
            {iconUrl && <img src={iconUrl} alt="" />}
            <span>{skillMetric[1] === "activation_rate" ? "Activation" : "Activated"}: {name}</span>
        </span>
    );
}

const QueriesTab: React.FC<QueriesTabProps> = ({ cmId, courseId, apiBase, onFindReplays, initialQuery }) => {
    const [query, setQuery] = useState(() => {
        const requestedQuery = initialQuery?.trim();
        if (requestedQuery) return requestedQuery;
        try {
            return localStorage.getItem(QUERY_DRAFT_STORAGE_KEY)?.trim() || DEFAULT_QUERY;
        } catch {
            return DEFAULT_QUERY;
        }
    });
    const [result, setResult] = useState<TextQueryResponse | null>(null);
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [outputMode, setOutputMode] = useState<"aggregate" | "replays">("aggregate");
    const { runLatest, cancelLatest } = useLatestRequest();
    const skillNameEntries = useMemo(buildSkillNameEntries, []);
    const characterNameEntries = useMemo(buildCharacterNameEntries, []);
    const supportCardNameEntries = useMemo(buildSupportCardNameEntries, []);
    useEffect(() => {
        const requestedQuery = initialQuery?.trim();
        if (requestedQuery) setQuery(requestedQuery);
    }, [initialQuery]);
    useEffect(() => {
        try {
            localStorage.setItem(QUERY_DRAFT_STORAGE_KEY, query);
        } catch {
            // Draft persistence is optional when browser storage is unavailable.
        }
    }, [query]);
    useEffect(() => {
        cancelLatest();
        setResult(null);
        setQueryError(null);
        setQueryLoading(false);
    }, [cancelLatest, cmId, courseId]);
    const compiledQuery = useMemo(
        () => compileFriendlyNames(query, skillNameEntries, characterNameEntries, supportCardNameEntries),
        [characterNameEntries, query, skillNameEntries, supportCardNameEntries],
    );
    const queryEditorExtensions = useMemo(
        () => [
            sqlLang({ dialect: SQLite }),
            closeBrackets(),
            autocompletion({
                override: [queryCompletionSource(skillNameEntries, characterNameEntries, supportCardNameEntries)],
                activateOnTyping: true,
            }),
            queryEmptyCompletionTriggerExtension(),
            queryHighlightExtension(skillNameEntries, characterNameEntries, supportCardNameEntries),
        ],
        [characterNameEntries, skillNameEntries, supportCardNameEntries],
    );
    const helpSnippetExtensions = useMemo(
        () => [queryHighlightExtension(skillNameEntries, characterNameEntries, supportCardNameEntries)],
        [characterNameEntries, skillNameEntries, supportCardNameEntries],
    );

    const runQuery = (offsetOverride?: number) => {
        if (!cmId || !courseId || !query.trim()) return;
        const requestedOutputMode = outputMode;
        setQueryLoading(true);
        setQueryError(null);
        setResult(null);
        void runLatest(async (signal) => {
            const response = await fetch(buildTextQueryUrl(cmId, courseId, apiBase ?? UMA_LOGS_API_BASE), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: compiledQuery,
                    compileOnly: requestedOutputMode === "replays",
                    ...(offsetOverride === undefined ? {} : { offset: offsetOverride }),
                }),
                signal,
            });
                if (!response.ok) {
                    let message = `HTTP ${response.status} - query failed`;
                    try {
                        const body = await response.json() as { error?: string };
                        if (body.error) message = body.error;
                    } catch {
                        // Use the generic status message.
                    }
                    if (response.status === 405) {
                        message = "The query backend route is not deployed yet. The editor is loaded from local code, but /queries/run is still missing on the live Worker.";
                    }
                    throw new Error(message);
                }
                return await response.json() as TextQueryResponse;
            }).then((outcome) => {
                if (outcome.status === "cancelled") return;
                if (outcome.status === "error") {
                    setQueryError(/statement timeout|timed out/i.test(outcome.error.message)
                        ? "Query timed out. Narrow the cohort with a more selective filter."
                        : outcome.error.message);
                    setQueryLoading(false);
                    return;
                }
                const json = outcome.value;
                if (requestedOutputMode === "replays") {
                    if (!json.querySpec?.where || !onFindReplays) {
                        setQueryError(json.querySpec?.where
                            ? "Replay output is unavailable here."
                            : "Replay output requires a WHERE clause.");
                        setQueryLoading(false);
                        return;
                    }
                    try {
                        onFindReplays(json.querySpec);
                    } catch (error) {
                        setQueryError(error instanceof Error ? error.message : String(error));
                    }
                    setQueryLoading(false);
                    return;
                }
                setResult(json);
                setQueryLoading(false);
            });
    };

    if (!cmId || !courseId) return <div className="exp-empty">Select a dataset first.</div>;

    return (
        <div className="query-tab">
            <div className="query-editor-panel">
                <div className="query-editor-header">
                    <div>
                        <h4>UmaLogs Query</h4>
                        <p>Write a constrained SQL-like query over race entries, learned skills, activated skills, support cards, and Uma data.</p>
                    </div>
                    <div className="query-editor-actions">
                        <div className="query-output-toggle" role="group" aria-label="Query output">
                            <button
                                type="button"
                                className={outputMode === "aggregate" ? "active" : ""}
                                aria-pressed={outputMode === "aggregate"}
                                onClick={() => setOutputMode("aggregate")}
                            >
                                Aggregate
                            </button>
                            <button
                                type="button"
                                className={outputMode === "replays" ? "active" : ""}
                                aria-pressed={outputMode === "replays"}
                                onClick={() => setOutputMode("replays")}
                                disabled={!onFindReplays}
                            >
                                Replays
                            </button>
                        </div>
                        <button className="query-help-btn" type="button" onClick={() => setHelpOpen(true)}>
                            Help
                        </button>
                        <button className="exp-run-btn" onClick={() => runQuery()} disabled={queryLoading || !query.trim()}>
                            {queryLoading ? "Running..." : outputMode === "replays" ? "Find Replays" : "Run Query"}
                        </button>
                    </div>
                </div>

                <CodeMirror
                    value={query}
                    onChange={(value) => {
                        setQuery(value);
                        setResult(null);
                        setQueryError(null);
                    }}
                    extensions={queryEditorExtensions}
                    theme={oneDark}
                    basicSetup={{ lineNumbers: false, foldGutter: false }}
                    className="query-code-editor"
                />

            </div>

            {queryError && <div className="exp-empty">{queryError}</div>}

            {result && (
                <div className="query-card">
                    <div className="query-results-header">
                        <h5>Results</h5>
                        <div className="query-results-meta">
                            <span>{result.rows.length.toLocaleString()} row(s), offset {result.offset.toLocaleString()}, limit {result.limit}{result.source === "aggregate-cache" ? ", aggregate snapshot" : ""}</span>
                            <button
                                className="query-help-btn"
                                type="button"
                                disabled={queryLoading || result.offset === 0}
                                onClick={() => runQuery(Math.max(0, result.offset - result.limit))}
                            >
                                Previous
                            </button>
                            <button
                                className="query-help-btn"
                                type="button"
                                disabled={queryLoading || result.rows.length < result.limit || result.offset + result.limit > 10_000}
                                onClick={() => runQuery(result.offset + result.limit)}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                    {result.rows.length === 0 ? (
                        <div className="exp-empty exp-empty--compact">No matches.</div>
                    ) : (
                        <div className="query-table-wrap">
                            <table className="exp-table query-breakdown-table">
                                <thead>
                                    <tr>
                                        {result.columns.map((column) => (
                                            <th key={column.key} className={`exp-th ${column.type !== "dimension" ? "exp-th--r" : ""}`}>
                                                {renderQueryHeader(column)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className="exp-row">
                                            {result.columns.map((column) => (
                                                <td key={column.key} className={`exp-td ${column.type !== "dimension" ? "exp-td--r" : ""}`}>
                                                    {renderQueryCell(column, row)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {helpOpen && (
                <QueryHelpModal
                    onClose={() => setHelpOpen(false)}
                    snippetExtensions={helpSnippetExtensions}
                    onUseExample={(exampleQuery) => {
                        setQuery(exampleQuery);
                        setHelpOpen(false);
                        setResult(null);
                        setQueryError(null);
                    }}
                />
            )}
        </div>
    );
};

export default QueriesTab;

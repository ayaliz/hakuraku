import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BAYES_TEAM, STRATEGY_NAMES } from "./constants";
import type { HorseEntry, SkillStats, TeamCompositionStats } from "../../types";
import InfoTooltip from "./InfoTooltip";
import TeamSampleSelect from "./TeamSampleSelect";
import { TeamMemberCard } from "./TeamMemberCard";
import type { StyleCompositionSummaryRow } from "../../../../features/umalogs/model/panelData";
import {
    type SerializedHorseEntry,
    deserializeHorseEntries,
    UMA_LOGS_API_BASE,
    buildCompositionRepsUrl,
    buildCompositionTeamsUrl,
    makeMemberKey,
    makeCompositionKey,
    MIN_STYLE_APPEARANCES,
    MAX_STYLE_ITEMS,
    MIN_TEAM_APPEARANCES,
} from "./shared";

type CompositionRepResponse = {
    cmId: string;
    courseId: number;
    compositionKey: string;
    horses: SerializedHorseEntry[];
};

type CompositionTeamsResponse = {
    cmId: string;
    courseId: number;
    compositionKey: string;
    teams: TeamCompositionStats[];
};

export function StyleTeamCompositionPanel({
    cmId,
    courseId,
    apiBase,
    apiMode,
    styleCompositionRows,
    skillStats,
    strategyColors,
    onViewReplays,
    onSelectComposition,
    headerControls,
    minimumAppearances = MIN_STYLE_APPEARANCES,
    useAdjustedRates = true,
}: {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    styleCompositionRows: StyleCompositionSummaryRow[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
    onSelectComposition?: (row: StyleCompositionSummaryRow) => void;
    headerControls?: ReactNode;
    minimumAppearances?: number;
    useAdjustedRates?: boolean;
}) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedTeamIdx, setSelectedTeamIdx] = useState(0);
    const [compositionTeamsCache, setCompositionTeamsCache] = useState<Record<string, TeamCompositionStats[]>>({});
    const [compositionTeamsLoadingKeys, setCompositionTeamsLoadingKeys] = useState<string[]>([]);
    const [compositionTeamsError, setCompositionTeamsError] = useState<string | null>(null);
    const [compositionRepCache, setCompositionRepCache] = useState<Record<string, HorseEntry[]>>({});
    const [compositionRepLoadingKeys, setCompositionRepLoadingKeys] = useState<string[]>([]);
    const [compositionRepError, setCompositionRepError] = useState<string | null>(null);

    const all = styleCompositionRows.filter(e => e.appearances >= minimumAppearances);
    if (all.length === 0) return null;

    const displayedRate = (row: StyleCompositionSummaryRow) => useAdjustedRates ? row.bayesianWinRate : row.winRate;
    const sorted = [...all].sort((a, b) => displayedRate(b) - displayedRate(a));
    const overperformers = sorted.filter(e => displayedRate(e) > BAYES_TEAM.PRIOR).slice(0, MAX_STYLE_ITEMS);
    const underperformers = sorted.filter(e => displayedRate(e) < BAYES_TEAM.PRIOR).slice(-MAX_STYLE_ITEMS).reverse();
    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canDrilldown = !!(skillStats && canUseApiDrilldown);
    const canSelectComposition = canDrilldown || !!onSelectComposition;

    const drilldownTeams = useMemo(() => {
        if (!selectedKey) return [];
        return (compositionTeamsCache[selectedKey] ?? [])
            .filter(t => t.appearances >= MIN_TEAM_APPEARANCES)
            .map(t => ({
                team: t,
                bayesianWinRate: (t.wins + BAYES_TEAM.K * BAYES_TEAM.PRIOR) / (t.appearances + BAYES_TEAM.K),
            }))
            .sort((a, b) => b.bayesianWinRate - a.bayesianWinRate)
            .slice(0, 6);
    }, [compositionTeamsCache, selectedKey]);

    useEffect(() => {
        if (!canUseApiDrilldown || !selectedKey || !cmId || !courseId) return;
        if (compositionTeamsCache[selectedKey]) return;
        const controller = new AbortController();
        setCompositionTeamsLoadingKeys((keys) => [...keys, selectedKey]);
        setCompositionTeamsError(null);
        fetch(buildCompositionTeamsUrl(cmId, courseId, selectedKey, apiBase ?? UMA_LOGS_API_BASE), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load composition teams (${response.status})`);
                return await response.json() as CompositionTeamsResponse;
            })
            .then((payload) => {
                setCompositionTeamsCache((cache) => ({
                    ...cache,
                    [payload.compositionKey]: payload.teams,
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load style composition teams", { selectedKey, error });
                setCompositionTeamsError(error instanceof Error ? error.message : "Failed to load composition teams.");
                setCompositionTeamsCache((cache) => ({ ...cache, [selectedKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setCompositionTeamsLoadingKeys((keys) => keys.filter((key) => key !== selectedKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, compositionTeamsCache, courseId, selectedKey]);

    const renderItem = (e: StyleCompositionSummaryRow, positive: boolean) => {
        const valueColor = positive ? "#68d391" : "#fc8181";
        const isSelected = selectedKey === e.key;
        const label = e.strategies.map((strategy) => (STRATEGY_NAMES[strategy] ?? String(strategy)).split(" ")[0]).join(" / ");
        return (
            <div
                key={e.key}
                className={`sa-stcp-item${canSelectComposition ? " sa-stcp-item--clickable" : ""}${isSelected ? " sa-stcp-item--selected" : ""}`}
                role={canSelectComposition ? "button" : undefined}
                tabIndex={canSelectComposition ? 0 : undefined}
                aria-label={canSelectComposition ? `View teams using ${label}` : undefined}
                onClick={canSelectComposition ? () => {
                    onSelectComposition?.(e);
                    if (canDrilldown) {
                        setSelectedTeamIdx(0);
                        setSelectedKey(k => k === e.key ? null : e.key);
                    }
                } : undefined}
                onKeyDown={canSelectComposition ? event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.currentTarget.click();
                    }
                } : undefined}
            >
                <div className="sa-stcp-dots">
                    {e.strategies.map((s, i) => (
                        <span key={i} className="sa-stcp-dot" style={{ background: strategyColors[s] ?? "#718096" }} />
                    ))}
                </div>
                <div className="sa-stcp-name">{label}</div>
                <div className="sa-stcp-stats">
                    <span className="sa-adj-pct sa-stcp-stat" style={{ color: valueColor }}>{(displayedRate(e) * 100).toFixed(1)}%</span>
                    <span className="sa-raw-pct sa-stcp-stat">
                        {useAdjustedRates
                            ? `${(e.winRate * 100).toFixed(1)}% (${e.appearances})`
                            : `${e.confidenceInterval?.map(value => `${(value * 100).toFixed(1)}%`).join('–') ?? '—'} (${e.appearances.toLocaleString('en-US')})`}
                    </span>
                </div>
            </div>
        );
    };

    const idx = Math.min(selectedTeamIdx, Math.max(0, drilldownTeams.length - 1));
    const selectedTeam = drilldownTeams[idx] ?? null;
    const teamSelectOptions = drilldownTeams.map((item, i) => {
        const n = item.team.appearances;
        return {
            value: String(i),
            samples: n,
            members: item.team.members.map((m, mi) => ({
                cardId: m.cardId,
                strategy: m.strategy,
                winRatePct: n > 0 ? ((item.team.memberWins[mi] ?? 0) / n) * 100 : 0,
            })),
        };
    });
    const selectedCompositionKey = selectedTeam ? makeCompositionKey(selectedTeam.team.members) : null;
    const selectedBuildKey = selectedTeam?.team.buildKey;
    const selectedRepCacheKey = selectedCompositionKey
        ? `${selectedCompositionKey}|${selectedBuildKey ?? ""}`
        : null;
    useEffect(() => {
        if (!canUseApiDrilldown || !selectedCompositionKey || !selectedRepCacheKey || !cmId || !courseId) return;
        if (compositionRepCache[selectedRepCacheKey]) return;
        const controller = new AbortController();
        setCompositionRepLoadingKeys((keys) => [...keys, selectedRepCacheKey]);
        setCompositionRepError(null);
        fetch(buildCompositionRepsUrl(cmId, courseId, selectedCompositionKey, apiBase ?? UMA_LOGS_API_BASE, selectedBuildKey), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load representative team (${response.status})`);
                return await response.json() as CompositionRepResponse;
            })
            .then((payload) => {
                setCompositionRepCache((cache) => ({
                    ...cache,
                    [selectedRepCacheKey]: deserializeHorseEntries(payload.horses),
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load style composition representatives", { selectedCompositionKey, error });
                setCompositionRepError(error instanceof Error ? error.message : "Failed to load representative team.");
                setCompositionRepCache((cache) => ({ ...cache, [selectedRepCacheKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setCompositionRepLoadingKeys((keys) => keys.filter((key) => key !== selectedRepCacheKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, compositionRepCache, courseId, selectedBuildKey, selectedCompositionKey, selectedRepCacheKey]);
    const representativeByMemberKey = selectedRepCacheKey
        ? new Map<string, HorseEntry>((compositionRepCache[selectedRepCacheKey] ?? []).map((horse) => [makeMemberKey(horse), horse]))
        : new Map<string, HorseEntry>();

    return (
        <div className={`sa-stcp-section${useAdjustedRates ? '' : ' sa-stcp-section--raw-intervals'}`}>
            <div className="sa-stcp-header">
                Style Composition Performance
                <InfoTooltip
                    id="style-composition-performance-info"
                    tip="Win rate of 3-uma teams grouped by running style trio."
                />
                {headerControls && <span className="sa-stcp-header-controls">{headerControls}</span>}
            </div>
            <div className="sa-stcp-columns">
                {overperformers.length > 0 && (
                    <div className="sa-stcp-col">
                        <div className="sa-stcp-col-label sa-stcp-col-label--over">OVERPERFORMERS<span className="sa-stats-meta sa-stats-meta--bayes"><span className="sa-meta-adj sa-meta-adj--over">{useAdjustedRates ? 'Adj. win%' : 'Team win%'}</span><span className="sa-meta-raw">{useAdjustedRates ? 'Raw win% (samples)' : '95% CI (n)'}</span></span></div>
                        {overperformers.map(e => renderItem(e, true))}
                    </div>
                )}
                {underperformers.length > 0 && (
                    <div className="sa-stcp-col">
                        <div className="sa-stcp-col-label sa-stcp-col-label--under">UNDERPERFORMERS<span className="sa-stats-meta sa-stats-meta--bayes"><span className="sa-meta-adj sa-meta-adj--under">{useAdjustedRates ? 'Adj. win%' : 'Team win%'}</span><span className="sa-meta-raw">{useAdjustedRates ? 'Raw win% (samples)' : '95% CI (n)'}</span></span></div>
                        {underperformers.map(e => renderItem(e, false))}
                    </div>
                )}
            </div>
            {canDrilldown && selectedKey && (
                <div className="tcp-member-drilldown">
                    {canUseApiDrilldown && selectedKey && compositionTeamsLoadingKeys.includes(selectedKey) && (
                        <div className="sa-no-data">Loading composition teams...</div>
                    )}
                    {!selectedTeam && compositionTeamsError && (
                        <div className="sa-no-data">{compositionTeamsError}</div>
                    )}
                    {selectedTeam && (
                        <>
                    {drilldownTeams.length > 1 && (
                        <div className="tcp-rep-team-select">
                            <TeamSampleSelect
                                value={String(idx)}
                                options={teamSelectOptions}
                                onChange={(v) => setSelectedTeamIdx(Number(v))}
                                strategyColors={strategyColors}
                                showPlaceholderOption={false}
                            />
                        </div>
                    )}
                    {canUseApiDrilldown && selectedRepCacheKey && compositionRepLoadingKeys.includes(selectedRepCacheKey) && (
                        <div className="sa-no-data">Loading representative team samples...</div>
                    )}
                    {canUseApiDrilldown && selectedRepCacheKey && !compositionRepLoadingKeys.includes(selectedRepCacheKey) && (compositionRepCache[selectedRepCacheKey]?.length ?? 0) === 0 && compositionRepError && (
                        <div className="sa-no-data">{compositionRepError}</div>
                    )}
                    <div className="stcp-team-members-row">
                        {selectedTeam.team.members.map((m, i) => {
                            const rep = representativeByMemberKey.get(makeMemberKey(m));
                            if (!rep) {
                                return (
                                    <div key={i} className="stcp-member-card stcp-member-card--placeholder">
                                        <div className="stcp-member-placeholder-label">{m.charaName}</div>
                                        <div className="stcp-member-placeholder-note">No sample profile available</div>
                                    </div>
                                );
                            }
                            return <TeamMemberCard key={i} horse={rep} skillStats={skillStats!} strategyColors={strategyColors} onViewReplays={onViewReplays} />;
                        })}
                    </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

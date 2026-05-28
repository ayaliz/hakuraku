import { useEffect, useMemo, useState } from "react";
import { BAYES_TEAM } from "./constants";
import type { HorseEntry, SkillStats, TeamCompositionStats } from "../../types";
import InfoTooltip from "./InfoTooltip";
import TeamSampleSelect from "./TeamSampleSelect";
import { TeamMemberCard } from "./TeamMemberCard";
import type { StyleCompositionSummaryRow } from "../../../UmaLogsPage/panelData";
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
}: {
    cmId?: string | null;
    courseId?: number;
    apiBase?: string;
    apiMode?: boolean;
    styleCompositionRows: StyleCompositionSummaryRow[];
    skillStats?: Map<number, SkillStats>;
    strategyColors: Record<number, string>;
    onViewReplays?: (horse: HorseEntry) => void;
}) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [selectedTeamIdx, setSelectedTeamIdx] = useState(0);
    const [compositionTeamsCache, setCompositionTeamsCache] = useState<Record<string, TeamCompositionStats[]>>({});
    const [compositionTeamsLoadingKeys, setCompositionTeamsLoadingKeys] = useState<string[]>([]);
    const [compositionTeamsError, setCompositionTeamsError] = useState<string | null>(null);
    const [compositionRepCache, setCompositionRepCache] = useState<Record<string, HorseEntry[]>>({});
    const [compositionRepLoadingKeys, setCompositionRepLoadingKeys] = useState<string[]>([]);
    const [compositionRepError, setCompositionRepError] = useState<string | null>(null);

    const all = styleCompositionRows.filter(e => e.appearances >= MIN_STYLE_APPEARANCES);
    if (all.length === 0) return null;

    const sorted = [...all].sort((a, b) => b.bayesianWinRate - a.bayesianWinRate);
    const overperformers = sorted.filter(e => e.bayesianWinRate > BAYES_TEAM.PRIOR).slice(0, MAX_STYLE_ITEMS);
    const underperformers = sorted.filter(e => e.bayesianWinRate < BAYES_TEAM.PRIOR).slice(-MAX_STYLE_ITEMS).reverse();
    if (overperformers.length === 0 && underperformers.length === 0) return null;

    const canUseApiDrilldown = !!(apiMode && cmId && courseId && skillStats);
    const canDrilldown = !!(skillStats && canUseApiDrilldown);

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
        return (
            <div
                key={e.key}
                className={`sa-stcp-item${canDrilldown ? " sa-stcp-item--clickable" : ""}${isSelected ? " sa-stcp-item--selected" : ""}`}
                onClick={canDrilldown ? () => {
                    setSelectedTeamIdx(0);
                    setSelectedKey(k => k === e.key ? null : e.key);
                } : undefined}
            >
                <div className="sa-stcp-dots">
                    {e.strategies.map((s, i) => (
                        <span key={i} className="sa-stcp-dot" style={{ background: strategyColors[s] ?? "#718096" }} />
                    ))}
                </div>
                <div className="sa-stcp-name">{e.label}</div>
                <div className="sa-stcp-stats">
                    <span className="sa-adj-pct sa-stcp-stat" style={{ color: valueColor }}>{(e.bayesianWinRate * 100).toFixed(1)}%</span>
                    <span className="sa-raw-pct sa-stcp-stat">{(e.winRate * 100).toFixed(1)}% ({e.appearances})</span>
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
    useEffect(() => {
        if (!canUseApiDrilldown || !selectedCompositionKey || !cmId || !courseId) return;
        if (compositionRepCache[selectedCompositionKey]) return;
        const controller = new AbortController();
        setCompositionRepLoadingKeys((keys) => [...keys, selectedCompositionKey]);
        setCompositionRepError(null);
        fetch(buildCompositionRepsUrl(cmId, courseId, selectedCompositionKey, apiBase ?? UMA_LOGS_API_BASE), { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Failed to load representative team (${response.status})`);
                return await response.json() as CompositionRepResponse;
            })
            .then((payload) => {
                setCompositionRepCache((cache) => ({
                    ...cache,
                    [payload.compositionKey]: deserializeHorseEntries(payload.horses),
                }));
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.error("Failed to load style composition representatives", { selectedCompositionKey, error });
                setCompositionRepError(error instanceof Error ? error.message : "Failed to load representative team.");
                setCompositionRepCache((cache) => ({ ...cache, [selectedCompositionKey]: [] }));
            })
            .finally(() => {
                if (controller.signal.aborted) return;
                setCompositionRepLoadingKeys((keys) => keys.filter((key) => key !== selectedCompositionKey));
            });
        return () => controller.abort();
    }, [apiBase, canUseApiDrilldown, cmId, compositionRepCache, courseId, selectedCompositionKey]);
    const representativeByMemberKey = selectedCompositionKey
        ? new Map<string, HorseEntry>((compositionRepCache[selectedCompositionKey] ?? []).map((horse) => [makeMemberKey(horse), horse]))
        : new Map<string, HorseEntry>();

    return (
        <div className="sa-stcp-section">
            <div className="sa-stcp-header">
                Style Composition Performance
                <InfoTooltip
                    id="style-composition-performance-info"
                    tip="Win rate of 3-uma teams grouped by running style trio."
                />
            </div>
            <div className="sa-stcp-columns">
                {overperformers.length > 0 && (
                    <div className="sa-stcp-col">
                        <div className="sa-stcp-col-label sa-stcp-col-label--over">OVERPERFORMERS<span className="sa-stats-meta sa-stats-meta--bayes"><span className="sa-meta-adj sa-meta-adj--over">Adj. win%</span><span className="sa-meta-raw">Raw win% (samples)</span></span></div>
                        {overperformers.map(e => renderItem(e, true))}
                    </div>
                )}
                {underperformers.length > 0 && (
                    <div className="sa-stcp-col">
                        <div className="sa-stcp-col-label sa-stcp-col-label--under">UNDERPERFORMERS<span className="sa-stats-meta sa-stats-meta--bayes"><span className="sa-meta-adj sa-meta-adj--under">Adj. win%</span><span className="sa-meta-raw">Raw win% (samples)</span></span></div>
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
                            />
                        </div>
                    )}
                    {canUseApiDrilldown && selectedCompositionKey && compositionRepLoadingKeys.includes(selectedCompositionKey) && (
                        <div className="sa-no-data">Loading representative team samples...</div>
                    )}
                    {canUseApiDrilldown && selectedCompositionKey && !compositionRepLoadingKeys.includes(selectedCompositionKey) && (compositionRepCache[selectedCompositionKey]?.length ?? 0) === 0 && compositionRepError && (
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

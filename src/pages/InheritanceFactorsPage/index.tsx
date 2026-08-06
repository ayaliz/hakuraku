import { useEffect, useMemo, useState } from "react";
import GameDataLoader from "../../data/GameDataLoader";
import { formatFactor, getFactorColor } from "../../components/RaceDataPresenter/components/CharaList/utils";
import "../ShopRefreshPage/ShopRefreshPage.css";
import "../ShopRefreshPage/ShopRefreshResearch.css";
import "./InheritanceFactorsPage.css";

type DistributionEntry = { count: number; samples: number };
type SlotSummary = {
    position: number;
    label: string;
    samplesWithAny: number;
    appearanceRate: number;
    avgFactors: number;
    avgThreeStars: number;
    avgBlueThreeStars: number;
};
type CategorySummary = {
    category: number;
    label: string;
    samplesWithAny: number;
    appearanceRate: number;
    avgFactors: number;
    avgThreeStars: number;
};
type ThreeStarSparkPosition = {
    position: number;
    label: string;
    categories: Array<{
        key: string;
        label: string;
        copies: number;
        samplesWithAny: number;
        appearanceRate: number;
        avgCopies: number;
    }>;
};
type TopFactor = {
    factorId: number;
    copies: number;
    samplesWithAny: number;
    appearanceRate: number;
    avgCopies: number;
    category: number;
    stars: number;
};
type ShapeSummary = { shape: string; samples: number; percentage: number };
type SourceSummary = {
    eventId: number;
    label: string;
    samples: number;
    contributors: number;
    sourceStories: Array<{ storyId: number; samples: number }>;
    resolvingStories: Array<{ storyId: number; samples: number }>;
    averages: {
        totalFactors: number;
        parentFactors: number;
        grandparentFactors: number;
        totalThreeStars: number;
        blueThreeStars: number;
        parentBlueThreeStars: number;
        grandparentBlueThreeStars: number;
    };
    distributions: {
        totalFactors: DistributionEntry[];
        totalThreeStars: DistributionEntry[];
        blueThreeStars: DistributionEntry[];
        parentBlueThreeStars: DistributionEntry[];
        grandparentBlueThreeStars: DistributionEntry[];
    };
    slots: SlotSummary[];
    categories: CategorySummary[];
    threeStarSparksByPosition: ThreeStarSparkPosition[];
    topFactors: TopFactor[];
    shapes: ShapeSummary[];
};
type InheritanceSummary = {
    totals: { samples: number; contributors: number };
    sources: SourceSummary[];
};

const METRICS = [
    { key: "avgFactors", label: "Expected factors" },
    { key: "avgThreeStars", label: "Expected 3-stars" },
    { key: "avgBlueThreeStars", label: "Expected blue 3-stars" },
] as const;

function pct(count: number, total: number) {
    return total ? `${(count / total * 100).toFixed(1)}%` : "0.0%";
}

function factorName(factorId: number) {
    const formatted = formatFactor(factorId);
    if (!formatted) return `Factor ${factorId}`;
    return `${formatted.name} ${formatted.level}★`;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="ifh-stat-card">
            <span>{label}</span>
            <strong>{value}</strong>
            <em>{detail}</em>
        </div>
    );
}

function DistributionChart({ title, data, samples }: { title: string; data: DistributionEntry[]; samples: number }) {
    const max = Math.max(...data.map((entry) => entry.samples), 1);
    return (
        <div className="ifh-panel">
            <div className="csr-panel-title"><strong>{title}</strong><span>{samples} samples</span></div>
            <div className="ifh-distribution">
                {data.map((entry) => (
                    <div
                        key={entry.count}
                        className="ifh-distribution-column"
                        title={`${entry.count}: ${entry.samples} of ${samples} events (${pct(entry.samples, samples)})`}
                    >
                        <div className="ifh-distribution-bar"><i style={{ height: `${entry.samples / max * 100}%` }} /></div>
                        <strong>{entry.count}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SlotHeatmap({ source }: { source: SourceSummary }) {
    const values = source.slots.flatMap((slot) => METRICS.map((metric) => slot[metric.key]));
    const max = Math.max(...values, 0.01);
    return (
        <div className="ifh-panel">
            <div className="csr-panel-title"><strong>Where factors landed</strong><span>Per inheritance event</span></div>
            <div className="ifh-heatmap-scroll">
                <div className="ifh-heatmap" style={{ gridTemplateColumns: `minmax(150px, 1fr) repeat(${source.slots.length}, 82px)` }}>
                    <div />
                    {source.slots.map((slot) => <strong key={slot.position}>{slot.label}</strong>)}
                    {METRICS.map((metric) => (
                        <div className="ifh-heatmap-row" key={metric.key} style={{ display: "contents" }}>
                            <span>{metric.label}</span>
                            {source.slots.map((slot) => {
                                const value = slot[metric.key];
                                const tooltip = [
                                    `${slot.label}`,
                                    `${slot.samplesWithAny} of ${source.samples} events had any factor here (${slot.appearanceRate.toFixed(1)}%)`,
                                    `${slot.avgFactors.toFixed(2)} expected total factors`,
                                    `${slot.avgThreeStars.toFixed(2)} expected 3-star factors`,
                                    `${slot.avgBlueThreeStars.toFixed(2)} expected blue 3-star factors`,
                                ].join("\n");
                                return (
                                    <i key={`${metric.key}:${slot.position}`} title={tooltip} style={{ background: `rgba(101,210,131,${0.08 + value / max * 0.82})` }}>
                                        {value.toFixed(2)}
                                    </i>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CategoryPanel({ source }: { source: SourceSummary }) {
    const max = Math.max(...source.categories.map((category) => category.avgFactors), 0.01);
    return (
        <div className="ifh-panel">
            <div className="csr-panel-title"><strong>Factor type mix</strong><span>Expected factors per event</span></div>
            <div className="ifh-category-list">
                {source.categories.map((category) => (
                    <div
                        key={category.category}
                        className="ifh-category-row"
                        title={`${category.samplesWithAny} of ${source.samples} events included ${category.label} factors (${category.appearanceRate.toFixed(1)}%)\n${category.avgThreeStars.toFixed(2)} expected 3-stars`}
                    >
                        <span>{category.label}</span>
                        <div><i style={{ width: `${category.avgFactors / max * 100}%` }} /></div>
                        <strong>{category.avgFactors.toFixed(2)}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ThreeStarSparkPanel({ source }: { source: SourceSummary }) {
    const positions = source.threeStarSparksByPosition ?? [];
    const categoryLabels = positions[0]?.categories.map((category) => ({ key: category.key, label: category.label })) ?? [];
    const max = Math.max(...positions.flatMap((position) => position.categories.map((category) => category.avgCopies)), 0.01);
    return (
        <div className="ifh-panel">
            <div className="csr-panel-title"><strong>3-star sparks by position</strong><span>Expected copies per event</span></div>
            <div className="ifh-heatmap-scroll">
                <div className="ifh-heatmap ifh-spark-heatmap" style={{ gridTemplateColumns: `minmax(150px, 1fr) repeat(${categoryLabels.length}, 82px)` }}>
                    <div />
                    {categoryLabels.map((category) => <strong key={category.key}>{category.label}</strong>)}
                    {positions.map((position) => (
                        <div className="ifh-heatmap-row" key={position.position} style={{ display: "contents" }}>
                            <span>{position.label}</span>
                            {categoryLabels.map((category) => {
                                const value = position.categories.find((entry) => entry.key === category.key);
                                const avgCopies = value?.avgCopies ?? 0;
                                const samplesWithAny = value?.samplesWithAny ?? 0;
                                const copies = value?.copies ?? 0;
                                const appearanceRate = value?.appearanceRate ?? 0;
                                const tooltip = [
                                    `${position.label} / ${category.label}`,
                                    `${copies} total 3-star sparks`,
                                    `${samplesWithAny} of ${source.samples} events had at least one (${appearanceRate.toFixed(1)}%)`,
                                    `${avgCopies.toFixed(2)} expected copies per event`,
                                ].join("\n");
                                return (
                                    <i key={`${position.position}:${category.key}`} title={tooltip} style={{ background: `rgba(101,210,131,${0.08 + avgCopies / max * 0.82})` }}>
                                        {avgCopies ? avgCopies.toFixed(2) : "-"}
                                    </i>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function TopFactors({ source }: { source: SourceSummary }) {
    const max = Math.max(...source.topFactors.map((factor) => factor.avgCopies), 0.01);
    return (
        <div className="ifh-panel">
            <div className="csr-panel-title"><strong>Most observed factors</strong><span>Expected copies per event</span></div>
            <div className="ifh-factor-list">
                {source.topFactors.map((factor) => (
                    <div
                        key={factor.factorId}
                        className="ifh-factor-row"
                        title={`${factor.samplesWithAny} of ${source.samples} events included this factor (${factor.appearanceRate.toFixed(1)}%)\n${factor.copies} total observed copies`}
                    >
                        <span style={{ color: getFactorColor(factor.factorId) }}>{factorName(factor.factorId)}</span>
                        <div><i style={{ width: `${factor.avgCopies / max * 100}%` }} /></div>
                        <strong>{factor.avgCopies.toFixed(2)}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ShapePanel({ source }: { source: SourceSummary }) {
    return (
        <div className="ifh-panel ifh-shapes">
            <div className="csr-panel-title"><strong>Common event shapes</strong><span>Top observed layouts</span></div>
            {source.shapes.map((shape) => (
                <details key={shape.shape}>
                    <summary><strong>{shape.samples} samples</strong><span>{shape.percentage.toFixed(1)}%</span></summary>
                    <p>{shape.shape}</p>
                </details>
            ))}
        </div>
    );
}

function SourceSection({ source }: { source: SourceSummary }) {
    const resolvingStoryText = source.resolvingStories.length > 0
        ? source.resolvingStories.map((story) => `${story.storyId} (${story.samples})`).join(", ")
        : "No resolving story ids";
    const sourceStoryText = source.sourceStories.length > 0
        ? source.sourceStories.map((story) => `${story.storyId} (${story.samples})`).join(", ")
        : "No source story ids";
    return (
        <section className="srp-turn-section csr-research-section ifh-source-section">
            <div className="srp-turn-header">
                <div className="srp-turn-title-row">
                    <div>
                        <h2 className="srp-turn-title">{source.label}</h2>
                        <div className="srp-section-subtitle">
                            {source.samples} inheritance events from {source.contributors} contributors · resolving stories: {resolvingStoryText}
                        </div>
                    </div>
                    <div className="srp-section-meta" title={`Trigger source stories: ${sourceStoryText}`}>{source.averages.blueThreeStars.toFixed(2)} expected blue 3-stars</div>
                </div>
            </div>

            <div className="ifh-stats">
                <StatCard label="Total factors" value={source.averages.totalFactors.toFixed(2)} detail="expected per event" />
                <StatCard label="3-star factors" value={source.averages.totalThreeStars.toFixed(2)} detail="any factor type" />
                <StatCard label="Blue 3-stars" value={source.averages.blueThreeStars.toFixed(2)} detail="stat factors only" />
                <StatCard label="Parent blue 3-stars" value={source.averages.parentBlueThreeStars.toFixed(2)} detail="positions 10 and 20" />
                <StatCard label="Grandparent blue 3-stars" value={source.averages.grandparentBlueThreeStars.toFixed(2)} detail="positions 11/12/21/22" />
            </div>

            <div className="ifh-grid ifh-grid-three">
                <DistributionChart title="Blue 3-stars per event" data={source.distributions.blueThreeStars} samples={source.samples} />
                <DistributionChart title="Total 3-stars per event" data={source.distributions.totalThreeStars} samples={source.samples} />
                <DistributionChart title="Total factors per event" data={source.distributions.totalFactors} samples={source.samples} />
            </div>

            <div className="ifh-grid ifh-grid-two">
                <SlotHeatmap source={source} />
                <CategoryPanel source={source} />
            </div>

            <ThreeStarSparkPanel source={source} />

            <div className="ifh-grid ifh-grid-two">
                <TopFactors source={source} />
                <ShapePanel source={source} />
            </div>
        </section>
    );
}

export default function InheritanceFactorsPage() {
    const [summary, setSummary] = useState<InheritanceSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch("/api/inheritance-factors").then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<InheritanceSummary>;
            }),
            GameDataLoader.initialize(),
        ]).then(([data]) => setSummary(data))
            .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, []);

    const sources = useMemo(() => [...(summary?.sources ?? [])].sort((a, b) => a.eventId - b.eventId), [summary]);

    if (error) return <div className="csr-page"><div className="srp-turn-section">Unable to load inheritance factor data: {error}</div></div>;
    if (!summary) return <div className="csr-page"><div className="srp-turn-section">Loading inheritance factor data...</div></div>;

    return (
        <div className="csr-page ifh-page">
            <section className="srp-turn-section ifh-overview">
                <div className="srp-turn-title-row">
                    <div>
                        <h1 className="srp-turn-title">Inheritance Factor Research</h1>
                        <div className="srp-section-subtitle">Comparing inheritance outcomes by resolving event id; rows without an event id are ignored</div>
                    </div>
                    <div className="srp-section-meta">{summary.totals.samples} samples - {summary.totals.contributors} contributors</div>
                </div>
            </section>
            {sources.length > 0
                ? sources.map((source) => <SourceSection key={source.eventId} source={source} />)
                : <div className="srp-turn-section csr-empty">No inheritance factor observations have been collected yet.</div>}
        </div>
    );
}

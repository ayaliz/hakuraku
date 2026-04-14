import { useEffect, useState } from 'react';
import GameDataLoader from '../../data/GameDataLoader';
import './ShopRefreshPage.css';

interface ShopItem {
    id: number;
    name: string;
    icon: string;
    appearanceRate: number;
    avgCopies: number;
    batches: number;
}

interface RefreshSectionData {
    id: string;
    kind: 'scheduled' | 'race';
    label: string;
    n: number;
    itemCount: number;
    avgNewItems: number;
    items: ShopItem[];
    turns: number[];
    turn?: number;
}

interface ShopRefreshSummary {
    generatedAt: string;
    sourceFile: string;
    scheduledTurns: RefreshSectionData[];
    gradedRacePool: RefreshSectionData | null;
}

function iconSrc(icon: string) {
    return `${import.meta.env.BASE_URL}assets/mant/${icon}`;
}

function fallbackText(name: string) {
    return name.slice(0, 2).toUpperCase();
}

function formatAvgNewItems(value: number) {
    return `${value.toFixed(1)} avg new items`;
}

function xTickColor(pct: number) {
    if (pct === 0) {
        return '#9aa4b2';
    }
    if (pct === 25) {
        return '#65d283';
    }
    if (pct === 50) {
        return '#f3c969';
    }
    if (pct === 75) {
        return '#ff9f5a';
    }
    return '#ff6b6b';
}

function sectionTitle(section: RefreshSectionData) {
    return section.kind === 'scheduled'
        ? `Turn ${section.turn}`
        : section.label;
}

function sectionSubtitle(section: RefreshSectionData) {
    if (section.kind === 'scheduled') {
        return `${section.n} scheduled refresh samples`;
    }

    return `${section.n} graded race refresh samples`;
}

function ItemIcon({ icon, name, className }: { icon: string; name: string; className?: string }) {
    const [failed, setFailed] = useState(false);
    return (
        <div
            className={`${className ?? ''} ${failed ? 'srp-icon-fallback' : ''}`}
            data-fallback={fallbackText(name)}
        >
            {!failed && (
                <img
                    src={iconSrc(icon)}
                    alt={name}
                    loading="lazy"
                    onError={() => setFailed(true)}
                />
            )}
        </div>
    );
}

function ItemIconScatter({ icon, name }: { icon: string; name: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return null;
    }

    return (
        <img
            src={iconSrc(icon)}
            alt={name}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
}

function ScatterPlot({ items, n }: { items: ShopItem[]; n: number }) {
    const yMin = 0.95;
    const yMax = 1.55;
    const yRange = yMax - yMin;
    const maxAppearanceRate = Math.max(...items.map(item => item.appearanceRate), 0);
    const xAxisMax = Math.max(25, Math.min(100, Math.ceil(maxAppearanceRate / 25) * 25));
    const yTicks = [0.95, 1.05, 1.15, 1.25, 1.35, 1.45, 1.55].map(value => ({
        pct: ((value - yMin) / yRange) * 100,
        val: value,
    }));
    const xTicks = Array.from(
        { length: Math.floor(xAxisMax / 25) + 1 },
        (_, index) => index * 25,
    ).map(pct => ({
        pct,
        left: (pct / xAxisMax) * 100,
        label: `${pct}%`,
        color: xTickColor(pct),
    }));

    return (
        <div className="srp-scatter-panel">
            <div className="srp-scatter-head">
                <div className="srp-scatter-title">Spawn rate vs avg amount if spawned</div>
            </div>
            <div className="srp-scatter-shell">
                <div className="srp-scatter-y-label">Avg copies</div>
                <div className="srp-scatter-plot-wrap">
                    <div className="srp-scatter-plot">
                        <div className="srp-scatter-grid" />
                        {yTicks.map(tick => (
                            <div
                                key={tick.pct}
                                className="srp-scatter-y-tick"
                                style={{ bottom: `${tick.pct}%` }}
                            >
                                <span>{tick.val.toFixed(2)}</span>
                            </div>
                        ))}
                        <div className="srp-scatter-points">
                            {items.map(item => {
                                const left = Math.min(
                                    Math.max((item.appearanceRate / xAxisMax) * 100, 0),
                                    100,
                                );
                                const bottom = Math.min(
                                    Math.max(((item.avgCopies - yMin) / yRange) * 100, 0),
                                    100,
                                );
                                const tip = `${item.name} (item ${item.id})\nAppearance rate: ${item.appearanceRate}%\nAvg copies when present: ${item.avgCopies}\n${item.batches}/${n} batches`;
                                return (
                                    <div
                                        key={item.id}
                                        className="srp-scatter-point"
                                        style={{ left: `${left}%`, bottom: `${bottom}%` }}
                                        title={tip}
                                    >
                                        <ItemIconScatter icon={item.icon} name={item.name} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="srp-scatter-x-ticks">
                        {xTicks.map(tick => (
                            <div
                                key={tick.label}
                                className="srp-scatter-x-tick"
                                style={{ left: `${tick.left}%` }}
                            >
                                <span
                                    className="srp-scatter-x-tick-label"
                                    style={{
                                        color: tick.color,
                                        backgroundColor: `${tick.color}1a`,
                                        borderColor: `${tick.color}55`,
                                    }}
                                >
                                    {tick.label}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="srp-scatter-x-label">Appearance rate</div>
                </div>
            </div>
        </div>
    );
}

function ExactPanel({ items, n }: { items: ShopItem[]; n: number }) {
    const maxRate = Math.max(...items.map(item => item.appearanceRate), 1);
    return (
        <details className="srp-exact-panel">
            <summary className="srp-exact-summary">
                <span>Show exact values</span>
                <span className="srp-exact-meta">{items.length} items</span>
                <span className="srp-exact-toggle">open &gt;</span>
            </summary>
            <div className="srp-exact-body">
                <div className="srp-chart-grid">
                    {[...items].sort((a, b) => a.id - b.id).map(item => (
                        <div key={item.id} className="srp-chart-row">
                            <div className="srp-chart-row-label">
                                <ItemIcon
                                    icon={item.icon}
                                    name={item.name}
                                    className="srp-chart-icon"
                                />
                                <div className="srp-chart-copy">
                                    <div className="srp-chart-name">{item.name}</div>
                                    <div className="srp-chart-id">item {item.id}</div>
                                </div>
                            </div>
                            <div className="srp-chart-bar-wrap">
                                <div className="srp-chart-bar">
                                    <span style={{ width: `${(item.appearanceRate / maxRate) * 100}%` }} />
                                </div>
                            </div>
                            <div className="srp-chart-value">{item.appearanceRate}%</div>
                            <div className="srp-chart-meta">{item.batches}/{n} batches</div>
                            <div className="srp-chart-meta">avg {item.avgCopies.toFixed(2)} copies</div>
                        </div>
                    ))}
                </div>
            </div>
        </details>
    );
}

function RefreshSection({ section }: { section: RefreshSectionData }) {
    return (
        <section id={section.id} className="srp-turn-section">
            <div className="srp-turn-header">
                <div className="srp-turn-title-row">
                    <div>
                        <h2 className="srp-turn-title">{sectionTitle(section)}</h2>
                        <div className="srp-section-subtitle">{sectionSubtitle(section)}</div>
                    </div>
                    <div className="srp-section-meta">
                        {formatAvgNewItems(section.avgNewItems)} - {section.itemCount} items tracked
                    </div>
                </div>
            </div>

            <ScatterPlot items={section.items} n={section.n} />
            <ExactPanel items={section.items} n={section.n} />
        </section>
    );
}

export default function ShopRefreshPage() {
    const [summary, setSummary] = useState<ShopRefreshSummary | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadSummary() {
            try {
                await GameDataLoader.initialize();
                const data = GameDataLoader.shopRefreshData as ShopRefreshSummary;
                if (!cancelled) {
                    setSummary(data);
                }
            } catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error ? error.message : 'Failed to load shop data');
                }
            }
        }

        void loadSummary();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loadError) {
        return (
            <div className="srp-page">
                <div className="srp-turn-section">Unable to load shop refresh data: {loadError}</div>
            </div>
        );
    }

    if (!summary) {
        return (
            <div className="srp-page">
                <div className="srp-turn-section">Loading shop refresh data...</div>
            </div>
        );
    }

    const scheduledTurns = summary.scheduledTurns;
    const gradedRacePool = summary.gradedRacePool;
    const maxN = Math.max(...scheduledTurns.map(section => section.n), 1);
    return (
        <div className="srp-page">
            <div className="srp-turn-nav">
                <div className="srp-turn-nav-panel">
                    <div className="srp-turn-nav-head">
                        <span>Jump to a section</span>
                    </div>
                    <div className="srp-turn-chip-grid">
                        {scheduledTurns.map(section => (
                            <div
                                key={section.id}
                                className="srp-turn-chip"
                                onClick={() => {
                                    const el = document.getElementById(section.id);
                                    if (!el) {
                                        return;
                                    }

                                    const nav = document.querySelector('.srp-turn-nav') as HTMLElement | null;
                                    const offset = nav ? nav.offsetHeight : 0;
                                    const top = el.getBoundingClientRect().top + window.scrollY - offset - 8;
                                    window.scrollTo({ top, behavior: 'smooth' });
                                }}
                            >
                                <span className="srp-turn-chip-label">T{section.turn}</span>
                                <span className="srp-turn-chip-count">n={section.n}</span>
                                <span className="srp-turn-chip-bar">
                                    <span style={{ width: `${(section.n / maxN) * 100}%` }} />
                                </span>
                            </div>
                        ))}
                        {gradedRacePool && (
                            <div
                                key={gradedRacePool.id}
                                className="srp-turn-chip"
                                onClick={() => {
                                    const el = document.getElementById(gradedRacePool.id);
                                    if (!el) {
                                        return;
                                    }

                                    const nav = document.querySelector('.srp-turn-nav') as HTMLElement | null;
                                    const offset = nav ? nav.offsetHeight : 0;
                                    const top = el.getBoundingClientRect().top + window.scrollY - offset - 8;
                                    window.scrollTo({ top, behavior: 'smooth' });
                                }}
                            >
                                <span className="srp-turn-chip-label">Race</span>
                                <span className="srp-turn-chip-count">n={gradedRacePool.n}</span>
                                <span className="srp-turn-chip-bar">
                                    <span />
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="srp-turn-sections">
                {scheduledTurns.map(section => (
                    <RefreshSection key={section.id} section={section} />
                ))}
            </div>

            {gradedRacePool && (
                <section className="srp-race-catalog">
                    <div className="srp-race-catalog-head">
                        <p className="srp-page-subtitle">
                            All graded race reward refreshes are aggregated into this shared pool.
                        </p>
                    </div>
                    <RefreshSection section={gradedRacePool} />
                </section>
            )}
        </div>
    );
}

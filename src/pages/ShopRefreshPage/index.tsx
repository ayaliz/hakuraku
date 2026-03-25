import { useEffect, useState } from 'react';
import './ShopRefreshPage.css';

interface ShopItem {
    id: number;
    name: string;
    icon: string;
    appearanceRate: number;
    avgCopies: number;
    batches: number;
}

interface PatternItem {
    icon: string;
    name: string;
    rate: string;
}

interface TurnPattern {
    equation: string;
    items: PatternItem[];
}

interface TurnData {
    turn: number;
    n: number;
    itemCount: number;
    patterns: TurnPattern[];
    items: ShopItem[];
}

const SHOP_DATA_URL = `${import.meta.env.BASE_URL}data/shop-refresh-data.json`;

function iconSrc(icon: string) {
    return `${import.meta.env.BASE_URL}assets/mant/${icon}`;
}

function fallbackText(name: string) {
    return name.slice(0, 2).toUpperCase();
}

// ── Icon component with fallback ─────────────────────────────
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

// ── Scatter plot ─────────────────────────────────────────────
function ScatterPlot({ items, n }: { items: ShopItem[]; n: number }) {
    const yMin = 0.95;
    const yMax = 1.55;
    const yRange = yMax - yMin;
    const yTicks = [0.95, 1.05, 1.15, 1.25, 1.35, 1.45, 1.55].map(v => ({
        pct: ((v - yMin) / yRange) * 100,
        val: v,
    }));
    // X ticks
    const xTicks = [0, 25, 50, 75, 100].map(pct => ({ pct, label: `${pct}%` }));

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
                        {yTicks.map(t => (
                            <div
                                key={t.pct}
                                className="srp-scatter-y-tick"
                                style={{ bottom: `${t.pct}%` }}
                            >
                                <span>{t.val.toFixed(2)}</span>
                            </div>
                        ))}
                        <div className="srp-scatter-points">
                            {items.map(item => {
                                const left = Math.min(Math.max(item.appearanceRate, 0), 100);
                                const bottom = Math.min(Math.max(((item.avgCopies - yMin) / yRange) * 100, 0), 100);
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
                        {xTicks.map(t => (
                            <div
                                key={t.pct}
                                className="srp-scatter-x-tick"
                                style={{ left: `${t.pct}%` }}
                            >
                                {t.label}
                            </div>
                        ))}
                    </div>
                    <div className="srp-scatter-x-label">Appearance rate</div>
                </div>
            </div>
        </div>
    );
}

// Inline fallback for scatter points (no useState overhead, uses CSS)
function ItemIconScatter({ icon, name }: { icon: string; name: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return (
        <img
            src={iconSrc(icon)}
            alt={name}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
}

// ── Exact values panel ───────────────────────────────────────
function ExactPanel({ items, n }: { items: ShopItem[]; n: number }) {
    const maxRate = Math.max(...items.map(i => i.appearanceRate), 1);
    return (
        <details className="srp-exact-panel">
            <summary className="srp-exact-summary">
                <span>Show exact values</span>
                <span className="srp-exact-meta">{items.length} items</span>
                <span className="srp-exact-toggle">open ▸</span>
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

// ── Turn section ─────────────────────────────────────────────
function TurnSection({ turn }: { turn: TurnData }) {
    return (
        <section id={`turn-${turn.turn}`} className="srp-turn-section">
            <div className="srp-turn-header">
                <div className="srp-turn-title-row">
                    <h2 className="srp-turn-title">Turn {turn.turn}</h2>
                </div>
            </div>

            <ScatterPlot items={turn.items} n={turn.n} />
            <ExactPanel items={turn.items} n={turn.n} />
        </section>
    );
}

// ── Page ─────────────────────────────────────────────────────
export default function ShopRefreshPage() {
    const [turns, setTurns] = useState<TurnData[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadTurns() {
            try {
                const response = await fetch(SHOP_DATA_URL);
                if (!response.ok) {
                    throw new Error(`Failed to load shop data (${response.status})`);
                }
                const data = await response.json() as TurnData[];
                if (!cancelled) {
                    setTurns(data);
                }
            } catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error ? error.message : 'Failed to load shop data');
                }
            }
        }

        void loadTurns();
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

    if (!turns) {
        return (
            <div className="srp-page">
                <div className="srp-turn-section">Loading shop refresh data...</div>
            </div>
        );
    }

    const maxN = Math.max(...turns.map(t => t.n), 1);

    return (
        <div className="srp-page">
            {/* Turn nav */}
            <div className="srp-turn-nav">
                <div className="srp-turn-nav-panel">
                    <div className="srp-turn-nav-head">
                        <span>Jump to a turn</span>
                    </div>
                    <div className="srp-turn-chip-grid">
                        {turns.map(t => (
                            <div
                                key={t.turn}
                                className="srp-turn-chip"
                                onClick={() => {
                                    const el = document.getElementById(`turn-${t.turn}`);
                                    if (!el) return;
                                    const nav = document.querySelector('.srp-turn-nav') as HTMLElement | null;
                                    const offset = nav ? nav.offsetHeight : 0;
                                    const top = el.getBoundingClientRect().top + window.scrollY - offset - 8;
                                    window.scrollTo({ top, behavior: 'smooth' });
                                }}
                            >
                                <span className="srp-turn-chip-label">T{t.turn}</span>
                                <span className="srp-turn-chip-count">n={t.n}</span>
                                <span className="srp-turn-chip-bar">
                                    <span style={{ width: `${(t.n / maxN) * 100}%` }} />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Turn sections */}
            <div className="srp-turn-sections">
                {turns.map(t => <TurnSection key={t.turn} turn={t} />)}
            </div>
        </div>
    );
}

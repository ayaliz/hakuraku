import { useEffect, useMemo, useState } from "react";
import GameDataLoader from "../../data/GameDataLoader";
import "./ShopRefreshPage.css";
import "./ShopRefreshResearch.css";

type ItemStat = {
    itemId: number;
    batches: number;
    appearanceRate: number;
    avgCopies: number;
    avgPrice: number;
    maxCopies: number;
};

type ShopGroup = {
    kind: string;
    groupId: number | string;
    event: string | null;
    raceGrade: number | null;
    samples: number;
    avgItems: number;
    itemCountDistribution: Array<{ itemCount: number; samples: number }>;
    items: ItemStat[];
};

type ShopSummary = {
    totals: { scheduledSamples: number; raceSamples: number };
    scheduledShops: ShopGroup[];
    raceGrades: ShopGroup[];
};

type ItemMeta = { name: string; icon: string };
type CombinedGroup = { samples: number; avgItems: number; itemCountDistribution: Array<{ itemCount: number; samples: number }>; items: ItemStat[] };

const GRADE_LABELS: Record<string, string> = {
    "100": "G1",
    "200": "G2",
    "300": "G3",
    "400": "OP",
    "700": "Pre-OP",
    "900": "Maiden Race",
};

const ETSUKO_ELATED = "Etsuko's Elated Coverage";
const ETSUKO_EXHAUSTIVE = "Etsuko's Exhaustive Coverage";
const RESULT_ORDER = ["Victory", "Solid Showing", "Defeat", ETSUKO_ELATED, ETSUKO_EXHAUSTIVE];
const HEATMAP_RESULT_ORDER = ["Victory", ETSUKO_ELATED, "Solid Showing", "Defeat", ETSUKO_EXHAUSTIVE];
const GRADE_ORDER = ["G1", "G2", "G3", "OP", "Pre-OP", "Maiden Race"];

function resultCategory(event: string | null) {
    if (event === "Victory!") return "Victory";
    return event ?? "Unknown";
}

function resultLabel(result: string) {
    if (result === ETSUKO_ELATED) return "Etsuko Elated";
    if (result === ETSUKO_EXHAUSTIVE) return "Etsuko Exhaustive";
    return result;
}

function gradeCategory(groupId: number | string) {
    return GRADE_LABELS[String(groupId)] ?? `Grade ${groupId}`;
}

function scheduledTurn(shopId: string) {
    const numericId = Number(shopId);
    return Number.isFinite(numericId) ? numericId * 6 + 6 : shopId;
}

function combineGroups(groups: ShopGroup[]): CombinedGroup {
    const samples = groups.reduce((sum, group) => sum + group.samples, 0);
    const totals = new Map<number, { batches: number; copies: number; priceTotal: number; maxCopies: number }>();
    const itemCounts = new Map<number, number>();
    for (const group of groups) {
        for (const entry of group.itemCountDistribution ?? []) {
            itemCounts.set(entry.itemCount, (itemCounts.get(entry.itemCount) ?? 0) + entry.samples);
        }
        for (const item of group.items) {
            const current = totals.get(item.itemId) ?? { batches: 0, copies: 0, priceTotal: 0, maxCopies: 0 };
            const copies = item.avgCopies * item.batches;
            current.batches += item.batches;
            current.copies += copies;
            current.priceTotal += item.avgPrice * copies;
            current.maxCopies = Math.max(current.maxCopies, item.maxCopies ?? 0);
            totals.set(item.itemId, current);
        }
    }
    return {
        samples,
        avgItems: samples ? groups.reduce((sum, group) => sum + group.avgItems * group.samples, 0) / samples : 0,
        itemCountDistribution: [...itemCounts.entries()].map(([itemCount, countSamples]) => ({ itemCount, samples: countSamples })).sort((a, b) => a.itemCount - b.itemCount),
        items: [...totals.entries()].map(([itemId, item]) => ({
            itemId,
            batches: item.batches,
            appearanceRate: samples ? item.batches / samples * 100 : 0,
            avgCopies: item.batches ? item.copies / item.batches : 0,
            avgPrice: item.copies ? item.priceTotal / item.copies : 0,
            maxCopies: item.maxCopies,
        })),
    };
}

function iconSrc(icon: string) {
    return `${import.meta.env.BASE_URL}assets/mant/${icon}`;
}

function ItemIcon({ item, meta, scatter = false }: { item: ItemStat; meta?: ItemMeta; scatter?: boolean }) {
    const [failed, setFailed] = useState(false);
    const name = meta?.name ?? `Item ${item.itemId}`;
    return (
        <div className={`${scatter ? "srp-scatter-point-icon" : "srp-chart-icon"} ${failed || !meta?.icon ? "srp-icon-fallback" : ""}`} data-fallback={name.slice(0, 2).toUpperCase()}>
            {!failed && meta?.icon && <img src={iconSrc(meta.icon)} alt={name} loading="lazy" onError={() => setFailed(true)} />}
        </div>
    );
}

function ExpectedValueChart({ data, itemMeta }: { data: CombinedGroup; itemMeta: Map<number, ItemMeta> }) {
    const items = [...data.items].sort((a, b) => b.appearanceRate * b.avgCopies - a.appearanceRate * a.avgCopies);
    const maxExpected = Math.max(...items.map((item) => item.appearanceRate / 100 * item.avgCopies), 0.01);
    return (
        <div className="csr-value-panel">
            <div className="csr-panel-title"><strong>Expected copies per refresh</strong><span>Appearance rate x average copies when spawned</span></div>
            <div className="csr-value-list">
                {items.map((item) => {
                    const expected = item.appearanceRate / 100 * item.avgCopies;
                    const meta = itemMeta.get(item.itemId);
                    return <div key={item.itemId} className="csr-value-row"><div className="csr-value-label"><ItemIcon item={item} meta={meta} /><span>{meta?.name ?? `Item ${item.itemId}`}</span></div><div className="csr-value-track"><i style={{ width: `${expected / maxExpected * 100}%` }} /></div><strong>{expected.toFixed(3)}</strong><em>Max {item.maxCopies}</em></div>;
                })}
            </div>
        </div>
    );
}

function CountDistribution({ data }: { data: CombinedGroup }) {
    const max = Math.max(...data.itemCountDistribution.map((entry) => entry.samples), 1);
    return (
        <div className="csr-count-panel">
            <div className="csr-panel-title"><strong>Number of items per refresh</strong></div>
            <div className="csr-count-chart" style={{ gridTemplateColumns: `repeat(${data.itemCountDistribution.length}, minmax(0, 1fr))` }}>
                {data.itemCountDistribution.map((entry) => {
                    const percentage = data.samples ? entry.samples / data.samples * 100 : 0;
                    const tooltip = `${entry.itemCount} items appeared in ${entry.samples} of ${data.samples} refreshes (${percentage.toFixed(1)}%)`;
                    return <div key={entry.itemCount} className="csr-count-column" title={tooltip}><div className="csr-count-bar"><i style={{ height: `${entry.samples / max * 100}%` }} /></div><strong>{entry.itemCount}</strong></div>;
                })}
            </div>
        </div>
    );
}

function ExpectedValueHeatmap({ groups, labels, title, subtitle, itemMeta }: { groups: ShopGroup[]; labels: string[]; title: string; subtitle: string; itemMeta: Map<number, ItemMeta> }) {
    const itemIds = [...new Set(groups.flatMap((group) => group.items.map((item) => item.itemId)))];
    const values = itemIds.flatMap((itemId) => groups.map((group) => {
        const item = group.items.find((entry) => entry.itemId === itemId);
        return item ? item.appearanceRate / 100 * item.avgCopies : 0;
    }));
    const max = Math.max(...values, .01);
    return (
        <div className="csr-heatmap-panel">
            <div className="csr-panel-title"><strong>{title}</strong><span>{subtitle}</span></div>
            <div className="csr-heatmap-scroll"><div className="csr-heatmap" style={{ gridTemplateColumns: `minmax(210px, 1fr) repeat(${groups.length}, 52px)` }}>
                <div /><>{labels.map((label) => <strong key={label}>{label}</strong>)}</>
                {itemIds.map((itemId) => <div className="csr-heatmap-row" key={itemId} style={{ display: "contents" }}><span className="csr-heatmap-item"><ItemIcon item={{ itemId, batches: 0, appearanceRate: 0, avgCopies: 0, avgPrice: 0, maxCopies: 0 }} meta={itemMeta.get(itemId)} /><b>{itemMeta.get(itemId)?.name ?? `Item ${itemId}`}</b></span>{groups.map((group, index) => {
                    const item = group.items.find((entry) => entry.itemId === itemId);
                    const value = item ? item.appearanceRate / 100 * item.avgCopies : 0;
                    const batches = item?.batches ?? 0;
                    const appearanceRate = group.samples ? batches / group.samples * 100 : 0;
                    const tooltip = [
                        `${batches} of ${group.samples} refreshes contained this item (${appearanceRate.toFixed(1)}%)`,
                        `${value.toFixed(3)} expected copies per refresh`,
                        item ? `${item.avgCopies.toFixed(2)} average copies when spawned` : null,
                        item ? `Max ${item.maxCopies} copies in one refresh` : null,
                    ].filter(Boolean).join("\n");
                    return <i key={`${labels[index]}:${group.groupId}`} title={tooltip} style={{ background: `rgba(101,210,131,${.06 + value / max * .84})` }}>{value ? value.toFixed(2) : "—"}</i>;
                })}</div>)}
            </div></div>
        </div>
    );
}

function ResearchGraph({ title, subtitle, data, itemMeta, controls, heatmap }: { title: string; subtitle: string; data: CombinedGroup; itemMeta: Map<number, ItemMeta>; controls: React.ReactNode; heatmap?: React.ReactNode }) {
    return (
        <section className="srp-turn-section csr-research-section">
            <div className="srp-turn-header">
                <div className="srp-turn-title-row"><div><h2 className="srp-turn-title">{title}</h2><div className="srp-section-subtitle">{subtitle}</div></div><div className="srp-section-meta">{data.avgItems.toFixed(1)} avg new items - {data.items.length} items tracked</div></div>
                {controls}
            </div>
            {data.samples ? <><div className="csr-dashboard"><ExpectedValueChart data={data} itemMeta={itemMeta} /><CountDistribution data={data} /></div>{heatmap}</> : <div className="csr-empty">No observations match the selected filters.</div>}
        </section>
    );
}

function ToggleButtons({ values, selected, onToggle, exclusive = false }: { values: string[]; selected: Set<string>; onToggle: (value: string) => void; exclusive?: boolean }) {
    return <div className="csr-filter-row">{values.map((value) => <button key={value} className={selected.has(value) ? "active" : ""} aria-pressed={selected.has(value)} onClick={() => onToggle(value)}>{exclusive ? `Turn ${scheduledTurn(value)}` : value}</button>)}</div>;
}

export default function ShopRefreshPage() {
    const [summary, setSummary] = useState<ShopSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [itemMeta, setItemMeta] = useState(new Map<number, ItemMeta>());
    const [scheduled, setScheduled] = useState<string | null>(null);
    const [results, setResults] = useState(new Set(RESULT_ORDER));
    const [grades, setGrades] = useState(new Set(GRADE_ORDER));

    useEffect(() => {
        Promise.all([
            fetch("/api/shop-refresh").then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<ShopSummary>;
            }),
            GameDataLoader.initialize().then(() => {
                const map = new Map<number, ItemMeta>();
                const staticData = GameDataLoader.shopRefreshData as { scheduledTurns?: Array<{ items?: Array<{ id: number; name: string; icon: string }> }>; gradedRacePool?: { items?: Array<{ id: number; name: string; icon: string }> } };
                for (const section of [...(staticData.scheduledTurns ?? []), ...(staticData.gradedRacePool ? [staticData.gradedRacePool] : [])]) {
                    for (const item of section.items ?? []) map.set(item.id, { name: item.name, icon: item.icon });
                }
                return map;
            }),
        ]).then(([data, meta]) => {
            setSummary(data);
            setItemMeta(meta);
            setScheduled(data.scheduledShops[0] ? String(data.scheduledShops[0].groupId) : null);
        }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    }, []);

    const scheduledOptions = useMemo(
        () => summary?.scheduledShops
            .map((group) => String(group.groupId))
            .sort((a, b) => Number(a) - Number(b)) ?? [],
        [summary],
    );
    const scheduledData = useMemo(() => combineGroups(summary?.scheduledShops.filter((group) => String(group.groupId) === scheduled) ?? []), [summary, scheduled]);
    const raceData = useMemo(() => combineGroups(summary?.raceGrades.filter((group) => results.has(resultCategory(group.event)) && grades.has(gradeCategory(group.groupId))) ?? []), [summary, results, grades]);
    const scheduledHeatmapGroups = useMemo(() => [...(summary?.scheduledShops ?? [])].sort((a, b) => Number(a.groupId) - Number(b.groupId)), [summary]);
    const buildRaceHeatmap = (heatmapGrades: string[]) => {
        const columns = HEATMAP_RESULT_ORDER.flatMap((result) => heatmapGrades.map((grade) => ({ grade, result })));
        return {
            labels: columns.map(({ grade, result }) => `${grade} ${resultLabel(result)}`),
            groups: columns.map(({ grade, result }) => combineGroups(summary?.raceGrades.filter((group) => gradeCategory(group.groupId) === grade && resultCategory(group.event) === result) ?? []) as ShopGroup),
        };
    };
    const gradedRaceHeatmap = useMemo(() => buildRaceHeatmap(["G1", "G2", "G3"]), [summary]);
    const otherRaceHeatmap = useMemo(() => buildRaceHeatmap(["OP", "Pre-OP", "Maiden Race"]), [summary]);
    const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (value: string) => setter((current) => {
        const next = new Set(current);
        if (next.has(value)) next.delete(value); else next.add(value);
        return next;
    });

    if (error) return <div className="csr-page"><div className="srp-turn-section">Unable to load shop refresh data: {error}</div></div>;
    if (!summary) return <div className="csr-page"><div className="srp-turn-section">Loading shop refresh data...</div></div>;

    return (
        <div className="csr-page">
            <div className="csr-graphs">
                <ResearchGraph title="Scheduled Refreshes" subtitle={`${scheduledData.samples} samples for turn ${scheduled ? scheduledTurn(scheduled) : "-"}`} data={scheduledData} itemMeta={itemMeta} controls={<ToggleButtons values={scheduledOptions} selected={new Set(scheduled ? [scheduled] : [])} onToggle={setScheduled} exclusive />} heatmap={<ExpectedValueHeatmap groups={scheduledHeatmapGroups} labels={scheduledHeatmapGroups.map((group) => `T${scheduledTurn(String(group.groupId))}`)} title="Expected copies by scheduled turn" subtitle="Use this to spot changes in the shop pool over time" itemMeta={itemMeta} />} />
                <ResearchGraph title="Race Refreshes" subtitle={`${raceData.samples} samples across the selected results and grades`} data={raceData} itemMeta={itemMeta} controls={<div className="csr-filter-groups"><div><span>Results</span><ToggleButtons values={RESULT_ORDER} selected={results} onToggle={toggle(setResults)} /></div><div><span>Race grades</span><ToggleButtons values={GRADE_ORDER} selected={grades} onToggle={toggle(setGrades)} /></div></div>} heatmap={<><ExpectedValueHeatmap groups={gradedRaceHeatmap.groups} labels={gradedRaceHeatmap.labels} title="Expected copies (graded)" subtitle="G1, G2, and G3 pools split by result event" itemMeta={itemMeta} /><ExpectedValueHeatmap groups={otherRaceHeatmap.groups} labels={otherRaceHeatmap.labels} title="Expected copies (other)" subtitle="OP, Pre-OP, and Maiden Race pools split by result event" itemMeta={itemMeta} /></>} />
            </div>
        </div>
    );
}

import React, { useMemo } from "react";
import "./UmaLogsPage.css";

interface HistogramProps {
    values: number[];
    title: string;
    formatX: (v: number) => string;
    xAxisLabel: string;
    barColor?: string;
    tooltipUnit?: string;
    headerRight?: React.ReactNode;
}

function niceStep(range: number): number {
    const raw = range / 20;
    for (const s of [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
        if (raw <= s) return s;
    }
    return 2000;
}

const PAD = { top: 16, right: 16, bottom: 44, left: 36 };
const VIEW_W = 620;
const VIEW_H = 200;
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const Histogram: React.FC<HistogramProps> = ({
    values,
    title,
    formatX,
    xAxisLabel,
    barColor = "#4299e1",
    tooltipUnit = "entry",
    headerRight,
}) => {
    const { bins, step, mean, median } = useMemo(() => {
        if (values.length === 0) return { bins: [], step: 1, mean: 0, median: 0 };

        const sorted = [...values].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const step = niceStep(Math.max(max - min, 0.5));

        const binStart = Math.floor(min / step) * step;
        const numBins = Math.ceil((max - binStart) / step) + 1;

        const counts = new Array<number>(numBins).fill(0);
        for (const v of sorted) {
            const idx = Math.min(Math.floor((v - binStart) / step), numBins - 1);
            counts[idx]++;
        }

        const bins = counts.map((count, i) => ({ start: binStart + i * step, count }));

        const sum = sorted.reduce((a, b) => a + b, 0);
        const mean = sum / sorted.length;
        const mid = Math.floor(sorted.length / 2);
        const median =
            sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];

        return { bins, step, mean, median };
    }, [values]);

    if (bins.length === 0) return null;

    const maxCount = Math.max(...bins.map((b) => b.count));
    const totalBins = bins.length;
    const barW = PLOT_W / totalBins;

    const xOf = (v: number) =>
        PAD.left + ((v - bins[0].start) / (step * totalBins)) * PLOT_W;
    const yOf = (count: number) =>
        PAD.top + PLOT_H - (count / maxCount) * PLOT_H;

    const labelEvery = Math.max(1, Math.round(totalBins / 6));
    const labelIndices = bins
        .map((_, i) => i)
        .filter((i) => i % labelEvery === 0 || i === totalBins - 1);

    const yGridCounts = [0, Math.round(maxCount / 2), maxCount];

    const meanX = xOf(mean);
    const medianX = xOf(median);
    const meanLabelX = Math.min(meanX + 3, PAD.left + PLOT_W - 28);
    const medianLabelX = Math.min(medianX + 3, PAD.left + PLOT_W - 36);

    return (
        <div className="uma-histogram">
            <div className="histogram-header">
                <span className="histogram-title">{title}</span>
                <span className="histogram-subtitle">
                    mean {formatX(mean)} · median {formatX(median)}
                </span>
                {headerRight && (
                    <span className="histogram-header-right">{headerRight}</span>
                )}
            </div>

            <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="histogram-svg">
                {yGridCounts.map((c) => {
                    const y = yOf(c);
                    return (
                        <g key={c}>
                            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y} y2={y} stroke="#2d3748" strokeWidth={1} />
                            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fill="#718096" fontSize={10}>{c}</text>
                        </g>
                    );
                })}

                {bins.map((bin, i) => {
                    const x = PAD.left + i * barW;
                    const bh = (bin.count / maxCount) * PLOT_H;
                    const y = PAD.top + PLOT_H - bh;
                    return (
                        <rect key={i} x={x + 0.5} y={y} width={Math.max(barW - 1, 1)} height={bh} fill={barColor} opacity={0.8}>
                            <title>
                                {formatX(bin.start)}–{formatX(bin.start + step)}: {bin.count} {tooltipUnit}{bin.count !== 1 ? "s" : ""}
                            </title>
                        </rect>
                    );
                })}

                <line x1={meanX} x2={meanX} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#f6ad55" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={meanLabelX} y={PAD.top + 10} fill="#f6ad55" fontSize={10}>mean</text>

                <line x1={medianX} x2={medianX} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#9f7aea" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={medianLabelX} y={PAD.top + 22} fill="#9f7aea" fontSize={10}>median</text>

                <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="#4a5568" strokeWidth={1} />

                {labelIndices.map((i) => (
                    <text key={i} x={PAD.left + (i + 0.5) * barW} y={PAD.top + PLOT_H + 14} textAnchor="middle" fill="#718096" fontSize={10}>
                        {formatX(bins[i].start)}
                    </text>
                ))}

                <text x={PAD.left + PLOT_W / 2} y={VIEW_H - 2} textAnchor="middle" fill="#4a5568" fontSize={10}>
                    {xAxisLabel}
                </text>
            </svg>
        </div>
    );
};

export default Histogram;

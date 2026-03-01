import React, { useMemo } from "react";

interface WinTimeHistogramProps {
    winTimes: number[]; // seconds (finishTime of race winners)
}

// Format seconds as M:SS.ss for axis labels
function fmtTime(t: number): string {
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

// Pick a bin step that targets ~20 bins
function niceStep(range: number): number {
    const raw = range / 20;
    for (const s of [0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0]) {
        if (raw <= s) return s;
    }
    return 10;
}

const PAD = { top: 16, right: 16, bottom: 44, left: 36 };
const VIEW_W = 620;
const VIEW_H = 200;
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const WinTimeHistogram: React.FC<WinTimeHistogramProps> = ({ winTimes }) => {
    const { bins, step, mean, median } = useMemo(() => {
        if (winTimes.length === 0) return { bins: [], step: 1, mean: 0, median: 0 };

        const sorted = [...winTimes].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const range = max - min;
        const step = niceStep(Math.max(range, 0.5));

        const binStart = Math.floor(min / step) * step;
        const numBins = Math.ceil((max - binStart) / step) + 1;

        const counts = new Array<number>(numBins).fill(0);
        for (const t of sorted) {
            const idx = Math.min(Math.floor((t - binStart) / step), numBins - 1);
            counts[idx]++;
        }

        const bins = counts.map((count, i) => ({
            start: binStart + i * step,
            count,
        }));

        const sum = sorted.reduce((a, b) => a + b, 0);
        const mean = sum / sorted.length;
        const mid = Math.floor(sorted.length / 2);
        const median =
            sorted.length % 2 === 0
                ? (sorted[mid - 1] + sorted[mid]) / 2
                : sorted[mid];

        return { bins, step, mean, median };
    }, [winTimes]);

    if (bins.length === 0 || winTimes.length === 0) return null;

    const maxCount = Math.max(...bins.map((b) => b.count));
    const totalBins = bins.length;
    const barW = PLOT_W / totalBins;

    // x pixel for a time value
    const xOf = (t: number) =>
        PAD.left + ((t - bins[0].start) / (step * totalBins)) * PLOT_W;

    // y pixel for a count
    const yOf = (count: number) =>
        PAD.top + PLOT_H - (count / maxCount) * PLOT_H;

    // x-axis label ticks — target ~6 labels
    const labelEvery = Math.max(1, Math.round(totalBins / 6));
    const labelIndices = bins
        .map((_, i) => i)
        .filter((i) => i % labelEvery === 0 || i === totalBins - 1);

    // y-axis grid lines at 0, 50%, 100%
    const yGridCounts = [0, Math.round(maxCount / 2), maxCount];

    return (
        <div style={{ marginBottom: "20px" }}>
            <div
                style={{
                    fontSize: "13px",
                    fontWeight: "bold",
                    color: "#a0aec0",
                    marginBottom: "8px",
                }}
            >
                Winning Time Distribution
                <span
                    style={{
                        marginLeft: "12px",
                        fontWeight: "normal",
                        fontSize: "12px",
                        color: "#718096",
                    }}
                >
                    n={winTimes.length} · mean {fmtTime(mean)} · median {fmtTime(median)}
                </span>
            </div>

            <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                style={{ width: "100%", maxWidth: VIEW_W, display: "block" }}
            >
                {/* y grid lines */}
                {yGridCounts.map((c) => {
                    const y = yOf(c);
                    return (
                        <g key={c}>
                            <line
                                x1={PAD.left}
                                x2={PAD.left + PLOT_W}
                                y1={y}
                                y2={y}
                                stroke="#2d3748"
                                strokeWidth={1}
                            />
                            <text
                                x={PAD.left - 4}
                                y={y + 4}
                                textAnchor="end"
                                fill="#718096"
                                fontSize={10}
                            >
                                {c}
                            </text>
                        </g>
                    );
                })}

                {/* bars */}
                {bins.map((bin, i) => {
                    const x = PAD.left + i * barW;
                    const bh = (bin.count / maxCount) * PLOT_H;
                    const y = PAD.top + PLOT_H - bh;
                    return (
                        <rect
                            key={i}
                            x={x + 0.5}
                            y={y}
                            width={Math.max(barW - 1, 1)}
                            height={bh}
                            fill="#4299e1"
                            opacity={0.8}
                        >
                            <title>
                                {fmtTime(bin.start)}–{fmtTime(bin.start + step)}: {bin.count} race
                                {bin.count !== 1 ? "s" : ""}
                            </title>
                        </rect>
                    );
                })}

                {/* mean line */}
                <line
                    x1={xOf(mean)}
                    x2={xOf(mean)}
                    y1={PAD.top}
                    y2={PAD.top + PLOT_H}
                    stroke="#f6ad55"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                />
                <text
                    x={xOf(mean) + 3}
                    y={PAD.top + 10}
                    fill="#f6ad55"
                    fontSize={10}
                >
                    mean
                </text>

                {/* median line */}
                <line
                    x1={xOf(median)}
                    x2={xOf(median)}
                    y1={PAD.top}
                    y2={PAD.top + PLOT_H}
                    stroke="#9f7aea"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                />
                <text
                    x={xOf(median) + 3}
                    y={PAD.top + 22}
                    fill="#9f7aea"
                    fontSize={10}
                >
                    median
                </text>

                {/* x axis baseline */}
                <line
                    x1={PAD.left}
                    x2={PAD.left + PLOT_W}
                    y1={PAD.top + PLOT_H}
                    y2={PAD.top + PLOT_H}
                    stroke="#4a5568"
                    strokeWidth={1}
                />

                {/* x axis labels */}
                {labelIndices.map((i) => {
                    const x = PAD.left + (i + 0.5) * barW;
                    return (
                        <text
                            key={i}
                            x={x}
                            y={PAD.top + PLOT_H + 14}
                            textAnchor="middle"
                            fill="#718096"
                            fontSize={10}
                        >
                            {fmtTime(bins[i].start)}
                        </text>
                    );
                })}

                {/* x axis title */}
                <text
                    x={PAD.left + PLOT_W / 2}
                    y={VIEW_H - 2}
                    textAnchor="middle"
                    fill="#4a5568"
                    fontSize={10}
                >
                    Finish time (M:SS.ss)
                </text>
            </svg>
        </div>
    );
};

export default WinTimeHistogram;

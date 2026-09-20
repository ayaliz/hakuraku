export function compositionRowCount(overperformers: number, underperformers: number): number {
    return overperformers >= 10 ? overperformers
        : underperformers >= 10 ? 10 : Math.max(overperformers, underperformers);
}

const GROUND_CONDITION_LABELS: Record<number, string> = {
    1: 'Firm',
    2: 'Good',
    3: 'Soft',
    4: 'Heavy',
};

export function getGroundConditionLabel(value: number | undefined): string {
    if (value === undefined || value === null || value === 0) return 'Unknown ground';
    return GROUND_CONDITION_LABELS[value] ?? String(value);
}

/**
 * Translate older simulator metadata into the terms shown by the game: condition
 * code 1 is "Firm", and the player-facing name for motivation is "mood".
 */
export function formatInternalGroundConditionSummary(value: string): string {
    return value
        .replace(/\bGood ground\b/g, `${getGroundConditionLabel(1)} ground`)
        .replace(/\bmotivation\b/gi, 'mood');
}

export function normalizeRaceConditionMetadata<T>(value: T): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    const snapshotId = typeof record.snapshotId === 'string' ? record.snapshotId : '';
    const cmId = typeof record.cmId === 'string' ? record.cmId : '';
    const meta = record.meta;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return value;
    const metadata = meta as Record<string, unknown>;
    const isCm19 = cmId.toLowerCase() === 'cm19' || /^cm19(?:$|[-_.])/i.test(snapshotId);
    const isCm17 = cmId.toLowerCase() === 'cm17' || /^cm17(?:$|[-_.])/i.test(snapshotId);
    const isCm = /^cm\d+/i.test(cmId) || /^cm\d+/i.test(snapshotId);
    const conditions = isCm19 && typeof metadata.conditions === 'string'
        ? formatInternalGroundConditionSummary(metadata.conditions)
        : metadata.conditions;
    const sourceCourse = metadata.course;
    let course = sourceCourse;
    if (typeof sourceCourse === 'string' && isCm) {
        let normalizedCourse = sourceCourse;
        if (isCm17) normalizedCourse = normalizedCourse.replace(/\bTeio Sho\b/g, 'Ooi');
        course = normalizedCourse.replace(/\s*·\s*G1\s*$/i, '');
    }
    if (conditions === metadata.conditions && course === metadata.course) return value;
    const updates: Record<string, unknown> = {};
    if (conditions !== metadata.conditions) updates.conditions = conditions;
    if (course !== metadata.course) updates.course = course;
    return {
        ...record,
        meta: { ...metadata, ...updates },
    } as T;
}

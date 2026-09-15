export type SkillNameEntry = {
    id: number;
    names: string[];
    iconUrl: string | null;
    isInherited?: boolean;
};

export type QueryEntityEntry = {
    id: number;
    names: string[];
    iconUrl: string | null;
    type: "character" | "support";
};

export function normalizeQueryName(value: string): string {
    return value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[◎○×]/g, "")
        .replace(/['"`]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function resolveEntityToken(rawValue: string, entries: QueryEntityEntry[]): string {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return value;
    const normalized = normalizeQueryName(value);
    const match = entries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized));
    return match ? String(match.id) : rawValue.trim();
}

export function resolveSkillToken(rawValue: string, skillEntries: SkillNameEntry[]): string {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return value;
    const normalized = normalizeQueryName(value);
    const match = skillEntries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized));
    if (match) return String(match.id);
    if (/\binherit\b/i.test(value)) {
        const baseValue = value.replace(/\s*\(\s*inherit\s*\)\s*$/i, "").trim();
        const baseNormalized = normalizeQueryName(baseValue);
        const baseMatch = skillEntries.find((entry) => (
            !entry.isInherited
            && String(entry.id).startsWith("1")
            && entry.names.some((name) => normalizeQueryName(name) === baseNormalized)
        ));
        if (baseMatch) return `9${String(baseMatch.id).slice(1)}`;
    }
    return rawValue.trim();
}

export function resolveSkillEntry(rawValue: string, skillEntries: SkillNameEntry[]): SkillNameEntry | null {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, "");
    if (/^\d+$/.test(value)) return skillEntries.find((entry) => entry.id === Number(value)) ?? null;
    const normalized = normalizeQueryName(value);
    return skillEntries.find((entry) => entry.names.some((name) => normalizeQueryName(name) === normalized)) ?? null;
}

function splitKnownEntityList(listText: string, entries: Array<{ names: string[] }>): string[] {
    const knownNames = entries
        .flatMap((entry) => entry.names)
        .filter(Boolean)
        .sort((left, right) => right.length - left.length);
    const values: string[] = [];
    let index = 0;
    while (index < listText.length) {
        while (index < listText.length && /[\s,]/.test(listText[index])) index++;
        if (index >= listText.length) break;
        if (listText[index] === "\"" || listText[index] === "'") {
            const quote = listText[index++];
            let end = index;
            while (end < listText.length && listText[end] !== quote) end++;
            values.push(listText.slice(index, end));
            index = end + 1;
        } else {
            const lowerText = listText.toLowerCase();
            const knownName = knownNames.find((name) => {
                if (!lowerText.startsWith(name.toLowerCase(), index)) return false;
                const end = index + name.length;
                return end >= listText.length || /[\s,)]/.test(listText[end]);
            });
            if (knownName) {
                values.push(knownName);
                index += knownName.length;
            } else {
                let end = index;
                while (end < listText.length && listText[end] !== ",") end++;
                values.push(listText.slice(index, end).trim());
                index = end;
            }
        }
        while (index < listText.length && /\s/.test(listText[index])) index++;
        if (listText[index] === ",") index++;
    }
    return values.filter(Boolean);
}

export function compileFriendlyNames(
    query: string,
    skillEntries: SkillNameEntry[],
    characterEntries: QueryEntityEntry[],
    supportCardEntries: QueryEntityEntry[],
): string {
    let compiled = query;
    compiled = compiled.replace(/\b(skill_activation_rate)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `activation_rate(${resolved})`;
    });
    compiled = compiled.replace(/\b(skill_activations)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `activated_entries(${resolved})`;
    });
    compiled = compiled.replace(/\b(activation_rate|activated_entries)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)/gi, (match, functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return /^\d+$/.test(resolved) ? `${functionName}(${resolved})` : match;
    });
    compiled = compiled.replace(/\b(has_skill)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `learned has ${resolved}`;
    });
    compiled = compiled.replace(/\b(has_activated_skill)\s*\(\s*([^()]*(?:\(\s*inherit\s*\))?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return `activated has ${resolved}`;
    });
    compiled = compiled.replace(/\b(has_support_card)\s*\(\s*([^)]*?)\s*\)/gi, (_match, _functionName: string, rawValue: string) => {
        const resolved = resolveEntityToken(rawValue, supportCardEntries);
        return `support_cards has ${resolved}`;
    });
    compiled = compiled.replace(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+has\s+(any|all)\s*\(([^)]*)\)/gi, (_match, field: string, mode: string, listText: string) => {
        const resolvedList = splitKnownEntityList(listText, skillEntries).map((value) => resolveSkillToken(value, skillEntries));
        return `${field} has ${mode} (${resolvedList.join(", ")})`;
    });
    compiled = compiled.replace(/\b(learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+(has|contains|includes)\s+([^;\n()]*?(?:\(\s*inherit\s*\))?)(?=\s+(?:and|or)\b|\s*\)|;|\n|$)/gi, (match, field: string, operator: string, rawValue: string) => {
        const resolved = resolveSkillToken(rawValue, skillEntries);
        return /^\d+$/.test(resolved) ? `${field} ${operator} ${resolved}` : match;
    });
    compiled = compiled.replace(/\b(support|support_card|support_cards)\s+has\s+(any|all)\s*\(([^)]*)\)/gi, (_match, field: string, mode: string, listText: string) => {
        const resolvedList = splitKnownEntityList(listText, supportCardEntries).map((value) => resolveEntityToken(value, supportCardEntries));
        return `${field} has ${mode} (${resolvedList.join(", ")})`;
    });
    compiled = compiled.replace(/\b(support|support_card|support_cards)\s+(has|contains|includes)\s+([^;\n()]*?)(\s+at\s+lb\s+[0-4])?(?=\s+(?:and|or)\b|\)|;|\n|$)/gi, (match, field: string, operator: string, rawValue: string, limitBreakSuffix = "") => {
        const resolved = resolveEntityToken(rawValue, supportCardEntries);
        return /^\d+$/.test(resolved) ? `${field} ${operator} ${resolved}${limitBreakSuffix}` : match;
    });
    compiled = compiled.replace(/\b(uma|character|variant|character_variant|card|card_id|winner_card_id)\s*(=|!=|<>)\s+([^;\n()]*?)(?=\s+(?:and|or)\b|\)|;|\n|$)/gi, (match, field: string, operator: string, rawValue: string) => {
        const resolved = resolveEntityToken(rawValue, characterEntries);
        return /^\d+$/.test(resolved) ? `${field} ${operator} ${resolved}` : match;
    });
    return compiled;
}

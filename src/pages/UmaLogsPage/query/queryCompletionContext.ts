export type ActiveQueryClause = "select" | "where" | "group" | "having" | "order" | "limit" | "offset" | "root";

export type TokenCompletionContext = { from: number; token: string };

export function getSkillCompletionContext(textBeforeCursor: string): TokenCompletionContext | null {
    const functionMatch = textBeforeCursor.match(/\b(?:activation_rate|activated_entries|skill_activation_rate|skill_activations|has_skill|has_activated_skill)\s*\(\s*([^(),]*)$/i);
    if (functionMatch?.index !== undefined) {
        return { from: textBeforeCursor.length - functionMatch[1].length, token: functionMatch[1] };
    }

    const arrayMatch = textBeforeCursor.match(/\b(?:learned|learned_skill|learned_skills|activated|activated_skill|activated_skills)\s+has\s+((?:(?:any|all)\s*\()?[^(\n)]*)$/i);
    if (arrayMatch?.index !== undefined) {
        const listBody = arrayMatch[1].replace(/^(?:any|all)\s*\(/i, "");
        const token = listBody.slice(listBody.lastIndexOf(",") + 1);
        return { from: textBeforeCursor.length - token.length, token };
    }

    return null;
}

export function getEntityCompletionContext(textBeforeCursor: string): (TokenCompletionContext & { type: "character" | "support" }) | null {
    const compareMatch = textBeforeCursor.match(/\b(uma|character|variant|character_variant|card|card_id|winner_card_id)\s*(?:=|!=|<>)\s*([^,\n()]*)$/i);
    if (compareMatch?.index !== undefined) {
        return { from: textBeforeCursor.length - compareMatch[2].length, token: compareMatch[2], type: "character" };
    }

    const supportFunctionMatch = textBeforeCursor.match(/\bhas_support_card\s*\(\s*([^,\n()]*)$/i);
    if (supportFunctionMatch?.index !== undefined) {
        return { from: textBeforeCursor.length - supportFunctionMatch[1].length, token: supportFunctionMatch[1], type: "support" };
    }

    const supportMatch = textBeforeCursor.match(/\b(?:support|support_card|support_cards)\s+has\s+((?:(?:any|all)\s*\()?[^(\n)]*)$/i);
    if (supportMatch?.index !== undefined) {
        const listBody = supportMatch[1].replace(/^(?:any|all)\s*\(/i, "");
        const token = listBody.slice(listBody.lastIndexOf(",") + 1);
        return { from: textBeforeCursor.length - token.length, token, type: "support" };
    }

    return null;
}

export function getValueCompletionContext(textBeforeCursor: string): (TokenCompletionContext & { field: string }) | null {
    const match = textBeforeCursor.match(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|!=|<>|>=|<=|>|<)\s*("[^"]*|'[^']*|[^,\n()]*)$/i);
    if (match?.index === undefined) return null;
    return {
        from: textBeforeCursor.length - match[2].length,
        token: match[2].replace(/^['"]/, ""),
        field: match[1].toLowerCase(),
    };
}

export function getActiveQueryClause(textBeforeCursor: string): ActiveQueryClause {
    const lower = textBeforeCursor.toLowerCase();
    const clauses = [
        { clause: "group" as const, index: lower.lastIndexOf("group by") },
        { clause: "having" as const, index: lower.lastIndexOf("having") },
        { clause: "order" as const, index: lower.lastIndexOf("order by") },
        { clause: "select" as const, index: lower.lastIndexOf("select") },
        { clause: "where" as const, index: lower.lastIndexOf("where") },
        { clause: "limit" as const, index: lower.lastIndexOf("limit") },
        { clause: "offset" as const, index: lower.lastIndexOf("offset") },
    ].filter((entry) => entry.index >= 0);
    if (!clauses.length) return "root";
    clauses.sort((left, right) => right.index - left.index);
    return clauses[0].clause;
}

export function isEmptyCompletionTrigger(textBeforeCursor: string, activeClause: ActiveQueryClause): boolean {
    if (activeClause === "select") return /(?:\bselect|,)\s*$/i.test(textBeforeCursor);
    if (activeClause === "group") return /(?:\bgroup\s+by|,)\s*$/i.test(textBeforeCursor);
    if (activeClause === "order") return /\border\s+by\s*$/i.test(textBeforeCursor);
    if (activeClause === "having") return /\bhaving\s*$/i.test(textBeforeCursor);
    if (activeClause === "where") return /(?:\bwhere|\band|\bor|\()\s*$/i.test(textBeforeCursor);
    return false;
}

export function findTopLevelQueryClause(input: string, phrase: string): number {
    const lower = input.toLowerCase();
    let quote: string | null = null;
    let depth = 0;
    for (let index = 0; index <= input.length - phrase.length; index++) {
        const char = input[index];
        if (quote) {
            if (char === "\\" && index + 1 < input.length) index++;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        if (depth > 0) continue;
        if (lower.slice(index, index + phrase.length) === phrase) {
            const before = index === 0 ? " " : lower[index - 1];
            const after = index + phrase.length >= lower.length ? " " : lower[index + phrase.length];
            if (!/[a-z0-9_]/.test(before) && !/[a-z0-9_]/.test(after)) return index;
        }
    }
    return -1;
}

export function splitQueryCommaList(input: string): string[] {
    const parts: string[] = [];
    let quote: string | null = null;
    let depth = 0;
    let start = 0;
    for (let index = 0; index < input.length; index++) {
        const char = input[index];
        if (quote) {
            if (char === "\\" && index + 1 < input.length) index++;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === "\"") {
            quote = char;
            continue;
        }
        if (char === "(") depth++;
        else if (char === ")") depth = Math.max(0, depth - 1);
        else if (char === "," && depth === 0) {
            parts.push(input.slice(start, index).trim());
            start = index + 1;
        }
    }
    const tail = input.slice(start).trim();
    if (tail) parts.push(tail);
    return parts;
}

export function parseQueryClauses(query: string) {
    const trimmed = query.trim().replace(/;\s*$/, "");
    const whereIndex = findTopLevelQueryClause(trimmed, "where");
    const groupIndex = findTopLevelQueryClause(trimmed, "group by");
    const havingIndex = findTopLevelQueryClause(trimmed, "having");
    const orderIndex = findTopLevelQueryClause(trimmed, "order by");
    const limitIndex = findTopLevelQueryClause(trimmed, "limit");
    const offsetIndex = findTopLevelQueryClause(trimmed, "offset");
    const clauseIndexes = [whereIndex, groupIndex, havingIndex, orderIndex, limitIndex, offsetIndex].filter((index) => index >= 0);
    const firstClauseIndex = clauseIndexes.length ? Math.min(...clauseIndexes) : trimmed.length;
    const sectionEnd = (start: number, candidates: number[]) => {
        const next = candidates.filter((index) => index > start);
        return next.length ? Math.min(...next) : trimmed.length;
    };
    const startsWithSelect = trimmed.toLowerCase().startsWith("select ");
    return {
        startsWithSelect,
        selectText: startsWithSelect ? trimmed.slice("select ".length, firstClauseIndex).trim() : "",
        whereText: whereIndex >= 0 ? trimmed.slice(whereIndex + "where".length, sectionEnd(whereIndex, [groupIndex, havingIndex, orderIndex, limitIndex, offsetIndex])).trim() : "",
        groupText: groupIndex >= 0 ? trimmed.slice(groupIndex + "group by".length, sectionEnd(groupIndex, [havingIndex, orderIndex, limitIndex, offsetIndex])).trim() : "",
        havingText: havingIndex >= 0 ? trimmed.slice(havingIndex + "having".length, sectionEnd(havingIndex, [orderIndex, limitIndex, offsetIndex])).trim() : "",
        orderText: orderIndex >= 0 ? trimmed.slice(orderIndex + "order by".length, sectionEnd(orderIndex, [limitIndex, offsetIndex])).trim() : "",
        limitText: limitIndex >= 0 ? trimmed.slice(limitIndex + "limit".length, sectionEnd(limitIndex, [offsetIndex])).trim() : "",
        offsetText: offsetIndex >= 0 ? trimmed.slice(offsetIndex + "offset".length).trim() : "",
    };
}

export function getOrderDirectionCompletionContext(textBeforeCursor: string): TokenCompletionContext | null {
    if (getActiveQueryClause(textBeforeCursor) !== "order") return null;
    const match = textBeforeCursor.match(/\border\s+by\s+[A-Za-z_][A-Za-z0-9_]*\s+([A-Za-z]*)$/i);
    if (!match) return null;
    const token = match[1];
    if (token && !/^(a|as|asc|d|de|des|desc)$/i.test(token)) return null;
    return { from: textBeforeCursor.length - token.length, token };
}

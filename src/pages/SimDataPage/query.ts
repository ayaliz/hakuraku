import type { BuildDetailFilter, Card, Coverage, Performer, Requirement, Runner, Summary, TeamMatcher } from './types';

export const SHORT_STYLE: Record<number, string> = { 1: 'Front', 2: 'Pace', 3: 'Late', 4: 'End', 5: 'Runaway', 6: 'Debuffer' };
const aliases: Record<string, number> = { front: 1, 'front runner': 1, pace: 2, 'pace chaser': 2, late: 3, 'late surger': 3, end: 4, closer: 4, 'end closer': 4, runaway: 5, debuffer: 6, debuff: 6 };
export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const assignments = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
type TeamFilterRunner = Pick<Runner, 'card' | 'chara' | 'style'> & Partial<Runner>;
const hasMatcherCriteria = (slot: TeamMatcher) => slot.card !== undefined || slot.chara !== undefined || slot.style !== undefined;
export const hasRequirement = (slot: Requirement) => hasMatcherCriteria(slot) || Boolean(slot.anyOf?.some(hasMatcherCriteria)) || Boolean(slot.details?.length);
const gradeValue = (grade: string | undefined) => grade ? 'GFEDCBAS'.indexOf(grade.toUpperCase()) + 1 : 0;
const detailMatches = (member: TeamFilterRunner, filter: BuildDetailFilter): boolean => {
    if (filter.kind === 'number') {
        const index = { speed: 0, stamina: 1, power: 2, guts: 3, wit: 4 }[filter.field];
        const value = member.stats?.[index];
        return value !== undefined && (filter.min === undefined || value >= filter.min) && (filter.max === undefined || value <= filter.max);
    }
    if (filter.kind === 'aptitude') {
        const index = { distance: 0, surface: 1, style: 2 }[filter.field];
        const value = gradeValue(member.aptitudes?.[index]);
        return filter.mode === 'exact' ? value === filter.grade
            : filter.mode === 'not' ? value !== filter.grade
                : filter.mode === 'atLeast' ? value >= filter.grade : value <= filter.grade;
    }
    if (filter.kind === 'skill') {
        const present = Boolean(member.skills?.some(([id]) => id === filter.id));
        return filter.exclude ? !present : present;
    }
    const present = Boolean(member.deck?.some(card => card.id === filter.id && (filter.lb === undefined || card.lb === filter.lb)));
    return filter.exclude ? !present : present;
};
const memberMatches = (member: TeamFilterRunner, slot: Requirement): boolean =>
    slot.anyOf?.length
        ? slot.anyOf.some(option => memberMatches(member, option)) && (!slot.details?.length || slot.details.every(filter => detailMatches(member, filter)))
        : (slot.card === undefined || member.card === slot.card)
            && (slot.chara === undefined || member.chara === slot.chara)
            && (slot.style === undefined || member.style === slot.style)
            && (!slot.details?.length || slot.details.every(filter => detailMatches(member, filter)));

export function matchesTeam(members: TeamFilterRunner[], slots: Requirement[]): boolean {
    if (members.length !== 3) return false;
    const excluded = slots.filter(slot => slot.exclude && hasRequirement(slot));
    if (excluded.some(slot => members.some(member => memberMatches(member, slot)))) return false;
    const included = slots.filter(slot => !slot.exclude && hasRequirement(slot));
    if (included.length > 3) return false;
    const padded = [...included, ...Array.from({ length: 3 - included.length }, () => ({} as Requirement))];
    return assignments.some(order => padded.every((slot, i) => memberMatches(members[order[i]], slot)));
}

export function parseQuery(text: string, cards: Record<number, Card>): Requirement[] {
    if (text.startsWith('v2:')) {
        const parsed = JSON.parse(text.slice(3));
        if (!Array.isArray(parsed)) throw new Error('The detailed team filters are invalid.');
        return parsed as Requirement[];
    }
    const tokens: string[] = []; let current = '', brackets = 0;
    for (const char of text.trim()) {
        if (char === '[') brackets++;
        if (char === ']') brackets--;
        if (brackets < 0) throw new Error('The outfit brackets do not match.');
        if (char === '/' && brackets === 0) { tokens.push(current.trim()); current = ''; } else current += char;
    }
    if (brackets) throw new Error('Close the outfit bracket before searching.');
    if (current.trim() || tokens.length) tokens.push(current.trim());
    const characters = [...new Map(Object.values(cards).map(card => [card.chara, card])).values()];
    const parseMatcher = (original: string): TeamMatcher => {
        let token = original.trim();
        const suffix = token.match(/\(([^)]+)\)\s*$/); let style: number | undefined;
        if (suffix) {
            style = aliases[normalize(suffix[1])];
            if (!style) throw new Error(`Unknown style: ${suffix[1]}.`);
            token = token.slice(0, suffix.index).trim();
        }
        const key = normalize(token);
        if (!key || key === 'any' || token === '*') return style ? { style } : {};
        if (aliases[key]) {
            if (style && style !== aliases[key]) throw new Error('A teammate cannot match two different styles.');
            return { style: aliases[key] };
        }
        const outfits = Object.entries(cards).filter(([, card]) => normalize(card.name + ' ' + card.outfit) === key);
        const id = Number(token.replace(/^#/, ''));
        const cardId = cards[id] ? id : outfits.length === 1 ? Number(outfits[0][0]) : null;
        if (cardId) return { card: cardId, chara: cards[cardId].chara, ...(style ? { style } : {}) };
        let matches = characters.filter(card => normalize(card.name) === key);
        if (!matches.length) matches = characters.filter(card => normalize(card.name).includes(key));
        if (matches.length !== 1) throw new Error(matches.length ? `Several Umas match “${token}”. Use the full name.` : `No Uma or style matches “${token}”.`);
        return { chara: matches[0].chara, ...(style ? { style } : {}) };
    };
    const requirements = tokens.map((original): Requirement => {
        const without = /^\s*(?:without|not)\s+/i.test(original) || /^\s*!/.test(original);
        const token = original.replace(/^\s*(?:without|not)\s+/i, '').replace(/^\s*!\s*/, '');
        const alternatives = token.split('|').map(parseMatcher);
        if (alternatives.length > 1 && alternatives.some(option => !hasMatcherCriteria(option))) {
            throw new Error('“Any” cannot be combined with alternatives in one team slot.');
        }
        const requirement: Requirement = alternatives.length > 1 ? { anyOf: alternatives } : alternatives[0] ?? {};
        if (without && !hasRequirement(requirement)) throw new Error('A “Without” filter needs an Uma, outfit, or style.');
        return without ? { ...requirement, exclude: true } : requirement;
    });
    const included = requirements.filter(slot => !slot.exclude);
    if (included.length > 3) throw new Error('Use up to three team slots; additional filters must be “Without” clauses.');
    while (included.length < 3) included.push({});
    return [...included, ...requirements.filter(slot => slot.exclude)];
}

export function queryText(slots: Requirement[], cards: Record<number, Card>): string {
    if (slots.some(slot => slot.details?.length)) return `v2:${JSON.stringify(slots)}`;
    const matcherText = (slot: TeamMatcher): string => {
        const card = slot.card ? cards[slot.card] : Object.values(cards).find(c => c.chara === slot.chara);
        const role = slot.style ? SHORT_STYLE[slot.style] : null;
        return card ? card.name + (slot.card ? ' ' + card.outfit : '') + (role ? ` (${role})` : '') : role ?? 'Any';
    };
    const requirementText = (slot: Requirement) => slot.anyOf?.length
        ? slot.anyOf.map(matcherText).join(' | ')
        : matcherText(slot);
    const included = slots.filter(slot => !slot.exclude).slice(0, 3);
    while (included.length < 3) included.push({});
    const excluded = slots.filter(slot => slot.exclude && hasRequirement(slot));
    return [...included.map(requirementText), ...excluded.map(slot => `Without ${requirementText(slot)}`)].join(' / ');
}

export function compositionQuery(key: string, pair?: { card: number; chara: number; style: number }): Requirement[] {
    const slots: Requirement[] = key.split('-').map(style => ({ style: Number(style) }));
    if (pair) { const index = slots.findIndex(slot => slot.style === pair.style); if (index >= 0) slots[index] = { card: pair.card, chara: pair.chara, style: pair.style }; }
    return slots;
}

export function rankTeams(teams: Performer[], slots: Requirement[], distinct: boolean, sort: 'rate' | 'lower'): Performer[] {
    const ranked = teams.filter(team => matchesTeam(team.members, slots)).sort((a, b) =>
        (sort === 'lower' ? b.ci[0] - a.ci[0] : b.wins / b.n - a.wins / a.n) || b.wins / b.n - a.wins / a.n || b.n - a.n || a.id.localeCompare(b.id));
    const seen = new Set<string>();
    return ranked.filter(team => { if (!distinct) return true; if (seen.has(team.owner.id)) return false; seen.add(team.owner.id); return true; });
}

export function capturedCoverage(coverage: Coverage, cards: Record<number, Card>, slots: Requirement[]) {
    let teams = 0; const owners = new Set<number>();
    for (const [owner, a, b, c, count] of coverage.signatures) {
        const members = [a, b, c].map(code => ({ card: Math.floor(code / 10), chara: cards[Math.floor(code / 10)].chara, style: code % 10 as Runner['style'] }));
        if (matchesTeam(members, slots)) { teams += count; owners.add(owner); }
    }
    return { teams, owners: owners.size };
}

export function saturationStats(data: Summary) {
    return data.styles.map(row => ({ strategy: row.style,
        saturation: data.saturation[row.style].map(b => ({ count: b.x, raceCount: b.races, wins: b.wins })),
        crossSaturation: Object.fromEntries(Object.entries(data.fieldSaturation[row.style]).map(([style, buckets]) => [style, buckets.map(b => ({ count: b.x, raceCount: b.races, wins: b.wins, subjectCount: b.entries }))])),
    }));
}

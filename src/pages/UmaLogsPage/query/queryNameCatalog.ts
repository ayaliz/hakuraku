import AssetLoader from "../../../data/AssetLoader";
import GameDataLoader from "../../../data/GameDataLoader";
import UMDatabaseWrapper from "../../../data/UMDatabaseWrapper";
import { resolveIconSkillId } from "../../../data/skillIcons";
import type { QueryEntityEntry, SkillNameEntry } from "./queryFriendlyNames";

export { resolveIconSkillId } from "../../../data/skillIcons";

export function buildSkillNameEntries(): SkillNameEntry[] {
    const byId = new Map<number, Set<string>>();
    const add = (id: number, name?: string) => {
        if (!id || !name?.trim()) return;
        if (!byId.has(id)) byId.set(id, new Set());
        byId.get(id)!.add(name.trim());
        const withoutMarker = name.replace(/[◎○×]/g, "").trim();
        if (withoutMarker && withoutMarker !== name.trim()) byId.get(id)!.add(withoutMarker);
    };

    Object.values(UMDatabaseWrapper.skills).forEach((skill) => add(skill.id ?? 0, skill.name));
    try {
        GameDataLoader.skillNameFallbacks.forEach((skill) => {
            add(skill.id, skill.enname);
            add(skill.id, skill.jpname);
        });
    } catch {
        // Fallback data is normally initialized before UmaLogs renders, but UMDB names are enough to proceed.
    }

    const addInheritedVariant = (baseId: number, names: Set<string>) => {
        const inheritedId = Number(`9${String(baseId).slice(1)}`);
        if (!inheritedId) return;
        if (!byId.has(inheritedId)) byId.set(inheritedId, new Set());
        names.forEach((name) => byId.get(inheritedId)!.add(name));
    };

    [...byId.entries()].forEach(([id, names]) => {
        if (String(id).startsWith("1")) addInheritedVariant(id, names);
    });

    return [...byId.entries()]
        .map(([id, names]) => {
            const isInherited = String(id).startsWith("9");
            const iconSkillId = resolveIconSkillId(id);
            const iconId = UMDatabaseWrapper.skills[iconSkillId]?.iconId;
            return {
                id,
                names: [...names].filter(Boolean).map((name) => isInherited ? `${name} (inherit)` : name),
                iconUrl: iconId ? AssetLoader.getSkillIcon(iconId) : null,
                isInherited,
            };
        })
        .sort((left, right) => {
            const leftLength = Math.max(...left.names.map((name) => name.replace(/\s+\(inherit\)$/i, "").length));
            const rightLength = Math.max(...right.names.map((name) => name.replace(/\s+\(inherit\)$/i, "").length));
            if (rightLength !== leftLength) return rightLength - leftLength;
            return Number(left.isInherited) - Number(right.isInherited);
        });
}

export function buildCharacterNameEntries(): QueryEntityEntry[] {
    return Object.values(UMDatabaseWrapper.cards)
        .filter((card) => card.id && card.name)
        .map((card) => {
            const cardId = card.id!;
            const charaId = Math.floor(cardId / 100);
            const charaName = UMDatabaseWrapper.charas[charaId]?.name;
            const names = new Set<string>([card.name]);
            if (charaName && card.name === charaName) names.add(charaName);
            return {
                id: cardId,
                names: [...names],
                iconUrl: AssetLoader.getCharaThumb(cardId),
                type: "character" as const,
            };
        })
        .sort((left, right) => left.names[0].localeCompare(right.names[0]));
}

export function buildSupportCardNameEntries(): QueryEntityEntry[] {
    return Object.values(UMDatabaseWrapper.supportCards)
        .filter((card) => card.id && card.name)
        .map((card) => ({
            id: card.id!,
            names: [card.name],
            iconUrl: AssetLoader.getSupportCardIcon(card.id!),
            type: "support" as const,
        }))
        .sort((left, right) => left.names[0].localeCompare(right.names[0]));
}

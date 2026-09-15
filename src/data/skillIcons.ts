import AssetLoader from "./AssetLoader";
import UMDatabaseWrapper from "./UMDatabaseWrapper";

export function resolveIconSkillId(id: number): number {
    const value = String(id);
    return value.startsWith("9") ? Number(`1${value.slice(1)}`) : id;
}

export function getSkillIconUrl(id: number): string | null {
    const iconId = UMDatabaseWrapper.skills[resolveIconSkillId(id)]?.iconId;
    return iconId ? AssetLoader.getSkillIcon(iconId) : null;
}

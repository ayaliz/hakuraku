export type FilterProperty =
    | "none"
    | "speed"
    | "stamina"
    | "pow"
    | "guts"
    | "wiz"
    | "aptGround"
    | "aptDistance"
    | "aptStyle"
    | "totalSkillPoints"
    | "rankScore"
    | "careerWinCount"
    | "deckRaceBonus"
    | "isDebuffer"
    | "skill"
    | "supportCard";

export type StatOp = ">" | "<" | "=";
export type SkillFilterMode = "learned" | "activated";
export type CharacterMatchMode = "is" | "isNot";
export type FeatureCardMode = "include" | "exclude";
export type RequirementTruthMode = "require" | "requireNot";

export interface CharacterRequirement {
    id: string;
    truthMode: RequirementTruthMode;
    property: FilterProperty;
    statOp: StatOp;
    statValue: number;
    skillId: number | null;
    skillMode: SkillFilterMode;
    supportCardId: number | null;
    supportCardPresent: boolean;
    supportCardLb: number;
}

export interface CharacterFeature {
    id: string;
    characterMatchMode: CharacterMatchMode;
    cardMode: FeatureCardMode;
    cardId: number | null;
    cardStrategy: number | null;
    requirements: CharacterRequirement[];
}

export interface CharaVariant {
    cardId: number;
    charaId: number;
    charaName: string;
    cardName: string;
    count: number;
}

export interface SkillVariant {
    skillId: number;
    skillName: string;
    isInherit: boolean;
    count: number;
}

export interface SupportCardVariant {
    supportCardId: number;
    name: string;
    count: number;
}

export const SUPPORT_CARD_LB_ANY = -1;

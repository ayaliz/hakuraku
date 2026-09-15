import {
    SUPPORT_CARD_LB_ANY,
    type CharacterRequirement,
    type FilterProperty,
    type SkillVariant,
    type SupportCardVariant,
} from "./filterTypes";

export type EditableFilterProperty = Exclude<FilterProperty, "deckRaceBonus">;

export const PROPERTY_LABELS: Record<EditableFilterProperty, string> = {
    none: "—",
    speed: "Speed",
    stamina: "Stamina",
    pow: "Power",
    guts: "Guts",
    wiz: "Wit",
    aptGround: "Aptitude (Ground)",
    aptDistance: "Aptitude (Distance)",
    aptStyle: "Aptitude (Style)",
    totalSkillPoints: "Skill pts",
    rankScore: "Score",
    careerWinCount: "Career wins",
    isDebuffer: "Is Debuffer",
    skill: "Skill",
    supportCard: "Support card",
};

export const PROPERTY_OPTIONS = Object.keys(PROPERTY_LABELS) as EditableFilterProperty[];

export const SUPPORT_CARD_LB_OPTIONS = [
    { value: SUPPORT_CARD_LB_ANY, label: "Any" },
    { value: 0, label: "0LB" },
    { value: 1, label: "1LB" },
    { value: 2, label: "2LB" },
    { value: 3, label: "3LB" },
    { value: 4, label: "MLB" },
] as const;

export const APTITUDE_GRADE_OPTIONS = [
    { value: 8, label: "S" },
    { value: 7, label: "A" },
    { value: 6, label: "B" },
    { value: 5, label: "C" },
    { value: 4, label: "D" },
    { value: 3, label: "E" },
    { value: 2, label: "F" },
    { value: 1, label: "G" },
] as const;

export function defaultStatValueForProperty(property: FilterProperty): number {
    switch (property) {
        case "speed":
        case "stamina":
        case "pow":
        case "guts":
        case "wiz":
            return 1200;
        case "aptGround":
        case "aptDistance":
        case "aptStyle":
            return 8;
        case "totalSkillPoints":
            return 3000;
        case "careerWinCount":
            return 35;
        case "deckRaceBonus":
            return 50;
        case "isDebuffer":
            return 0;
        default:
            return 35;
    }
}

export function createCharacterRequirement(
    id: string,
    skillVariants: readonly Pick<SkillVariant, "skillId">[] = [],
    supportCardVariants: readonly Pick<SupportCardVariant, "supportCardId">[] = [],
): CharacterRequirement {
    return {
        id,
        truthMode: "require",
        property: "none",
        statOp: ">",
        statValue: defaultStatValueForProperty("none"),
        skillId: skillVariants[0]?.skillId ?? null,
        skillMode: "learned",
        supportCardId: supportCardVariants[0]?.supportCardId ?? null,
        supportCardPresent: true,
        supportCardLb: SUPPORT_CARD_LB_ANY,
    };
}

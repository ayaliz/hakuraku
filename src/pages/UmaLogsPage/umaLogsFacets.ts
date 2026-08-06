import type { ExplorerBootstrapPayload, SkillVariant, SupportCardVariant } from "./explorerShared";
import type { ReplayBootstrapPayload, ReplayCharacterVariant } from "./replaysShared";

export type UmaLogsFilterFacets = {
    cmId: string;
    courseId: number;
    totalRaces: number;
    totalTeams: number;
    lowScoreRankThreshold?: number | null;
    characterVariants: ReplayCharacterVariant[];
    skillVariants: SkillVariant[];
    supportCardVariants: SupportCardVariant[];
};

export function facetsToExplorerBootstrap(facets: UmaLogsFilterFacets): ExplorerBootstrapPayload {
    return {
        totalTeams: facets.totalTeams,
        cardVariants: [
            { cardId: 0, charaId: 0, charaName: "", cardName: "Any character", count: 0 },
            ...facets.characterVariants.map((variant) => ({
                ...variant,
                charaName: "",
                cardName: "",
            })),
        ],
        skillVariants: facets.skillVariants,
        supportCardVariants: facets.supportCardVariants,
    };
}

export function facetsToReplayBootstrap(facets: UmaLogsFilterFacets): ReplayBootstrapPayload {
    return {
        cmId: facets.cmId,
        courseId: facets.courseId,
        totalRaces: facets.totalRaces,
        characterVariants: facets.characterVariants,
        skillVariants: facets.skillVariants,
        supportCardVariants: facets.supportCardVariants,
    };
}

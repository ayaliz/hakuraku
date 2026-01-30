export interface CharaHpSpurtStats {
    charaId: number;
    cardId: number;
    charaName: string;
    totalRuns: number;
    fullSpurtCount: number;
    survivalCount: number;
    hpOutcomesFullSpurt: number[];
    hpOutcomesNonFullSpurt: number[];
}

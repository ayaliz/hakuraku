export type TensorPayload = {
    shape: number[];
    data: number[];
};

export type PassiveEffectSummary = {
    speed: number;
    stamina: number;
    power: number;
    guts: number;
    wisdom: number;
};

export type PassiveConditionGroup = {
    condition: string;
    effects: PassiveEffectSummary;
};

export type PassiveSkillCatalogEntry = {
    skillId: number;
    name: string;
    groups: PassiveConditionGroup[];
};

export type FrontendPassiveModifiers = {
    speed: number;
    stamina: number;
    power: number;
    guts: number;
    wisdom: number;
};

export type FrontendModel = {
    version: number;
    label: string;
    courseId: number;
    courseContext: {
        course_id: number;
        track_id: number;
        ground_condition: number;
        weather: number;
        season: number;
        rotation: number;
        is_basis_distance: number;
        surface: number;
        distance: number;
        track_stat_thresholds?: string[];
    };
    schema: {
        styleIds: number[];
        gateNumbers?: number[];
        numericFields: string[];
        aptitudeFields: string[];
        rankFields: string[];
        featureNames?: string[];
        skillVocabTopK: number;
        skillVocab: number[];
    };
    modelConfig: {
        inputDim: number;
        hiddenDim: number;
        dropout: number;
        modelType: "legacy_deepsets" | "deepsets";
    };
    normalization: {
        mean: number[];
        std: number[];
    };
    weights: Record<string, TensorPayload>;
    surrogateSpurtModel?: {
        inputFeatureNames: string[];
        outputFeatureNames: string[];
        modelConfig: {
            input_dim: number;
            hidden_dim: number;
            dropout: number;
            output_dim: number;
        };
        normalization: {
            mean: number[];
            std: number[];
        };
        recoveryValueBySkillId: Record<string, number>;
        weights: Record<string, TensorPayload>;
    };
    passiveSkills: PassiveSkillCatalogEntry[];
};

export type FrontendHorse = {
    frame_order: number;
    chara_id: number;
    chara_name: string;
    card_id: number;
    strategy: number;
    learned_skill_ids: number[];
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number;
    rank_score: number;
    career_win_count: number;
    motivation: number;
    activation_chance: number;
    apt_ground: number;
    apt_distance: number;
    apt_style: number;
    team_id: number;
    base_speed?: number;
    base_stamina?: number;
    base_pow?: number;
    base_guts?: number;
    base_wiz?: number;
    matched_passive_skill_ids?: number[];
    passive_stat_modifiers?: FrontendPassiveModifiers;
    speed_course_modifier?: number;
    last_spurt_target_speed?: number;
};

export type FrontendTeam = {
    team_id: number;
    horses: FrontendHorse[];
};

export type FrontendRoom = {
    race_id: string;
    course_id: number;
    track_label: string;
    timestamp_ms: number;
    teams: FrontendTeam[];
};

export type RaceRoomModelSpec = {
    id: string;
    label: string;
    courseId: number;
    artifactPath: string;
    teamCount: number;
    horsesPerTeam: number;
};

export type RaceRoomPrediction = {
    frameOrder: number;
    teamId: number;
    probability: number;
    rank: number;
};

export type RaceRoomPredictionResult = {
    modelId: string;
    predictions: RaceRoomPrediction[];
};

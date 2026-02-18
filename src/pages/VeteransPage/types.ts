export type Veteran = {
    trained_chara_id: number;
    use_type: number;
    card_id: number;
    name: string | null;
    fans: number;
    rank_score: number;
    rank: number;
    succession_num: number;
    is_locked: number;
    rarity: number;
    talent_level: number;
    chara_grade: number;
    running_style: number;
    nickname_id: number;
    wins: number;
    speed: number;
    stamina: number;
    pow: number;
    guts: number;
    wiz: number;
    proper_distance_short: number;
    proper_distance_mile: number;
    proper_distance_middle: number;
    proper_distance_long: number;
    proper_ground_turf: number;
    proper_ground_dirt: number;
    proper_running_style_nige: number;
    proper_running_style_senko: number;
    proper_running_style_sashi: number;
    proper_running_style_oikomi: number;
    skill_array: Array<{
        skill_id: number;
        level: number;
    }>;
    support_card_list: Array<{
        position: number;
        support_card_id: number;
        exp: number;
        limit_break_count: number;
    }>;
    is_saved: number;
    race_result_list: Array<{
        turn: number;
        program_id: number;
        weather: number;
        ground_condition: number;
        running_style: number;
        result_rank: number;
    }>;
    win_saddle_id_array: number[];
    nickname_id_array: number[];
    factor_id_array: number[];
    factor_info_array: Array<{
        factor_id: number;
        level: number;
    }>;
    succession_chara_array: Array<{
        position_id: number;
        card_id: number;
        rank: number;
        rarity: number;
        talent_level: number;
        factor_id_array: number[];
        factor_info_array: Array<{
            factor_id: number;
            level: number;
        }>;
        win_saddle_id_array: number[];
        owner_viewer_id: number;
        user_info_summary: object | null;
    }>;
    succession_history_array: string[];
    scenario_id: number;
    create_time: string;
};

export type FilterType = 'Legacy' | 'Total';

export type BaseFilter = {
    id: string;
    type: FilterType;
    stat: string;
    stars: number;
};

export type BluesFilter = BaseFilter;
export type AptitudeFilter = BaseFilter;
export type UniquesFilter = BaseFilter;
export type RacesFilter = BaseFilter;
export type SkillsFilter = BaseFilter;

export type SortOption = 'none' | 'blues' | 'total_common' | 'total_skills' | 'legacy_common' | 'legacy_skills' | 'date' | 'affinity';
export type SortDirection = 'asc' | 'desc';

export type SparkSearch = { name: string; stars: number; includeParents: boolean };

export type OptimizerConfig = {
    bluesWeight: number;
    aptWeight: number;
    uniqueWeight: number;
    skillWeight: number;
    scenarioWeight: number;
    highValueSkills: number[];
    highValueSkillBonus: number;
};

import { Veteran } from "./types";

const WORKER_URL = 'https://cors-proxy.ayaliz.workers.dev';

type NewBorrowResponse = {
    items?: Array<{
        account_id?: string | number;
        trainer_name?: string;
        last_updated?: string;
        inheritance?: {
            inheritance_id?: number;
            account_id?: string | number;
            main_parent_id?: number;
            parent_left_id?: number;
            parent_right_id?: number;
            parent_rank?: number;
            parent_rarity?: number;
            win_count?: number;
            main_blue_factors?: number | number[] | null;
            main_pink_factors?: number | number[] | null;
            main_green_factors?: number | number[] | null;
            main_white_factors?: number[] | null;
            left_blue_factors?: number | number[] | null;
            left_pink_factors?: number | number[] | null;
            left_green_factors?: number | number[] | null;
            left_white_factors?: number[] | null;
            right_blue_factors?: number | number[] | null;
            right_pink_factors?: number | number[] | null;
            right_green_factors?: number | number[] | null;
            right_white_factors?: number[] | null;
            main_win_saddles?: number[] | null;
            left_win_saddles?: number[] | null;
            right_win_saddles?: number[] | null;
        };
        support_card?: {
            support_card_id?: number;
            limit_break_count?: number;
            experience?: number;
        };
    }>;
};

function toArray(value: number | number[] | null | undefined): number[] {
    if (value == null || value === 0) return [];
    return Array.isArray(value) ? value.filter(v => !!v) : [value];
}

function toFactorInfoArray(factorIds: number[]): Veteran["factor_info_array"] {
    return factorIds.map(factorId => ({
        factor_id: factorId,
        level: factorId % 100,
    }));
}

function mapBorrowedSearchResultToVeteran(data: NewBorrowResponse): Veteran {
    const item = data.items?.[0];
    const inheritance = item?.inheritance;
    if (!item || !inheritance || !inheritance.main_parent_id) {
        throw new Error("Borrowed parent not found");
    }

    const mainFactorIds = [
        ...toArray(inheritance.main_blue_factors),
        ...toArray(inheritance.main_pink_factors),
        ...toArray(inheritance.main_green_factors),
        ...toArray(inheritance.main_white_factors),
    ];
    const leftFactorIds = [
        ...toArray(inheritance.left_blue_factors),
        ...toArray(inheritance.left_pink_factors),
        ...toArray(inheritance.left_green_factors),
        ...toArray(inheritance.left_white_factors),
    ];
    const rightFactorIds = [
        ...toArray(inheritance.right_blue_factors),
        ...toArray(inheritance.right_pink_factors),
        ...toArray(inheritance.right_green_factors),
        ...toArray(inheritance.right_white_factors),
    ];

    return {
        trained_chara_id: Math.floor(inheritance.main_parent_id / 100),
        use_type: 0,
        card_id: inheritance.main_parent_id,
        name: item.trainer_name ?? null,
        fans: 0,
        rank_score: inheritance.parent_rank ?? 0,
        rank: 0,
        succession_num: 2,
        is_locked: 0,
        rarity: inheritance.parent_rarity ?? 0,
        talent_level: 0,
        chara_grade: 0,
        running_style: 0,
        nickname_id: 0,
        wins: inheritance.win_count ?? 0,
        speed: 0,
        stamina: 0,
        pow: 0,
        guts: 0,
        wiz: 0,
        proper_distance_short: 0,
        proper_distance_mile: 0,
        proper_distance_middle: 0,
        proper_distance_long: 0,
        proper_ground_turf: 0,
        proper_ground_dirt: 0,
        proper_running_style_nige: 0,
        proper_running_style_senko: 0,
        proper_running_style_sashi: 0,
        proper_running_style_oikomi: 0,
        skill_array: [],
        support_card_list: item.support_card?.support_card_id
            ? [{
                position: 1,
                support_card_id: item.support_card.support_card_id,
                exp: item.support_card.experience ?? 0,
                limit_break_count: item.support_card.limit_break_count ?? 0,
            }]
            : [],
        is_saved: 0,
        race_result_list: [],
        win_saddle_id_array: inheritance.main_win_saddles ?? [],
        nickname_id_array: [],
        factor_id_array: mainFactorIds,
        factor_info_array: toFactorInfoArray(mainFactorIds),
        succession_chara_array: [
            {
                position_id: 10,
                card_id: inheritance.parent_left_id ?? 0,
                rank: 0,
                rarity: 0,
                talent_level: 0,
                factor_id_array: leftFactorIds,
                factor_info_array: toFactorInfoArray(leftFactorIds),
                win_saddle_id_array: inheritance.left_win_saddles ?? [],
                owner_viewer_id: Number(item.account_id ?? inheritance.account_id ?? 0),
                user_info_summary: null,
            },
            {
                position_id: 20,
                card_id: inheritance.parent_right_id ?? 0,
                rank: 0,
                rarity: 0,
                talent_level: 0,
                factor_id_array: rightFactorIds,
                factor_info_array: toFactorInfoArray(rightFactorIds),
                win_saddle_id_array: inheritance.right_win_saddles ?? [],
                owner_viewer_id: Number(item.account_id ?? inheritance.account_id ?? 0),
                user_info_summary: null,
            },
        ],
        succession_history_array: [],
        scenario_id: 0,
        create_time: item.last_updated ?? new Date().toISOString(),
    };
}

function stripVeteran(v: Veteran) {
    return {
        card_id: v.card_id,
        rank_score: v.rank_score,
        create_time: v.create_time,
        factor_id_array: v.factor_id_array,
        win_saddle_id_array: v.win_saddle_id_array ?? [],
        skill_array: (v.skill_array ?? []).map(s => ({ skill_id: s.skill_id })),
        succession_chara_array: (v.succession_chara_array ?? []).map(p => ({
            position_id: p.position_id,
            card_id: p.card_id,
            factor_id_array: p.factor_id_array,
            win_saddle_id_array: p.win_saddle_id_array ?? [],
        })),
    };
}

export function buildShareBody(veterans: Veteran[]): string {
    return JSON.stringify(veterans.map(stripVeteran));
}

export async function uploadVeteransToWorker(body: string): Promise<string> {
    const res = await fetch(`${WORKER_URL}/share`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Share-Secret': import.meta.env.VITE_SHARE_SECRET ?? '',
        },
        body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { key } = await res.json();
    return `${window.location.origin}${window.location.pathname}#/veterans?kv=${key}`;
}

export async function fetchVeteransFromWorker(key: string): Promise<Veteran[]> {
    const res = await fetch(`${WORKER_URL}/share/${key}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<Veteran[]>;
}

export async function fetchLoanedChara(viewerId: string): Promise<Veteran> {
    const res = await fetch(`${WORKER_URL}/uma-search?viewer_id=${encodeURIComponent(viewerId)}`, {
        headers: {
            'X-Share-Secret': import.meta.env.VITE_SHARE_SECRET ?? '',
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.practice_partner_info) {
        return data.practice_partner_info as Veteran;
    }
    return mapBorrowedSearchResultToVeteran(data as NewBorrowResponse);
}

export function getKvKeyFromUrl(): string | null {
    const parts = window.location.hash.split('?');
    if (parts.length < 2) return null;
    return new URLSearchParams(parts[1]).get('kv');
}

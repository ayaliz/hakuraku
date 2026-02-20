import { Veteran } from "./types";

const WORKER_URL = 'https://cors-proxy.ayaliz.workers.dev';

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

export async function fetchLoanedChara(trainerId: string): Promise<unknown> {
    const res = await fetch(`${WORKER_URL}/uma-search?trainer_id=${encodeURIComponent(trainerId)}`, {
        headers: {
            'X-Share-Secret': import.meta.env.VITE_SHARE_SECRET ?? '',
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export function getKvKeyFromUrl(): string | null {
    const parts = window.location.hash.split('?');
    if (parts.length < 2) return null;
    return new URLSearchParams(parts[1]).get('kv');
}

import type { ReplayExactBuildFilter } from "./replaysShared";
import {
    validateUmaLogsQuerySpec,
    type UmaLogsQuerySpec,
} from "./umaLogsQueryShared";

export const REPLAY_NAVIGATION_PARAMS = [
    "replayCardId",
    "replayBuildKey",
    "replayBuild",
    "replayUqlKey",
    "replayUql",
    "replayEntryQuerySpecKey",
    "replayEntryQuerySpec",
    "replayAutoRun",
] as const;

export type ReplayNavigationStorage = Pick<Storage, "getItem" | "setItem">;

function encodeBase64UrlText(value: string): string {
    const bytes = new TextEncoder().encode(value);
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64UrlText(value: string): string {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function encodeBase64UrlJson(value: unknown): string {
    return encodeBase64UrlText(JSON.stringify(value));
}

function decodeBase64UrlJson(value: string): unknown {
    return JSON.parse(decodeBase64UrlText(value)) as unknown;
}

export function parseReplayCardId(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeReplayExactBuildFilter(parsed: Partial<ReplayExactBuildFilter>): ReplayExactBuildFilter | null {
    const cardId = Number(parsed.cardId);
    const strategy = Number(parsed.strategy);
    if (!Number.isFinite(cardId) || cardId <= 0) return null;
    const legacyDebufferStrategy = Number.isFinite(strategy) && strategy === 6;
    const normalizedStrategy = Number.isFinite(strategy) && strategy >= 1 && strategy <= 5
        ? Math.floor(strategy)
        : null;
    return {
        cardId: Math.floor(cardId),
        strategy: normalizedStrategy,
        isDebuffer: parsed.isDebuffer === true || legacyDebufferStrategy,
        speed: Number(parsed.speed) || 0,
        stamina: Number(parsed.stamina) || 0,
        pow: Number(parsed.pow) || 0,
        guts: Number(parsed.guts) || 0,
        wiz: Number(parsed.wiz) || 0,
        rankScore: Number(parsed.rankScore) || 0,
        careerWinCount: Number(parsed.careerWinCount) || 0,
        supportCardIds: Array.isArray(parsed.supportCardIds) ? parsed.supportCardIds.map(Number).filter(Number.isFinite) : [],
        supportCardLimitBreaks: Array.isArray(parsed.supportCardLimitBreaks) ? parsed.supportCardLimitBreaks.map(Number).filter(Number.isFinite) : [],
        learnedSkillIds: Array.isArray(parsed.learnedSkillIds) ? parsed.learnedSkillIds.map(Number).filter(Number.isFinite) : [],
    };
}

export function encodeReplayExactBuildParam(build: ReplayExactBuildFilter): string {
    return encodeBase64UrlJson(build);
}

export function decodeReplayExactBuildParam(value: string | null): ReplayExactBuildFilter | null {
    if (!value) return null;
    try {
        return normalizeReplayExactBuildFilter(decodeBase64UrlJson(value) as Partial<ReplayExactBuildFilter>);
    } catch {
        return null;
    }
}

export function readReplayExactBuildFilter(
    key: string | null,
    storage: Pick<ReplayNavigationStorage, "getItem">,
): ReplayExactBuildFilter | null {
    if (!key) return null;
    try {
        const raw = storage.getItem(key);
        return raw ? normalizeReplayExactBuildFilter(JSON.parse(raw) as Partial<ReplayExactBuildFilter>) : null;
    } catch {
        return null;
    }
}

export function encodeReplayUqlParam(query: string): string {
    return encodeBase64UrlText(query);
}

export function decodeReplayUqlParam(value: string | null): string | null {
    if (!value) return null;
    try {
        const query = decodeBase64UrlText(value).trim();
        return query.length > 0 && query.length <= 2000 ? query : null;
    } catch {
        return null;
    }
}

export function readReplayUqlFilter(
    key: string | null,
    storage: Pick<ReplayNavigationStorage, "getItem">,
): string | null {
    if (!key) return null;
    try {
        const value = storage.getItem(key)?.trim() ?? "";
        return value.length > 0 && value.length <= 2000 ? value : null;
    } catch {
        return null;
    }
}

function normalizeReplayEntryQuerySpec(input: unknown): UmaLogsQuerySpec | null {
    const result = validateUmaLogsQuerySpec(input, "entries");
    return result.ok ? result.spec : null;
}

export function encodeReplayEntryQuerySpecParam(querySpec: UmaLogsQuerySpec): string {
    return encodeBase64UrlJson(querySpec);
}

export function decodeReplayEntryQuerySpecParam(value: string | null): UmaLogsQuerySpec | null {
    if (!value) return null;
    try {
        return normalizeReplayEntryQuerySpec(decodeBase64UrlJson(value));
    } catch {
        return null;
    }
}

export function readReplayEntryQuerySpec(
    key: string | null,
    storage: Pick<ReplayNavigationStorage, "getItem">,
): UmaLogsQuerySpec | null {
    if (!key) return null;
    try {
        const raw = storage.getItem(key);
        return raw ? normalizeReplayEntryQuerySpec(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

export function clearReplayNavigationParams(params: URLSearchParams): URLSearchParams {
    for (const name of REPLAY_NAVIGATION_PARAMS) params.delete(name);
    return params;
}

function createSessionKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setReplayExactBuildNavigation(
    params: URLSearchParams,
    build: ReplayExactBuildFilter,
    storage: ReplayNavigationStorage,
): URLSearchParams {
    clearReplayNavigationParams(params);
    const key = createSessionKey("umalogs-replay-build");
    storage.setItem(key, JSON.stringify(build));
    params.set("tab", "replays");
    params.set("replayCardId", String(build.cardId));
    params.set("replayBuildKey", key);
    params.set("replayBuild", encodeReplayExactBuildParam(build));
    params.set("replayAutoRun", "1");
    return params;
}

export function setReplayEntryQueryNavigation(
    params: URLSearchParams,
    querySpec: UmaLogsQuerySpec,
    storage: ReplayNavigationStorage,
): URLSearchParams {
    clearReplayNavigationParams(params);
    const key = createSessionKey("umalogs-replay-entry-spec");
    storage.setItem(key, JSON.stringify(querySpec));
    params.set("tab", "replays");
    params.set("replayEntryQuerySpecKey", key);
    params.set("replayEntryQuerySpec", encodeReplayEntryQuerySpecParam(querySpec));
    params.set("replayAutoRun", "1");
    return params;
}

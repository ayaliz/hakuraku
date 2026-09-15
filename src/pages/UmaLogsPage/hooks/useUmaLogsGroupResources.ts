import { useCallback, useEffect, useRef, useState } from "react";

import type { SkillStats } from "../../MultiRacePage/types";
import { UMA_LOGS_API_BASE } from "../../../features/umalogs/api/config";
import type { GroupSkillDetailPayload } from "../skillCache";
import { deserializeSkillOverviewStats } from "../deserialize";
import type {
    GroupDeckData,
    GroupPanelData,
    GroupSkillDetailResponse,
    GroupSkillOverviewResponse,
} from "../umaLogsTypes";

type DeckRequest = {
    key: string;
    style: number;
    sort: "pop" | "winRate";
    minPopPct: number;
};

type KeyedValue<T> = {
    key: string;
    value: T;
};

type KeyedError = {
    key: string;
    message: string;
};

const EMPTY_SKILL_DETAIL_CACHE = new Map<number, GroupSkillDetailPayload>();
const EMPTY_SKILL_DETAIL_LOADING_IDS = new Set<number>();

async function fetchJson<T>(url: string, signal: AbortSignal, missingMessage: string): Promise<T> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} - ${missingMessage}`);
    return await response.json() as T;
}

export function useUmaLogsGroupResources({
    cmId,
    courseId,
    fetchPanel,
    fetchSkillOverview,
    deckRequest,
    apiBase = UMA_LOGS_API_BASE,
}: {
    cmId: string | null;
    courseId: number;
    fetchPanel: boolean;
    fetchSkillOverview: boolean;
    deckRequest: DeckRequest | null;
    apiBase?: string;
}) {
    const groupKey = `${cmId ?? ""}:${courseId}`;
    const panelKey = groupKey;
    const skillKey = groupKey;
    const deckKey = deckRequest ? `${groupKey}:${deckRequest.key}` : null;
    const [loadedPanel, setLoadedPanel] = useState<KeyedValue<GroupPanelData> | null>(null);
    const [panelLoadingKey, setPanelLoadingKey] = useState<string | null>(null);
    const [panelError, setPanelError] = useState<KeyedError | null>(null);
    const [loadedDeck, setLoadedDeck] = useState<KeyedValue<GroupDeckData> | null>(null);
    const [deckLoadingKey, setDeckLoadingKey] = useState<string | null>(null);
    const [deckError, setDeckError] = useState<KeyedError | null>(null);
    const [loadedSkillOverview, setLoadedSkillOverview] = useState<KeyedValue<Map<number, SkillStats>> | null>(null);
    const [skillOverviewLoadingKey, setSkillOverviewLoadingKey] = useState<string | null>(null);
    const [skillOverviewError, setSkillOverviewError] = useState<KeyedError | null>(null);
    const [skillDetailCache, setSkillDetailCache] = useState<KeyedValue<Map<number, GroupSkillDetailPayload>> | null>(null);
    const [skillDetailLoadingIds, setSkillDetailLoadingIds] = useState<KeyedValue<Set<number>> | null>(null);
    const detailControllersRef = useRef(new Map<number, AbortController>());
    const currentGroupKeyRef = useRef(groupKey);
    currentGroupKeyRef.current = groupKey;

    useEffect(() => {
        if (!fetchPanel || !cmId || loadedPanel?.key === panelKey) return;
        const controller = new AbortController();
        setPanelLoadingKey(panelKey);
        setPanelError(null);
        void fetchJson<GroupPanelData>(
            `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/panel-data`,
            controller.signal,
            "group panel data not found",
        ).then((value) => {
            setLoadedPanel({ key: panelKey, value });
        }).catch((error: Error) => {
            if (error.name !== "AbortError") setPanelError({ key: panelKey, message: error.message });
        }).finally(() => {
            if (!controller.signal.aborted) setPanelLoadingKey((key) => key === panelKey ? null : key);
        });
        return () => controller.abort();
    }, [apiBase, cmId, courseId, fetchPanel, loadedPanel?.key, panelKey]);

    useEffect(() => {
        if (!deckRequest || !deckKey || !cmId || loadedDeck?.key === deckKey) return;
        const controller = new AbortController();
        const params = new URLSearchParams({
            style: String(deckRequest.style),
            sort: deckRequest.sort,
            minPopPct: String(deckRequest.minPopPct),
            limit: "20",
        });
        setDeckLoadingKey(deckKey);
        setDeckError(null);
        void fetchJson<GroupDeckData>(
            `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/deck-data?${params.toString()}`,
            controller.signal,
            "group deck data not found",
        ).then((value) => {
            setLoadedDeck({ key: deckKey, value });
        }).catch((error: Error) => {
            if (error.name !== "AbortError") setDeckError({ key: deckKey, message: error.message });
        }).finally(() => {
            if (!controller.signal.aborted) setDeckLoadingKey((key) => key === deckKey ? null : key);
        });
        return () => controller.abort();
    }, [apiBase, cmId, courseId, deckKey, deckRequest?.minPopPct, deckRequest?.sort, deckRequest?.style, loadedDeck?.key]);

    useEffect(() => {
        if (!fetchSkillOverview || !cmId || loadedSkillOverview?.key === skillKey) return;
        const controller = new AbortController();
        setSkillOverviewLoadingKey(skillKey);
        setSkillOverviewError(null);
        void fetchJson<GroupSkillOverviewResponse>(
            `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/skills`,
            controller.signal,
            "group skill data not found",
        ).then((value) => {
            setLoadedSkillOverview({ key: skillKey, value: deserializeSkillOverviewStats(value.skillStats) });
        }).catch((error: Error) => {
            if (error.name !== "AbortError") setSkillOverviewError({ key: skillKey, message: error.message });
        }).finally(() => {
            if (!controller.signal.aborted) setSkillOverviewLoadingKey((key) => key === skillKey ? null : key);
        });
        return () => controller.abort();
    }, [apiBase, cmId, courseId, fetchSkillOverview, loadedSkillOverview?.key, skillKey]);

    useEffect(() => {
        const controllers = detailControllersRef.current;
        return () => {
            for (const controller of controllers.values()) controller.abort();
            controllers.clear();
        };
    }, [groupKey]);

    const loadSkillDetail = useCallback((skillId: number) => {
        if (!cmId || detailControllersRef.current.has(skillId)) return;
        if (skillDetailCache?.key === groupKey && skillDetailCache.value.has(skillId)) return;

        const requestGroupKey = groupKey;
        const controller = new AbortController();
        detailControllersRef.current.set(skillId, controller);
        setSkillDetailLoadingIds((current) => {
            const next = current?.key === requestGroupKey ? new Set(current.value) : new Set<number>();
            next.add(skillId);
            return { key: requestGroupKey, value: next };
        });

        void fetchJson<GroupSkillDetailResponse>(
            `${apiBase}/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/skills/${skillId}`,
            controller.signal,
            "skill detail not found",
        ).then((value) => {
            if (currentGroupKeyRef.current !== requestGroupKey) return;
            setSkillDetailCache((current) => {
                const next = current?.key === requestGroupKey ? new Map(current.value) : new Map<number, GroupSkillDetailPayload>();
                next.set(skillId, { buckets: value.buckets, winBreakdown: value.winBreakdown });
                return { key: requestGroupKey, value: next };
            });
        }).catch((error: Error) => {
            if (error.name !== "AbortError" && currentGroupKeyRef.current === requestGroupKey) {
                setSkillOverviewError({ key: requestGroupKey, message: error.message });
            }
        }).finally(() => {
            if (detailControllersRef.current.get(skillId) === controller) detailControllersRef.current.delete(skillId);
            if (!controller.signal.aborted && currentGroupKeyRef.current === requestGroupKey) {
                setSkillDetailLoadingIds((current) => {
                    if (current?.key !== requestGroupKey) return current;
                    const next = new Set(current.value);
                    next.delete(skillId);
                    return { key: requestGroupKey, value: next };
                });
            }
        });
    }, [apiBase, cmId, courseId, groupKey, skillDetailCache]);

    return {
        panelData: loadedPanel?.key === panelKey ? loadedPanel.value : null,
        panelDataLoading: panelLoadingKey === panelKey,
        panelDataError: panelError?.key === panelKey ? panelError.message : null,
        deckData: deckKey && loadedDeck?.key === deckKey ? loadedDeck.value : null,
        deckDataLoading: deckKey !== null && deckLoadingKey === deckKey,
        deckDataError: deckKey && deckError?.key === deckKey ? deckError.message : null,
        skillOverview: loadedSkillOverview?.key === skillKey ? loadedSkillOverview.value : null,
        skillOverviewLoading: skillOverviewLoadingKey === skillKey,
        skillOverviewError: skillOverviewError?.key === skillKey ? skillOverviewError.message : null,
        skillDetailCache: skillDetailCache?.key === groupKey ? skillDetailCache.value : EMPTY_SKILL_DETAIL_CACHE,
        skillDetailLoadingIds: skillDetailLoadingIds?.key === groupKey ? skillDetailLoadingIds.value : EMPTY_SKILL_DETAIL_LOADING_IDS,
        loadSkillDetail,
    };
}

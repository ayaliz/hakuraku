import { useCallback, useEffect, useState } from "react";

import { UMA_LOGS_API_BASE } from "../../../features/umalogs/api/config";
import type { Manifest, UmaLogsData } from "../umaLogsTypes";

type LoadedDataset = {
    cmId: string;
    data: UmaLogsData;
};

async function fetchJson<T>(url: string, signal: AbortSignal, missingMessage: string): Promise<T> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} - ${missingMessage}`);
    return await response.json() as T;
}

export function useUmaLogsDataset(apiBase = UMA_LOGS_API_BASE) {
    const [manifest, setManifest] = useState<Manifest | null>(null);
    const [manifestError, setManifestError] = useState<string | null>(null);
    const [selectedCmId, setSelectedCmId] = useState<string | null>(null);
    const [loadedDataset, setLoadedDataset] = useState<LoadedDataset | null>(null);
    const [loadingCmId, setLoadingCmId] = useState<string | null>(null);
    const [datasetError, setDatasetError] = useState<{ cmId: string; message: string } | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        setManifestError(null);
        void fetchJson<Manifest>(
            `${apiBase}/api/umalogs/manifest`,
            controller.signal,
            "manifest not found",
        ).then((value) => {
            setManifest(value);
            const latest = value.datasets[value.datasets.length - 1];
            if (latest) setSelectedCmId((current) => current ?? latest.cmId);
        }).catch((error: Error) => {
            if (error.name !== "AbortError") setManifestError(error.message);
        });
        return () => controller.abort();
    }, [apiBase]);

    useEffect(() => {
        if (!selectedCmId || loadedDataset?.cmId === selectedCmId) {
            setLoadingCmId(null);
            return;
        }
        const requestedCmId = selectedCmId;
        const controller = new AbortController();
        setLoadingCmId(requestedCmId);
        setDatasetError(null);
        void fetchJson<UmaLogsData>(
            `${apiBase}/api/umalogs/${encodeURIComponent(requestedCmId)}/summary`,
            controller.signal,
            "summary not found",
        ).then((value) => {
            setLoadedDataset({ cmId: requestedCmId, data: value });
        }).catch((error: Error) => {
            if (error.name !== "AbortError") setDatasetError({ cmId: requestedCmId, message: error.message });
        }).finally(() => {
            if (!controller.signal.aborted) setLoadingCmId((current) => current === requestedCmId ? null : current);
        });
        return () => controller.abort();
    }, [apiBase, loadedDataset?.cmId, selectedCmId]);

    const selectCm = useCallback((cmId: string) => {
        setDatasetError(null);
        setSelectedCmId((current) => current === cmId ? current : cmId);
    }, []);

    const data = selectedCmId && loadedDataset?.cmId === selectedCmId ? loadedDataset.data : null;
    const error = manifestError ?? (datasetError?.cmId === selectedCmId ? datasetError.message : null);
    const loading = error === null && (
        manifest === null
        || (selectedCmId !== null && (loadingCmId === selectedCmId || data === null))
    );

    return {
        manifest,
        selectedCmId,
        selectCm,
        data,
        loading,
        error,
    };
}

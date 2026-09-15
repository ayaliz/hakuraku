const rawUmaLogsApiBase = (import.meta.env.VITE_UMALOGS_API_BASE ?? "").trim();

export const UMA_LOGS_API_BASE = rawUmaLogsApiBase === "same-origin"
    ? ""
    : rawUmaLogsApiBase.replace(/\/$/, "");

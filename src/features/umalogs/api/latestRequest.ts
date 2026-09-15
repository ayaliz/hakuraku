import { useCallback, useEffect, useRef } from "react";

export type LatestRequestResult<T> =
    | { status: "success"; value: T }
    | { status: "error"; error: Error }
    | { status: "cancelled" };

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Runs at most one current request. Starting or cancelling a request makes every
 * older completion inert, even when the underlying operation ignores AbortSignal.
 */
export class LatestRequestRunner {
    private current: AbortController | null = null;

    async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<LatestRequestResult<T>> {
        this.current?.abort();
        const controller = new AbortController();
        this.current = controller;

        try {
            const value = await operation(controller.signal);
            if (controller.signal.aborted || this.current !== controller) return { status: "cancelled" };
            return { status: "success", value };
        } catch (error) {
            if (controller.signal.aborted || this.current !== controller) return { status: "cancelled" };
            return { status: "error", error: asError(error) };
        } finally {
            if (this.current === controller) this.current = null;
        }
    }

    cancel(): void {
        this.current?.abort();
        this.current = null;
    }
}

export function useLatestRequest(): {
    runLatest: <T>(operation: (signal: AbortSignal) => Promise<T>) => Promise<LatestRequestResult<T>>;
    cancelLatest: () => void;
} {
    const runnerRef = useRef<LatestRequestRunner | null>(null);
    if (runnerRef.current === null) runnerRef.current = new LatestRequestRunner();

    useEffect(() => () => runnerRef.current?.cancel(), []);

    const runLatest = useCallback(
        <T,>(operation: (signal: AbortSignal) => Promise<T>) => runnerRef.current!.run(operation),
        [],
    );
    const cancelLatest = useCallback(() => runnerRef.current?.cancel(), []);

    return { runLatest, cancelLatest };
}

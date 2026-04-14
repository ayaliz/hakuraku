import React, { useEffect, useRef } from "react";

export function MobilePanelExpandDialog({
    open,
    title,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open || typeof document === "undefined") return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);

    useEffect(() => {
        if (!open || typeof window === "undefined" || window.innerWidth > 768) return;

        const panel = panelRef.current;
        const orientation = (screen as Screen & {
            orientation?: {
                lock?: (orientation: "landscape" | "portrait") => Promise<void>;
                unlock?: () => void;
            };
        }).orientation;

        let enteredFullscreen = false;

        const enterImmersive = async () => {
            try {
                if (panel && document.fullscreenElement !== panel && typeof panel.requestFullscreen === "function") {
                    await panel.requestFullscreen();
                    enteredFullscreen = true;
                }
            } catch {
                // Ignore: fullscreen is best-effort on mobile browsers.
            }

            try {
                if (orientation?.lock) {
                    await orientation.lock("landscape");
                }
            } catch {
                // Ignore: orientation lock is best-effort.
            }
        };

        void enterImmersive();

        return () => {
            try {
                orientation?.unlock?.();
            } catch {
                // Ignore unlock failures.
            }

            try {
                if (enteredFullscreen && document.fullscreenElement === panel && typeof document.exitFullscreen === "function") {
                    void document.exitFullscreen();
                }
            } catch {
                // Ignore exit failures.
            }
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="sa-mobile-chart-dialog" onClick={onClose}>
            <div
                ref={panelRef}
                className="sa-mobile-chart-dialog-panel"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <div className="sa-mobile-chart-dialog-header">
                    <div className="sa-mobile-chart-dialog-title">{title}</div>
                    <button
                        type="button"
                        className="sa-mobile-chart-dialog-close"
                        onClick={onClose}
                        aria-label="Close expanded chart"
                    >
                        Close
                    </button>
                </div>
                <div className="sa-mobile-chart-dialog-body">
                    {children}
                </div>
            </div>
        </div>
    );
}

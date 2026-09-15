import { useMemo, useState } from "react";
import "./PaginationControls.css";

type PaginationControlsProps = {
    currentPage: number;
    totalItems: number;
    pageSize?: number;
    disabled?: boolean;
    showSummary?: boolean;
    allowPageJump?: boolean;
    className?: string;
    onPageChange: (page: number) => void;
};

function buildPageTokens(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const tokens: Array<number | "ellipsis"> = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) tokens.push("ellipsis");
    for (let page = start; page <= end; page++) tokens.push(page);
    if (end < totalPages - 1) tokens.push("ellipsis");

    tokens.push(totalPages);
    return tokens;
}

export default function PaginationControls({
    currentPage,
    totalItems,
    pageSize = 20,
    disabled = false,
    showSummary = true,
    allowPageJump = false,
    className,
    onPageChange,
}: PaginationControlsProps) {
    const [jumpToken, setJumpToken] = useState<number | null>(null);
    const [jumpValue, setJumpValue] = useState("");
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const pageTokens = useMemo(() => buildPageTokens(safePage, totalPages), [safePage, totalPages]);

    if (totalPages <= 1) return null;

    const startItem = (safePage - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, safePage * pageSize);
    const rootClassName = ["pagination-controls", className].filter(Boolean).join(" ");
    const openPageJump = (index: number) => {
        setJumpToken(index);
        setJumpValue("");
    };
    const closePageJump = () => {
        setJumpToken(null);
        setJumpValue("");
    };
    const commitPageJump = () => {
        const requestedPage = Number.parseInt(jumpValue, 10);
        if (Number.isFinite(requestedPage)) onPageChange(Math.min(totalPages, Math.max(1, requestedPage)));
        closePageJump();
    };

    return (
        <div className={rootClassName}>
            <div className="pagination-controls-buttons">
                <button
                    type="button"
                    className="pagination-controls-button"
                    disabled={disabled || safePage <= 1}
                    onClick={() => onPageChange(safePage - 1)}
                >
                    Prev
                </button>
                {pageTokens.map((token, index) => (
                    token === "ellipsis" ? jumpToken === index ? (
                        <input
                            key={`ellipsis-${index}`}
                            className="pagination-controls-jump-input"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={jumpValue}
                            placeholder="#"
                            aria-label={`Page number, from 1 to ${totalPages}`}
                            autoFocus
                            onChange={event => setJumpValue(event.target.value.replace(/\D/g, ""))}
                            onBlur={commitPageJump}
                            onKeyDown={event => {
                                if (event.key === "Enter") commitPageJump();
                                if (event.key === "Escape") closePageJump();
                            }}
                        />
                    ) : allowPageJump ? (
                        <button key={`ellipsis-${index}`} type="button" className="pagination-controls-ellipsis pagination-controls-ellipsis-button" title="Jump to page" aria-label="Jump to a page" onClick={() => openPageJump(index)}>...</button>
                    ) : (
                        <span key={`ellipsis-${index}`} className="pagination-controls-ellipsis">...</span>
                    ) : (
                        <button
                            key={token}
                            type="button"
                            className={`pagination-controls-button${token === safePage ? " is-active" : ""}`}
                            disabled={disabled || token === safePage}
                            onClick={() => onPageChange(token)}
                        >
                            {token}
                        </button>
                    )
                ))}
                <button
                    type="button"
                    className="pagination-controls-button"
                    disabled={disabled || safePage >= totalPages}
                    onClick={() => onPageChange(safePage + 1)}
                >
                    Next
                </button>
            </div>
            {showSummary && (
                <div className="pagination-controls-summary">
                    Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of {totalItems.toLocaleString()}
                </div>
            )}
        </div>
    );
}

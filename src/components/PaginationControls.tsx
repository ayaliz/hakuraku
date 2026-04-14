import { useMemo } from "react";
import "./PaginationControls.css";

type PaginationControlsProps = {
    currentPage: number;
    totalItems: number;
    pageSize?: number;
    disabled?: boolean;
    showSummary?: boolean;
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
    className,
    onPageChange,
}: PaginationControlsProps) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    const pageTokens = useMemo(() => buildPageTokens(safePage, totalPages), [safePage, totalPages]);

    if (totalPages <= 1) return null;

    const startItem = (safePage - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, safePage * pageSize);
    const rootClassName = ["pagination-controls", className].filter(Boolean).join(" ");

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
                    token === "ellipsis" ? (
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

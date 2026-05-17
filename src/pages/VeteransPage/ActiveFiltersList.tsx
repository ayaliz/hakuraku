import React from "react";
import { Button } from "react-bootstrap";
import { BaseFilter, getFilterStats, getFilterStarOptions } from "./types";

interface ActiveFiltersListProps {
    filters: Record<string, BaseFilter[]>;
    config: Record<string, any>;
    onRemove: (stateKey: string, filterId: string) => void;
    onClearAll: () => void;
}

const ActiveFiltersList: React.FC<ActiveFiltersListProps> = ({ filters, config, onRemove, onClearAll }) => {
    const hasActiveFilters = Object.values(filters).some(list => list.length > 0);
    if (!hasActiveFilters) return null;

    const stateKeyToConfig = Object.values(config).reduce((acc: Record<string, any>, curr: any) => {
        acc[curr.stateKey] = curr;
        return acc;
    }, {});

    const formatStats = (filter: BaseFilter): string => {
        const stats = getFilterStats(filter);
        if (stats.length <= 2) {
            return stats.join(" + ");
        }
        return `${stats.slice(0, 2).join(" + ")} +${stats.length - 2}`;
    };

    const formatStars = (filter: BaseFilter): string => {
        const starOptions = getFilterStarOptions(filter);
        const starLabel = starOptions.map(value => `${value}\u2605`).join(" / ");
        return filter.type === "Total" ? `Total ${starLabel}` : `Legacy ${starLabel}`;
    };

    return (
        <div className="vet-active-filters">
            <div className="vet-active-filters-header">
                <strong className="vet-active-filters-title">Active Filters:</strong>
                <Button
                    variant="outline-danger"
                    size="sm"
                    className="vet-active-filters-clear"
                    onClick={onClearAll}
                >
                    Clear
                </Button>
            </div>
            <div className="vet-active-filters-list">
                {Object.keys(filters).map((stateKey) => {
                    const filterList = filters[stateKey];
                    const conf = stateKeyToConfig[stateKey];
                    if (!conf) return null;

                    return filterList.map(filter => (
                        <button
                            type="button"
                            key={filter.id}
                            className={`vet-active-filter-chip vet-active-filter-chip--${stateKey}`}
                            onClick={() => onRemove(stateKey, filter.id)}
                        >
                            <span>{formatStats(filter)}</span>
                            <span className={`vet-active-filter-chip-stars${filter.type === "Legacy" ? " legacy" : ""}`}>
                                {formatStars(filter)}
                            </span>
                            <span className="vet-active-filter-chip-remove" aria-hidden="true">
                                {"\u00D7"}
                            </span>
                        </button>
                    ));
                })}
            </div>
        </div>
    );
};

export default ActiveFiltersList;

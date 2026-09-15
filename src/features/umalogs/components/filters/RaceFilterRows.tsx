import {
    RACE_FILTER_FIELDS,
    type ReplayRaceFilter,
    type ReplayRaceFilterField,
} from "../../model/raceFilters";

type RaceFilterRowsProps = {
    filters: ReplayRaceFilter[];
    onUpdate: (id: string, patch: Partial<ReplayRaceFilter>) => void;
    onRemove: (id: string) => void;
    emptyMessage?: string;
};

export default function RaceFilterRows({
    filters,
    onUpdate,
    onRemove,
    emptyMessage = "No race-wide conditions.",
}: RaceFilterRowsProps) {
    if (filters.length === 0) {
        return <div className="rpl-empty-team-filters">{emptyMessage}</div>;
    }

    return <div className="rpl-race-filter-list">
        {filters.map((filter) => <div key={filter.id} className="rpl-race-filter-row">
            <select
                className="exp-select"
                value={filter.field}
                onChange={(event) => onUpdate(filter.id, { field: event.target.value as ReplayRaceFilterField })}
            >
                {RACE_FILTER_FIELDS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
            <select
                className="exp-select rpl-race-filter-operator"
                value={filter.operator}
                onChange={(event) => onUpdate(filter.id, { operator: event.target.value as ReplayRaceFilter["operator"] })}
            >
                <option value="=">=</option>
                <option value="<=">&lt;=</option>
                <option value=">=">&gt;=</option>
            </select>
            <input
                className="exp-stat-input rpl-race-filter-value"
                type="number"
                min={0}
                value={filter.value}
                onChange={(event) => onUpdate(filter.id, { value: Math.max(0, Number(event.target.value) || 0) })}
            />
            <button type="button" className="exp-remove-btn" onClick={() => onRemove(filter.id)}>x</button>
        </div>)}
    </div>;
}

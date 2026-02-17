import React from "react";
import { Badge, Button } from "react-bootstrap";
import { BaseFilter } from "./types";

interface ActiveFiltersListProps {
    filters: Record<string, BaseFilter[]>;
    config: Record<string, any>;
    onRemove: (stateKey: string, filterId: string) => void;
    onClearAll: () => void;
}

const ActiveFiltersList: React.FC<ActiveFiltersListProps> = ({ filters, config, onRemove, onClearAll }) => {

    const hasActiveFilters = Object.values(filters).some(list => list.length > 0);
    if (!hasActiveFilters) return null;

    const stateKeyToConfig = Object.values(config).reduce((acc: any, curr: any) => {
        acc[curr.stateKey] = curr;
        return acc;
    }, {});

    return (
        <div className="mb-4">
            <div className="d-flex align-items-center mb-2">
                <strong className="me-2" style={{ marginRight: '0.5rem' }}>Active Filters:</strong>
                <Button 
                    variant="outline-danger" 
                    size="sm" 
                    style={{ padding: '0px 8px', fontSize: '0.8rem' }}
                    onClick={onClearAll}
                >
                    Clear
                </Button>
            </div>
            <div className="mt-2">
                {Object.keys(filters).map((stateKey) => {
                    const filterList = filters[stateKey];
                    const conf = stateKeyToConfig[stateKey];
                    if (!conf) return null;

                    return filterList.map(filter => {
                        const isLegacy = filter.type === 'Legacy';
                        return (
                            <Badge
                                key={filter.id}
                                bg="info"
                                className="mb-2"
                                style={{ 
                                    fontSize: '0.9rem', 
                                    cursor: 'pointer', 
                                    backgroundColor: conf.color, 
                                    marginRight: '1rem',
                                    color: '#fff' 
                                }}
                                onClick={() => onRemove(stateKey, filter.id)}
                            >
                                {filter.stat} <span style={{ color: isLegacy ? '#FFD700' : 'inherit' }}>{filter.stars}★</span> ✕
                            </Badge>
                        );
                    });
                })}
            </div>
        </div>
    );
};

export default ActiveFiltersList;
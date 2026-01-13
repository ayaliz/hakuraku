import React from "react";
import { Button } from "react-bootstrap";
import InlineFilterSelector, { SelectorType } from "./InlineFilterSelector";

interface FilterConfigItem {
    categoryId: number;
    stateKey: string;
    label: string;
    color: string;
    selectorType: SelectorType;
}

interface FilterToolbarProps {
    config: Record<string, FilterConfigItem>;
    visibilityState: Record<string, boolean>;
    onToggle: (key: string | null) => void;
    onAddFilter: (stateKey: string, filter: any) => void;
    getAvailableStats: (categoryId: number) => string[];
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({ 
    config, 
    visibilityState, 
    onToggle, 
    onAddFilter, 
    getAvailableStats 
}) => {
    return (
        <>
            {Object.keys(config).map((key) => {
                const conf = config[key];
                const isVisible = visibilityState[key];
                
                return (
                    <span key={key} style={{ position: 'relative', display: 'inline-block', marginRight: '1rem' }}>
                        <Button
                            onClick={() => onToggle(isVisible ? null : key)}
                            style={{ backgroundColor: conf.color, borderColor: conf.color }}
                        >
                            {conf.label}
                        </Button>
                        <InlineFilterSelector
                            show={isVisible}
                            onAddFilter={(f) => onAddFilter(conf.stateKey, f)}
                            onClose={() => onToggle(null)}
                            availableStats={getAvailableStats(conf.categoryId)}
                            title={conf.label}
                            color={conf.color}
                            selectorType={conf.selectorType}
                        />
                    </span>
                );
            })}
        </>
    );
};

export default FilterToolbar;
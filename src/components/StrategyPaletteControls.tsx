import React, { useEffect, useState } from "react";
import "./StrategyPaletteControls.css";

const STRATEGY_PALETTE_STORAGE_KEY = "umalogsColorblindMode";

function readInitialColorblindMode(): boolean {
    try {
        return localStorage.getItem(STRATEGY_PALETTE_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function useStrategyPalette(
    defaultColors: Record<number, string>,
    colorblindColors: Record<number, string>,
) {
    const [colorblindMode, setColorblindMode] = useState(readInitialColorblindMode);

    useEffect(() => {
        try {
            localStorage.setItem(STRATEGY_PALETTE_STORAGE_KEY, colorblindMode ? "1" : "0");
        } catch {
            // The preference remains available for this page view.
        }
    }, [colorblindMode]);

    return {
        colorblindMode,
        setColorblindMode,
        strategyColors: colorblindMode ? colorblindColors : defaultColors,
    };
}

type StrategyPaletteControlsProps = {
    colorblindMode: boolean;
    onToggle: () => void;
    strategyColors: Record<number, string>;
    strategyOrder: readonly number[];
    strategyNames: Readonly<Record<number, string>>;
};

const StrategyPaletteControls: React.FC<StrategyPaletteControlsProps> = ({
    colorblindMode,
    onToggle,
    strategyColors,
    strategyOrder,
    strategyNames,
}) => (
    <div className="strategy-palette-controls">
        <button
            type="button"
            className={`strategy-palette-toggle${colorblindMode ? " is-on" : ""}`}
            onClick={onToggle}
            aria-pressed={colorblindMode}
        >
            <span className="strategy-palette-toggle-knob" aria-hidden="true" />
            <span>Colorblind palette</span>
            <span className="strategy-palette-toggle-state">{colorblindMode ? "On" : "Off"}</span>
        </button>
        <div className="strategy-palette-legend" aria-label="Running style color legend">
            {strategyOrder.map((style) => (
                <span className="strategy-palette-legend-item" key={style}>
                    <i aria-hidden="true" style={{ background: strategyColors[style] }} />
                    {strategyNames[style]}
                </span>
            ))}
        </div>
    </div>
);

export default StrategyPaletteControls;

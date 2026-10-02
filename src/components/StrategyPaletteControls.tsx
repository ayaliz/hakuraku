import React, { useEffect, useId, useMemo, useState } from "react";
import { Modal } from "react-bootstrap";
import "./StrategyPaletteControls.css";

const STRATEGY_PALETTE_STORAGE_KEY = "umalogsColorblindMode";
const CUSTOM_COLORS_STORAGE_KEY = "umalogsCustomStyleColors";
type CustomPalettes = { standard: Record<number, string>; colorblind: Record<number, string> };

function readCustomPalettes(): CustomPalettes {
    const result: CustomPalettes = { standard: {}, colorblind: {} };
    try {
        const saved = JSON.parse(localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY) ?? "{}");
        for (const mode of ["standard", "colorblind"] as const) {
            for (const [style, color] of Object.entries(saved?.[mode] ?? {})) {
                if (/^[1-6]$/.test(style) && typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
                    result[mode][Number(style)] = color;
                }
            }
        }
    } catch { /* Ignore unavailable storage and invalid saved colors. */ }
    return result;
}

function colorHex(color: string): string {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    const rgb = color.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
    return rgb ? `#${rgb.slice(1).map(value => Number(value).toString(16).padStart(2, "0")).join("")}` : "#000000";
}

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
    const [customPalettes, setCustomPalettes] = useState(readCustomPalettes);
    const palette = colorblindMode ? "colorblind" : "standard";
    const strategyColors = useMemo(() => ({ ...(colorblindMode ? colorblindColors : defaultColors), ...customPalettes[palette] }),
        [colorblindMode, colorblindColors, defaultColors, customPalettes, palette]);

    useEffect(() => {
        try {
            localStorage.setItem(STRATEGY_PALETTE_STORAGE_KEY, colorblindMode ? "1" : "0");
        } catch {
            // The preference remains available for this page view.
        }
    }, [colorblindMode]);

    useEffect(() => {
        try { localStorage.setItem(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(customPalettes)); }
        catch { /* Custom colors still work for this page view. */ }
    }, [customPalettes]);

    return {
        colorblindMode,
        setColorblindMode,
        strategyColors,
        hasCustomColors: Object.keys(customPalettes[palette]).length > 0,
        setStrategyColor: (style: number, color: string) => {
            if (!(style in defaultColors) || !/^#[0-9a-f]{6}$/i.test(color)) return;
            setCustomPalettes(previous => ({ ...previous, [palette]: { ...previous[palette], [style]: color.toLowerCase() } }));
        },
        resetStrategyColors: () => setCustomPalettes(previous => ({ ...previous, [palette]: {} })),
    };
}

type StrategyPaletteControlsProps = {
    colorblindMode: boolean;
    onToggle: () => void;
    strategyColors: Record<number, string>;
    strategyOrder: readonly number[];
    strategyNames: Readonly<Record<number, string>>;
    onColorChange: (style: number, color: string) => void;
    onResetColors: () => void;
    hasCustomColors: boolean;
};

function StyleColorInput({ name, color, onChange }: { name: string; color: string; onChange: (color: string) => void }) {
    const hex = colorHex(color);
    const [draft, setDraft] = useState(hex);
    useEffect(() => setDraft(hex), [hex]);
    return <div className="strategy-color-row">
        <span>{name}</span>
        <input type="color" value={hex} aria-label={`${name} color`} onChange={event => onChange(event.target.value)} />
        <input type="text" value={draft} aria-label={`${name} hex color`} className="strategy-color-hex"
            maxLength={7} spellCheck={false} autoComplete="off"
            onChange={event => {
                const value = event.target.value;
                setDraft(value);
                if (/^#[0-9a-f]{6}$/i.test(value)) onChange(value);
            }} onBlur={() => setDraft(hex)} />
    </div>;
}

const StrategyPaletteControls: React.FC<StrategyPaletteControlsProps> = ({
    colorblindMode,
    onToggle,
    strategyColors,
    strategyOrder,
    strategyNames,
    onColorChange,
    onResetColors,
    hasCustomColors,
}) => {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const titleId = useId();
    return <>
    <div className="strategy-palette-controls">
        <div className="strategy-palette-actions">
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
        <button type="button" className="strategy-palette-settings" aria-label="Customize running style colors"
            title="Customize running style colors" aria-haspopup="dialog" aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="m9 3-.7 2.6-2 .9L4 5.8 2 9.2l1.8 1.9v1.8L2 14.8l2 3.4 2.3-.7 2 .9L9 21h6l.7-2.6 2-.9 2.3.7 2-3.4-1.8-1.9v-1.8L22 9.2l-2-3.4-2.3.7-2-.9L15 3Z" />
                <circle cx="12" cy="12" r="3.3" />
            </svg>
        </button>
        </div>
        <div className="strategy-palette-legend" aria-label="Running style color legend">
            {strategyOrder.map((style) => (
                <span className="strategy-palette-legend-item" key={style}>
                    <i aria-hidden="true" style={{ background: strategyColors[style] }} />
                    {strategyNames[style]}
                </span>
            ))}
        </div>
    </div>
    <Modal show={settingsOpen} onHide={() => setSettingsOpen(false)} centered className="strategy-color-modal" aria-labelledby={titleId}>
        <Modal.Header closeButton closeVariant="white"><Modal.Title id={titleId}>Running style colors</Modal.Title></Modal.Header>
        <Modal.Body>
            {strategyOrder.map(style => <StyleColorInput key={style} name={strategyNames[style]} color={strategyColors[style]}
                onChange={color => onColorChange(style, color)} />)}
        </Modal.Body>
        <Modal.Footer>
            <button type="button" className="strategy-color-reset" disabled={!hasCustomColors} onClick={onResetColors}>Reset colors</button>
            <button type="button" className="strategy-color-done" onClick={() => setSettingsOpen(false)}>Done</button>
        </Modal.Footer>
    </Modal>
    </>;
};

export default StrategyPaletteControls;

import React, { useEffect, useRef, useState } from "react";
import { STRATEGY_NAMES } from "./constants";
import { getCharaIcon } from "./utils";
import "./SynergyEntitySelect.css";

export type SynergyEntityInfo = {
    key: string;         // `${cardId}_${strategy}`
    cardId: number;
    strategy: number;
    charaId: number;
    cardName: string;
    charaName: string;
    totalCoApps: number;
    strategyLabel?: string;
};

interface SynergyEntitySelectProps {
    entities: SynergyEntityInfo[];
    value: string | null;
    onChange: (key: string | null) => void;
    strategyColors: Record<number, string>;
    allowEmpty?: boolean;
    emptyLabel?: string;
    emptyStrategyLabel?: string;
    selectedOverride?: SynergyEntityInfo;
}

const SynergyEntitySelect: React.FC<SynergyEntitySelectProps> = ({
    entities,
    value,
    onChange,
    strategyColors,
    allowEmpty = false,
    emptyLabel = "Any Uma",
    emptyStrategyLabel = "Any outfit / style",
    selectedOverride,
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = value === null && allowEmpty
        ? null
        : entities.find(e => e.key === value) ?? selectedOverride ?? entities[0] ?? null;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    if (!selected && !allowEmpty) return null;

    const q = search.toLowerCase();
    const filtered = q
        ? entities.filter(e =>
            e.cardName.toLowerCase().includes(q) ||
            e.charaName.toLowerCase().includes(q) ||
            (e.strategyLabel ?? STRATEGY_NAMES[e.strategy] ?? "").toLowerCase().includes(q))
        : entities;

    const selectedIcon = selected ? getCharaIcon(`${selected.charaId}_${selected.cardId}`) : null;
    const selectedStratColor = selected ? strategyColors[selected.strategy] ?? "#718096" : "#718096";
    const selectedStrategy = selected
        ? selected.strategyLabel ?? STRATEGY_NAMES[selected.strategy] ?? `Strategy ${selected.strategy}`
        : emptyStrategyLabel;

    return (
        <div ref={ref} className="syn-select" onKeyDown={event => {
            if (event.key === "Escape") setOpen(false);
        }}>
            <button type="button" onClick={() => setOpen(o => !o)} className="syn-select-btn" aria-haspopup="listbox" aria-expanded={open}>
                <div className="syn-select-portrait">
                    <div className="syn-select-ring" style={{ background: selectedStratColor }} />
                    {selectedIcon && (
                        <img src={selectedIcon} alt="" className="syn-select-img"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    )}
                    {!selectedIcon && <span className="syn-select-placeholder" aria-hidden="true">Any</span>}
                </div>
                <span className="syn-select-text">
                    <span className="syn-select-name">{selected?.charaName ?? emptyLabel}</span>
                    <span className="syn-select-strategy" style={{ color: selectedStratColor }}>{selectedStrategy}</span>
                </span>
                <span className="syn-select-arrow">v</span>
            </button>

            {open && (
                <div className="syn-select-dropdown">
                    <div className="syn-select-search">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="syn-select-input"
                        />
                    </div>
                    <div className="syn-select-list" role="listbox">
                        {allowEmpty && !q && (
                            <div
                                role="option"
                                aria-selected={value === null}
                                onClick={() => { onChange(null); setOpen(false); }}
                                className={`syn-select-option${value === null ? " syn-select-option--active" : ""}`}
                            >
                                <div className="syn-select-portrait"><div className="syn-select-ring" style={{ background: "#718096" }} /><span className="syn-select-placeholder" aria-hidden="true">Any</span></div>
                                <span><span className="syn-select-option-name">{emptyLabel}</span><span className="syn-select-option-strategy" style={{ color: "#a0aec0" }}>{emptyStrategyLabel}</span></span>
                            </div>
                        )}
                        {filtered.length === 0 ? (
                            <div className="syn-select-no-matches">No matches</div>
                        ) : filtered.map(e => {
                            const icon = getCharaIcon(`${e.charaId}_${e.cardId}`);
                            const stratColor = strategyColors[e.strategy] ?? "#718096";
                            const isSelected = e.key === (value ?? entities[0]?.key);
                            return (
                                <div
                                    key={e.key}
                                    role="option"
                                    aria-selected={isSelected}
                                    onClick={() => { onChange(e.key); setOpen(false); }}
                                    className={`syn-select-option${isSelected ? " syn-select-option--active" : ""}`}
                                >
                                    <div className="syn-select-portrait">
                                        <div className="syn-select-ring" style={{ background: stratColor }} />
                                        {icon && (
                                            <img src={icon} alt="" className="syn-select-img"
                                                onError={e2 => { (e2.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                        )}
                                    </div>
                                    <span>
                                        <span className="syn-select-option-name">{e.charaName}</span>
                                        <span className="syn-select-option-strategy" style={{ color: stratColor }}>{e.strategyLabel ?? STRATEGY_NAMES[e.strategy] ?? `Strategy ${e.strategy}`}</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SynergyEntitySelect;

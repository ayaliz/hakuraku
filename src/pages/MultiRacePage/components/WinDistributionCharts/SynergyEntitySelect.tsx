import React, { useEffect, useRef, useState } from "react";
import { STRATEGY_NAMES } from "./constants";
import { getCharaIcon } from "./utils";

export type SynergyEntityInfo = {
    key: string;         // `${cardId}_${strategy}`
    cardId: number;
    strategy: number;
    charaId: number;
    cardName: string;
    charaName: string;
    totalCoApps: number;
};

interface SynergyEntitySelectProps {
    entities: SynergyEntityInfo[];
    value: string | null;
    onChange: (key: string) => void;
    strategyColors: Record<number, string>;
}

const SynergyEntitySelect: React.FC<SynergyEntitySelectProps> = ({ entities, value, onChange, strategyColors }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = entities.find(e => e.key === value) ?? entities[0] ?? null;

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

    if (!selected) return null;

    const q = search.toLowerCase();
    const filtered = q
        ? entities.filter(e =>
            e.cardName.toLowerCase().includes(q) ||
            e.charaName.toLowerCase().includes(q) ||
            (STRATEGY_NAMES[e.strategy] ?? "").toLowerCase().includes(q))
        : entities;

    const selectedIcon = getCharaIcon(`${selected.charaId}_${selected.cardId}`);
    const selectedStratColor = strategyColors[selected.strategy] ?? "#718096";

    return (
        <div ref={ref} className="syn-select">
            <button type="button" onClick={() => setOpen(o => !o)} className="syn-select-btn">
                <div className="syn-select-portrait">
                    <div className="syn-select-ring" style={{ background: selectedStratColor }} />
                    {selectedIcon && (
                        <img src={selectedIcon} alt="" className="syn-select-img"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    )}
                </div>
                <span className="syn-select-text">
                    <span className="syn-select-name">{selected.charaName}</span>
                    <span className="syn-select-strategy" style={{ color: selectedStratColor }}>{STRATEGY_NAMES[selected.strategy] ?? `Strategy ${selected.strategy}`}</span>
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
                    <div className="syn-select-list">
                        {filtered.length === 0 ? (
                            <div className="syn-select-no-matches">No matches</div>
                        ) : filtered.map(e => {
                            const icon = getCharaIcon(`${e.charaId}_${e.cardId}`);
                            const stratColor = strategyColors[e.strategy] ?? "#718096";
                            const isSelected = e.key === (value ?? entities[0]?.key);
                            return (
                                <div
                                    key={e.key}
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
                                        <span className="syn-select-option-strategy" style={{ color: stratColor }}>{STRATEGY_NAMES[e.strategy] ?? `Strategy ${e.strategy}`}</span>
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

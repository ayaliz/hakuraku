import React, { useState, useEffect, useRef } from "react";
import type { CharaVariant, SkillVariant, SupportCardVariant } from "./explorerShared";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import AssetLoader from "../../data/AssetLoader";

interface CharaSelectProps {
    variants: CharaVariant[];
    value: number | null;
    onChange: (cardId: number) => void;
}

interface SkillSelectProps {
    variants: SkillVariant[];
    value: number | null;
    onChange: (skillId: number) => void;
}

interface SupportCardSelectProps {
    variants: SupportCardVariant[];
    value: number | null;
    onChange: (supportCardId: number) => void;
}

export const CharaSelect: React.FC<CharaSelectProps> = ({ variants, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find(v => v.cardId === value) ?? variants[0] ?? null;

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
        ? variants.filter(v =>
            v.cardName.toLowerCase().includes(q) ||
            v.charaName.toLowerCase().includes(q))
        : variants;

    const selectedIcon = selected.cardId !== 0 ? getCharaIcon(`${selected.charaId}_${selected.cardId}`) : null;

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn" onClick={() => setOpen(o => !o)}>
                {selectedIcon && (
                    <div className="exp-chara-select-portrait">
                        <img src={selectedIcon} alt=""
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    </div>
                )}
                <span className="exp-name-block">
                    <span>{selected.charaName || selected.cardName}</span>
                    {selected.cardName !== selected.charaName && selected.cardName && (
                        <span className="exp-sublabel">{selected.cardName}</span>
                    )}
                </span>
                <span className="exp-chara-select-arrow">▾</span>
            </button>

            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="exp-chara-search-input"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map(v => {
                        const icon = v.cardId !== 0 ? getCharaIcon(`${v.charaId}_${v.cardId}`) : null;
                        return (
                            <div
                                key={v.cardId}
                                className={`exp-chara-select-option${v.cardId === value ? " active" : ""}`}
                                onClick={() => { onChange(v.cardId); setOpen(false); }}
                            >
                                {icon && (
                                    <div className="exp-chara-select-portrait">
                                        <img src={icon} alt=""
                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                    </div>
                                )}
                                <span className="exp-name-block">
                                    <span>{v.charaName || v.cardName}</span>
                                    {v.cardName !== v.charaName && v.cardName && (
                                        <span className="exp-sublabel">{v.cardName}</span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export const SkillSelect: React.FC<SkillSelectProps> = ({ variants, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find(v => v.skillId === value) ?? variants[0] ?? null;

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
        ? variants.filter(v => {
            const label = v.isInherit ? `${v.skillName} inherit` : v.skillName;
            return label.toLowerCase().includes(q);
        })
        : variants;

    const renderSkillLabel = (v: SkillVariant) => (
        <>
            <span>{v.skillName}</span>
            {v.isInherit && <span className="exp-skill-inherit-tag">(inherit)</span>}
        </>
    );

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn exp-chara-select-btn--skill" onClick={() => setOpen(o => !o)}>
                <span className="exp-name-block">
                    {renderSkillLabel(selected)}
                </span>
                <span className="exp-chara-select-arrow">▾</span>
            </button>

            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="exp-chara-search-input"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map(v => (
                        <div
                            key={v.skillId}
                            className={`exp-chara-select-option${v.skillId === value ? " active" : ""}`}
                            onClick={() => { onChange(v.skillId); setOpen(false); }}
                        >
                            <span className="exp-name-block">
                                {renderSkillLabel(v)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const SupportCardSelect: React.FC<SupportCardSelectProps> = ({ variants, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find(v => v.supportCardId === value) ?? variants[0] ?? null;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    useEffect(() => { if (open) inputRef.current?.focus(); else setSearch(""); }, [open]);

    if (!selected) return null;

    const q = search.toLowerCase();
    const filtered = q ? variants.filter(v => v.name.toLowerCase().includes(q)) : variants;

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn" onClick={() => setOpen(o => !o)}>
                <div className="exp-chara-select-portrait">
                    <img src={AssetLoader.getSupportCardIcon(selected.supportCardId)} alt=""
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                </div>
                <span className="exp-name-block">
                    <span>{selected.name}</span>
                </span>
                <span className="exp-chara-select-arrow">▾</span>
            </button>

            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input ref={inputRef} type="text" className="exp-chara-search-input"
                            placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map(v => (
                        <div key={v.supportCardId}
                            className={`exp-chara-select-option${v.supportCardId === value ? " active" : ""}`}
                            onClick={() => { onChange(v.supportCardId); setOpen(false); }}>
                            <div className="exp-chara-select-portrait">
                                <img src={AssetLoader.getSupportCardIcon(v.supportCardId)} alt=""
                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </div>
                            <span className="exp-name-block">
                                <span>{v.name}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

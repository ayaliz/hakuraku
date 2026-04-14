import { useState, useEffect, useRef } from "react";
import type { ReplayCharacterVariant } from "./replaysShared";
import type { SkillVariant, SupportCardVariant } from "./explorerShared";
import { getCharaIcon } from "../MultiRacePage/components/WinDistributionCharts/utils";
import AssetLoader from "../../data/AssetLoader";
import UMDatabaseWrapper from "../../data/UMDatabaseWrapper";

export function ReplayCharaSelect({
    variants,
    value,
    onChange,
    placeholder = "Any character",
}: {
    variants: ReplayCharacterVariant[];
    value: number | null;
    onChange: (cardId: number | null) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selected = variants.find((variant) => variant.cardId === value) ?? null;

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
        ? variants.filter((variant) => {
            const charaName = UMDatabaseWrapper.charas[variant.charaId]?.name ?? `Chara ${variant.charaId}`;
            const cardName = UMDatabaseWrapper.cards[variant.cardId]?.name ?? charaName;
            return charaName.toLowerCase().includes(normalizedSearch) || cardName.toLowerCase().includes(normalizedSearch);
        })
        : variants;

    const selectedIcon = selected ? getCharaIcon(`${selected.charaId}_${selected.cardId}`) : null;

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn" onClick={() => setOpen((current) => !current)}>
                {selected && selectedIcon && (
                    <div className="exp-chara-select-portrait">
                        <img
                            src={selectedIcon}
                            alt=""
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    </div>
                )}
                <span className="exp-name-block">
                    {selected ? (
                        <>
                            <span>{UMDatabaseWrapper.charas[selected.charaId]?.name ?? `Chara ${selected.charaId}`}</span>
                            {(UMDatabaseWrapper.cards[selected.cardId]?.name ?? "") !== (UMDatabaseWrapper.charas[selected.charaId]?.name ?? "") && (
                                <span className="exp-sublabel">{UMDatabaseWrapper.cards[selected.cardId]?.name}</span>
                            )}
                        </>
                    ) : (
                        <span>{placeholder}</span>
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
                            placeholder="Search..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <div
                        className={`exp-chara-select-option${value === null ? " active" : ""}`}
                        onClick={() => { onChange(null); setOpen(false); }}
                    >
                        <span className="exp-name-block">
                            <span>{placeholder}</span>
                        </span>
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map((variant) => {
                        const icon = getCharaIcon(`${variant.charaId}_${variant.cardId}`);
                        const charaName = UMDatabaseWrapper.charas[variant.charaId]?.name ?? `Chara ${variant.charaId}`;
                        const cardName = UMDatabaseWrapper.cards[variant.cardId]?.name ?? charaName;
                        return (
                            <div
                                key={variant.cardId}
                                className={`exp-chara-select-option${variant.cardId === value ? " active" : ""}`}
                                onClick={() => { onChange(variant.cardId); setOpen(false); }}
                            >
                                {icon && (
                                    <div className="exp-chara-select-portrait">
                                        <img
                                            src={icon}
                                            alt=""
                                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                                        />
                                    </div>
                                )}
                                <span className="exp-name-block">
                                    <span>{charaName}</span>
                                    {cardName !== charaName && <span className="exp-sublabel">{cardName}</span>}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function ReplaySkillSelect({
    variants,
    value,
    onChange,
}: {
    variants: SkillVariant[];
    value: number | null;
    onChange: (skillId: number | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = variants.find((variant) => variant.skillId === value) ?? null;

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
        ? variants.filter((variant) => variant.skillName.toLowerCase().includes(normalizedSearch))
        : variants;

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn exp-chara-select-btn--skill" onClick={() => setOpen((current) => !current)}>
                <span className="exp-name-block">
                    <span>{selected?.skillName ?? "Select skill"}</span>
                    {selected?.isInherit && <span className="exp-sublabel">(inherit)</span>}
                </span>
                <span className="exp-chara-select-arrow">v</span>
            </button>
            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="exp-chara-search-input"
                            placeholder="Search..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map((variant) => (
                        <div
                            key={variant.skillId}
                            className={`exp-chara-select-option${variant.skillId === value ? " active" : ""}`}
                            onClick={() => { onChange(variant.skillId); setOpen(false); }}
                        >
                            <span className="exp-name-block">
                                <span>{variant.skillName}</span>
                                {variant.isInherit && <span className="exp-sublabel">(inherit)</span>}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ReplaySupportCardSelect({
    variants,
    value,
    onChange,
}: {
    variants: SupportCardVariant[];
    value: number | null;
    onChange: (supportCardId: number | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const selected = variants.find((variant) => variant.supportCardId === value) ?? null;

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
        ? variants.filter((variant) => variant.name.toLowerCase().includes(normalizedSearch))
        : variants;

    return (
        <div className="exp-chara-select" ref={ref}>
            <button type="button" className="exp-chara-select-btn" onClick={() => setOpen((current) => !current)}>
                {selected && (
                    <div className="exp-chara-select-portrait">
                        <img
                            src={AssetLoader.getSupportCardIcon(selected.supportCardId)}
                            alt=""
                            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                    </div>
                )}
                <span className="exp-name-block">
                    <span>{selected?.name ?? "Select support card"}</span>
                </span>
                <span className="exp-chara-select-arrow">v</span>
            </button>
            {open && (
                <div className="exp-chara-select-dropdown">
                    <div className="exp-chara-search">
                        <input
                            ref={inputRef}
                            type="text"
                            className="exp-chara-search-input"
                            placeholder="Search..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    {filtered.length === 0 ? (
                        <div className="exp-chara-search-empty">No matches</div>
                    ) : filtered.map((variant) => (
                        <div
                            key={variant.supportCardId}
                            className={`exp-chara-select-option${variant.supportCardId === value ? " active" : ""}`}
                            onClick={() => { onChange(variant.supportCardId); setOpen(false); }}
                        >
                            <div className="exp-chara-select-portrait">
                                <img
                                    src={AssetLoader.getSupportCardIcon(variant.supportCardId)}
                                    alt=""
                                    onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                            </div>
                            <span className="exp-name-block">
                                <span>{variant.name}</span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

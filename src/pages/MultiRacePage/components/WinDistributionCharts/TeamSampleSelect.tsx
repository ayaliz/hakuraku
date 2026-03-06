import React, { useEffect, useRef, useState } from "react";
import AssetLoader from "../../../../data/AssetLoader";
import { STRATEGY_NAMES } from "./constants";

const STRATEGY_SHORT: Record<number, string> = { 1: "FR", 2: "PC", 3: "LS", 4: "EC", 5: "RU" };

export interface TeamSampleSelectMember {
    cardId: number;
    strategy: number;
    winRatePct: number;
}

export interface TeamSampleSelectOption {
    value: string;
    members: TeamSampleSelectMember[];
    samples: number;
}

interface TeamSampleSelectProps {
    value: string;
    options: TeamSampleSelectOption[];
    onChange: (value: string) => void;
    strategyColors: Record<number, string>;
}

const TeamSampleSelect: React.FC<TeamSampleSelectProps> = ({ value, options, onChange, strategyColors }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    const selected = options.find(o => o.value === value) ?? options[0] ?? null;
    if (!selected) return null;

    const renderMembers = (members: TeamSampleSelectMember[]) => (
        <div className="team-sample-select-members">
            {members.map((m, i) => {
                const src = AssetLoader.getCharaThumb(m.cardId);
                const styleColor = strategyColors[m.strategy] ?? "#718096";
                const styleShort = STRATEGY_SHORT[m.strategy] ?? `S${m.strategy}`;
                return (
                    <div key={i} className="team-sample-select-member">
                        <span className="team-sample-select-portrait" style={{ borderColor: styleColor }}>
                            {src && (
                                <img
                                    src={src}
                                    alt=""
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                />
                            )}
                        </span>
                        <span className="team-sample-select-style" style={{ color: styleColor }}>{styleShort}</span>
                        <span className="team-sample-select-win">{Math.round(m.winRatePct)}%</span>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div ref={ref} className="team-sample-select">
            <button type="button" className="team-sample-select-trigger" onClick={() => setOpen(o => !o)}>
                {renderMembers(selected.members)}
                <span className="team-sample-select-samples">({selected.samples})</span>
                <span className="team-sample-select-arrow">{open ? "▴" : "▾"}</span>
            </button>
            {open && (
                <div className="team-sample-select-menu">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`team-sample-select-option${opt.value === selected.value ? " is-selected" : ""}`}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            title={opt.members.map(m => `${STRATEGY_NAMES[m.strategy] ?? `Style ${m.strategy}`} ${Math.round(m.winRatePct)}%`).join(" · ")}
                        >
                            {renderMembers(opt.members)}
                            <span className="team-sample-select-samples">({opt.samples})</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeamSampleSelect;

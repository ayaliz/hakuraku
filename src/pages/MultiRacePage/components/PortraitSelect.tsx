import React, { useState, useRef, useEffect } from 'react';

export interface PortraitSelectOption {
    value: string;
    label: string;
    portrait?: string;
    indent?: boolean;
}

interface Props {
    value: string;
    defaultLabel: string;
    options: PortraitSelectOption[];
    onChange: (value: string) => void;
}

const PortraitSelect: React.FC<Props> = ({ value, defaultLabel, options, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const selected = value === 'all' ? null : options.find(o => o.value === value);

    return (
        <div ref={ref} className="portrait-select">
            <div className="portrait-select-trigger" onClick={() => setOpen(o => !o)}>
                {selected?.portrait
                    ? <img src={selected.portrait} className="portrait-select-img" alt="" />
                    : <span className="portrait-select-img-placeholder" />
                }
                <span className="portrait-select-label">{selected?.label ?? defaultLabel}</span>
                <span className="portrait-select-arrow">{open ? '▴' : '▾'}</span>
            </div>
            {open && (
                <div className="portrait-select-menu">
                    <div
                        className={`portrait-select-option${value === 'all' ? ' is-selected' : ''}`}
                        onClick={() => { onChange('all'); setOpen(false); }}
                    >
                        <span className="portrait-select-img-placeholder" />
                        <span className="portrait-select-label">{defaultLabel}</span>
                    </div>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            className={`portrait-select-option${opt.value === value ? ' is-selected' : ''}${opt.indent ? ' is-indent' : ''}`}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                        >
                            {opt.portrait
                                ? <img src={opt.portrait} className="portrait-select-img" alt="" />
                                : <span className="portrait-select-img-placeholder" />
                            }
                            <span className="portrait-select-label">{opt.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PortraitSelect;

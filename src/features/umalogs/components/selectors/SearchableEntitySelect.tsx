import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
} from "react";

export type EntitySelectKey = string | number;

export function filterSearchableItems<T>(
    items: readonly T[],
    query: string,
    getSearchText: (item: T) => string,
): T[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [...items];
    return items.filter((item) => getSearchText(item).toLocaleLowerCase().includes(normalizedQuery));
}

type SearchableEntitySelectProps<T, K extends EntitySelectKey> = {
    items: readonly T[];
    value: K | null;
    onChange: (value: K | null) => void;
    getKey: (item: T) => K;
    getSearchText: (item: T) => string;
    renderLabel: (item: T) => ReactNode;
    renderIcon?: (item: T) => ReactNode;
    placeholder: ReactNode;
    ariaLabel: string;
    allowEmpty?: boolean;
    emptyLabel?: ReactNode;
    fallbackToFirst?: boolean;
    hideWhenEmpty?: boolean;
    buttonClassName?: string;
};

export default function SearchableEntitySelect<T, K extends EntitySelectKey>({
    items,
    value,
    onChange,
    getKey,
    getSearchText,
    renderLabel,
    renderIcon,
    placeholder,
    ariaLabel,
    allowEmpty = false,
    emptyLabel = placeholder,
    fallbackToFirst = false,
    hideWhenEmpty = false,
    buttonClassName = "",
}: SearchableEntitySelectProps<T, K>) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const generatedId = useId().replace(/:/g, "");
    const listboxId = `entity-select-${generatedId}`;
    const selected = items.find((item) => Object.is(getKey(item), value))
        ?? (fallbackToFirst ? items[0] : null)
        ?? null;
    const filteredItems = useMemo(
        () => filterSearchableItems(items, search, getSearchText),
        [getSearchText, items, search],
    );
    const optionOffset = allowEmpty ? 1 : 0;
    const optionCount = filteredItems.length + optionOffset;

    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
        else setSearch("");
    }, [open]);

    useEffect(() => {
        if (!open) return;
        setHighlightedIndex((current) => optionCount === 0 ? -1 : Math.min(Math.max(current, 0), optionCount - 1));
    }, [open, optionCount]);

    if (hideWhenEmpty && items.length === 0) return null;

    const openDropdown = () => {
        setOpen(true);
        if (allowEmpty && value === null) {
            setHighlightedIndex(0);
            return;
        }
        const selectedIndex = filteredItems.findIndex((item) => Object.is(getKey(item), value));
        setHighlightedIndex(selectedIndex < 0 ? 0 : selectedIndex + optionOffset);
    };

    const closeDropdown = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) buttonRef.current?.focus();
    };

    const selectIndex = (index: number) => {
        if (allowEmpty && index === 0) {
            onChange(null);
            closeDropdown(true);
            return;
        }
        const item = filteredItems[index - optionOffset];
        if (!item) return;
        onChange(getKey(item));
        closeDropdown(true);
    };

    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeDropdown(true);
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((current) => optionCount === 0 ? -1 : Math.min(current + 1, optionCount - 1));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((current) => optionCount === 0 ? -1 : Math.max(current - 1, 0));
        } else if (event.key === "Enter" && highlightedIndex >= 0) {
            event.preventDefault();
            selectIndex(highlightedIndex);
        }
    };

    const optionId = (index: number) => `${listboxId}-option-${index}`;

    return <div
        className="exp-chara-select"
        ref={rootRef}
        onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
            setOpen(false);
        }}
    >
        <button
            ref={buttonRef}
            type="button"
            className={`exp-chara-select-btn${buttonClassName ? ` ${buttonClassName}` : ""}`}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            onClick={() => open ? closeDropdown() : openDropdown()}
            onKeyDown={(event) => {
                if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                    event.preventDefault();
                    openDropdown();
                }
            }}
        >
            {selected && renderIcon?.(selected)}
            <span className="exp-name-block">{selected ? renderLabel(selected) : placeholder}</span>
            <span className="exp-chara-select-arrow" aria-hidden="true">▾</span>
        </button>

        {open && <div className="exp-chara-select-dropdown">
            <div className="exp-chara-search">
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    className="exp-chara-search-input"
                    placeholder="Search…"
                    value={search}
                    aria-label={`Search ${ariaLabel.toLocaleLowerCase()}`}
                    aria-autocomplete="list"
                    aria-expanded="true"
                    aria-controls={listboxId}
                    aria-activedescendant={highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
                    onChange={(event) => {
                        const nextSearch = event.target.value;
                        const nextOptionCount = filterSearchableItems(items, nextSearch, getSearchText).length + optionOffset;
                        setSearch(nextSearch);
                        setHighlightedIndex(nextOptionCount > 0 ? 0 : -1);
                    }}
                    onKeyDown={handleInputKeyDown}
                />
            </div>
            <div id={listboxId} role="listbox" aria-label={ariaLabel}>
                {allowEmpty && <button
                    id={optionId(0)}
                    type="button"
                    role="option"
                    aria-selected={value === null}
                    className={`exp-chara-select-option${value === null ? " active" : ""}${highlightedIndex === 0 ? " is-highlighted" : ""}`}
                    onMouseEnter={() => setHighlightedIndex(0)}
                    onClick={() => selectIndex(0)}
                >
                    <span className="exp-name-block">{emptyLabel}</span>
                </button>}
                {filteredItems.map((item, index) => {
                    const itemIndex = index + optionOffset;
                    const key = getKey(item);
                    const selectedItem = Object.is(key, value);
                    return <button
                        id={optionId(itemIndex)}
                        key={key}
                        type="button"
                        role="option"
                        aria-selected={selectedItem}
                        className={`exp-chara-select-option${selectedItem ? " active" : ""}${highlightedIndex === itemIndex ? " is-highlighted" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(itemIndex)}
                        onClick={() => selectIndex(itemIndex)}
                    >
                        {renderIcon?.(item)}
                        <span className="exp-name-block">{renderLabel(item)}</span>
                    </button>;
                })}
            </div>
            {filteredItems.length === 0 && <div className="exp-chara-search-empty">No matches</div>}
        </div>}
    </div>;
}

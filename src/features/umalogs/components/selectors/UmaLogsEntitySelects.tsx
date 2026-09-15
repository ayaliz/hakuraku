import AssetLoader from "../../../../data/AssetLoader";
import UMDatabaseWrapper from "../../../../data/UMDatabaseWrapper";
import SearchableEntitySelect from "./SearchableEntitySelect";

type CharacterOption = {
    cardId: number;
    charaId: number;
    charaName?: string;
    cardName?: string;
};

type SkillOption = {
    skillId: number;
    skillName: string;
    isInherit?: boolean;
};

type SupportCardOption = {
    supportCardId: number;
    name: string;
};

function characterLabels(option: CharacterOption) {
    if (option.cardId === 0) return { primary: option.cardName || "Any Uma", secondary: "" };
    const primary = UMDatabaseWrapper.charas[option.charaId]?.name || option.charaName || `Chara ${option.charaId}`;
    const cardName = UMDatabaseWrapper.cards[option.cardId]?.name || option.cardName || primary;
    return { primary, secondary: cardName === primary ? "" : cardName };
}

function portrait(src: string | null) {
    return src ? <div className="exp-chara-select-portrait">
        <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
    </div> : null;
}

export function CharacterSelect({
    variants,
    value,
    onChange,
    allowEmpty = false,
    fallbackToFirst = false,
    placeholder = "Any Uma",
}: {
    variants: readonly CharacterOption[];
    value: number | null;
    onChange: (cardId: number | null) => void;
    allowEmpty?: boolean;
    fallbackToFirst?: boolean;
    placeholder?: string;
}) {
    return <SearchableEntitySelect
        items={variants}
        value={value}
        onChange={onChange}
        getKey={(option) => option.cardId}
        getSearchText={(option) => {
            const labels = characterLabels(option);
            return `${labels.primary} ${labels.secondary}`;
        }}
        renderLabel={(option) => {
            const labels = characterLabels(option);
            return <><span>{labels.primary}</span>{labels.secondary && <span className="exp-sublabel">{labels.secondary}</span>}</>;
        }}
        renderIcon={(option) => option.cardId === 0 ? null : portrait(AssetLoader.getCharaThumb(option.cardId))}
        placeholder={<span>{placeholder}</span>}
        emptyLabel={<span>{placeholder}</span>}
        ariaLabel="Uma"
        allowEmpty={allowEmpty}
        fallbackToFirst={fallbackToFirst}
        hideWhenEmpty={fallbackToFirst}
    />;
}

export function SkillSelect({
    variants,
    value,
    onChange,
    fallbackToFirst = false,
}: {
    variants: readonly SkillOption[];
    value: number | null;
    onChange: (skillId: number | null) => void;
    fallbackToFirst?: boolean;
}) {
    return <SearchableEntitySelect
        items={variants}
        value={value}
        onChange={onChange}
        getKey={(option) => option.skillId}
        getSearchText={(option) => `${option.skillName}${option.isInherit ? " inherit" : ""}`}
        renderLabel={(option) => <><span>{option.skillName}</span>{option.isInherit && <span className="exp-skill-inherit-tag">(inherit)</span>}</>}
        placeholder={<span>Select skill</span>}
        ariaLabel="Skill"
        fallbackToFirst={fallbackToFirst}
        hideWhenEmpty={fallbackToFirst}
        buttonClassName="exp-chara-select-btn--skill"
    />;
}

export function SupportCardSelect({
    variants,
    value,
    onChange,
    fallbackToFirst = false,
}: {
    variants: readonly SupportCardOption[];
    value: number | null;
    onChange: (supportCardId: number | null) => void;
    fallbackToFirst?: boolean;
}) {
    return <SearchableEntitySelect
        items={variants}
        value={value}
        onChange={onChange}
        getKey={(option) => option.supportCardId}
        getSearchText={(option) => option.name}
        renderLabel={(option) => <span>{option.name}</span>}
        renderIcon={(option) => portrait(AssetLoader.getSupportCardIcon(option.supportCardId))}
        placeholder={<span>Select support card</span>}
        ariaLabel="Support card"
        fallbackToFirst={fallbackToFirst}
        hideWhenEmpty={fallbackToFirst}
    />;
}

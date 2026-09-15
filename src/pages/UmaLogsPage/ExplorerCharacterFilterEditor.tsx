import type { Dispatch, SetStateAction } from "react";
import {
    STYLE_BREAKDOWN_STRATEGY_ORDER,
    STRATEGY_NAMES,
} from "../MultiRacePage/components/WinDistributionCharts/constants";
import RequirementEditor from "../../features/umalogs/components/filters/RequirementEditor";
import { CharacterSelect } from "../../features/umalogs/components/selectors/UmaLogsEntitySelects";
import {
    createCharacterRequirement,
    defaultStatValueForProperty,
} from "../../features/umalogs/model/filterOptions";
import {
    SUPPORT_CARD_LB_ANY,
    type CharacterFeature,
    type CharacterRequirement,
    type CharaVariant,
    type SkillVariant,
    type SupportCardVariant,
} from "../../features/umalogs/model/filterTypes";

type ExplorerCharacterFilterEditorProps = {
    features: CharacterFeature[];
    setFeatures: Dispatch<SetStateAction<CharacterFeature[]>>;
    cardVariants: CharaVariant[];
    skillVariants: SkillVariant[];
    supportCardVariants: SupportCardVariant[];
    hideLowQuantity: boolean;
    onHideLowQuantityChange: (value: boolean) => void;
    minimumEntries: number;
    onMinimumEntriesChange: (value: number) => void;
};

function createId(): string {
    return `${Date.now()}-${Math.random()}`;
}

export default function ExplorerCharacterFilterEditor({
    features,
    setFeatures,
    cardVariants,
    skillVariants,
    supportCardVariants,
    hideLowQuantity,
    onHideLowQuantityChange,
    minimumEntries,
    onMinimumEntriesChange,
}: ExplorerCharacterFilterEditorProps) {
    const newRequirement = () => createCharacterRequirement(createId(), skillVariants, supportCardVariants);

    const addFeature = () => setFeatures((previous) => [...previous, {
        id: createId(),
        characterMatchMode: "is",
        cardMode: "include",
        cardId: cardVariants[0]?.cardId ?? null,
        cardStrategy: null,
        requirements: [newRequirement()],
    }]);

    const removeFeature = (id: string) => {
        setFeatures((previous) => previous.filter((feature) => feature.id !== id));
    };

    const updateFeature = (id: string, patch: Partial<CharacterFeature>) => {
        setFeatures((previous) => previous.map((feature) => feature.id === id ? { ...feature, ...patch } : feature));
    };

    const addRequirement = (featureId: string) => {
        setFeatures((previous) => previous.map((feature) => feature.id === featureId ? {
            ...feature,
            requirements: [...feature.requirements, newRequirement()],
        } : feature));
    };

    const removeRequirement = (featureId: string, requirementId: string) => {
        setFeatures((previous) => previous.map((feature) => feature.id === featureId ? {
            ...feature,
            requirements: feature.requirements.filter((requirement) => requirement.id !== requirementId),
        } : feature));
    };

    const updateRequirement = (
        featureId: string,
        requirementId: string,
        patch: Partial<CharacterRequirement>,
    ) => {
        setFeatures((previous) => previous.map((feature) => {
            if (feature.id !== featureId) return feature;
            return {
                ...feature,
                requirements: feature.requirements.map((requirement) => {
                    if (requirement.id !== requirementId) return requirement;
                    const next = { ...requirement, ...patch };
                    if (patch.property === "skill" && next.skillId === null) {
                        next.skillId = skillVariants[0]?.skillId ?? null;
                    }
                    if (patch.property === "supportCard" && next.supportCardId === null) {
                        next.supportCardId = supportCardVariants[0]?.supportCardId ?? null;
                    }
                    if (patch.property === "supportCard") {
                        next.supportCardLb = next.supportCardLb ?? SUPPORT_CARD_LB_ANY;
                    }
                    if (patch.property !== undefined) {
                        next.statValue = defaultStatValueForProperty(patch.property);
                    }
                    return next;
                }),
            };
        }));
    };

    return (
        <>
            <div className="exp-feature-list">
                {features.map((feature) => (
                    <div key={feature.id} className="exp-feature-card">
                        <div className="exp-feature-header">
                            <span className="exp-feature-label">Uma</span>
                            <div className="exp-toggle">
                                <button
                                    type="button"
                                    className={`exp-toggle-btn${feature.characterMatchMode === "is" ? " active" : ""}`}
                                    onClick={() => updateFeature(feature.id, { characterMatchMode: "is" })}
                                >
                                    is
                                </button>
                                <button
                                    type="button"
                                    className={`exp-toggle-btn${feature.characterMatchMode === "isNot" ? " active" : ""}`}
                                    onClick={() => updateFeature(feature.id, { characterMatchMode: "isNot" })}
                                >
                                    is not
                                </button>
                            </div>
                            <CharacterSelect
                                variants={cardVariants}
                                value={feature.cardId}
                                fallbackToFirst
                                onChange={(cardId) => updateFeature(feature.id, { cardId })}
                            />
                            <span className="exp-as-label">as</span>
                            <select
                                className="exp-select"
                                value={feature.cardStrategy ?? ""}
                                onChange={(event) => updateFeature(feature.id, {
                                    cardStrategy: event.target.value === "" ? null : Number(event.target.value),
                                })}
                            >
                                <option value="">any style</option>
                                {STYLE_BREAKDOWN_STRATEGY_ORDER.map((strategy) => (
                                    <option key={strategy} value={strategy}>
                                        {STRATEGY_NAMES[strategy] ?? `Strategy ${strategy}`}
                                    </option>
                                ))}
                            </select>
                            <div className="exp-feature-actions">
                                <div className="exp-toggle exp-toggle--card-mode">
                                    <button
                                        type="button"
                                        className={`exp-toggle-btn${feature.cardMode === "include" ? " active" : ""}`}
                                        onClick={() => updateFeature(feature.id, { cardMode: "include" })}
                                    >
                                        Include
                                    </button>
                                    <button
                                        type="button"
                                        className={`exp-toggle-btn${feature.cardMode === "exclude" ? " active" : ""}`}
                                        onClick={() => updateFeature(feature.id, { cardMode: "exclude" })}
                                    >
                                        Exclude
                                    </button>
                                </div>
                                <button type="button" className="exp-remove-btn" onClick={() => removeFeature(feature.id)}>x</button>
                            </div>
                        </div>

                        <div className="exp-feature-reqs">
                            {feature.requirements.map((requirement) => (
                                <RequirementEditor
                                    key={requirement.id}
                                    requirement={requirement}
                                    skillVariants={skillVariants}
                                    supportCardVariants={supportCardVariants}
                                    aptitudeInput="grade"
                                    fallbackToFirstEntity
                                    onUpdate={(patch) => updateRequirement(feature.id, requirement.id, patch)}
                                    onRemove={() => removeRequirement(feature.id, requirement.id)}
                                />
                            ))}
                        </div>
                        <button type="button" className="exp-add-btn" onClick={() => addRequirement(feature.id)}>+ Add requirement</button>
                    </div>
                ))}
            </div>
            <div className="exp-filter-footer">
                <button type="button" className="exp-add-btn" onClick={addFeature}>+ Add Uma filter</button>
                <label className="exp-quantity-filter">
                    <input
                        type="checkbox"
                        checked={hideLowQuantity}
                        onChange={(event) => onHideLowQuantityChange(event.target.checked)}
                    />
                    <span>Hide entries with quantity less than</span>
                    <input
                        type="number"
                        className="exp-stat-input exp-quantity-input"
                        min={0}
                        value={minimumEntries}
                        onChange={(event) => onMinimumEntriesChange(Math.max(0, Number(event.target.value) || 0))}
                    />
                </label>
            </div>
        </>
    );
}

import {
    APTITUDE_GRADE_OPTIONS,
    PROPERTY_LABELS,
    PROPERTY_OPTIONS,
    SUPPORT_CARD_LB_OPTIONS,
} from "../../model/filterOptions";
import type {
    CharacterRequirement,
    FilterProperty,
    SkillFilterMode,
    SkillVariant,
    SupportCardVariant,
} from "../../model/filterTypes";
import { SkillSelect, SupportCardSelect } from "../selectors/UmaLogsEntitySelects";

type RequirementEditorProps = {
    requirement: CharacterRequirement;
    skillVariants: readonly SkillVariant[];
    supportCardVariants: readonly SupportCardVariant[];
    onUpdate: (patch: Partial<CharacterRequirement>) => void;
    onRemove: () => void;
    aptitudeInput?: "number" | "grade";
    fallbackToFirstEntity?: boolean;
};

const isAptitudeProperty = (property: FilterProperty) =>
    property === "aptGround" || property === "aptDistance" || property === "aptStyle";

function ComparisonToggle({ requirement, onUpdate }: Pick<RequirementEditorProps, "requirement" | "onUpdate">) {
    return <div className="exp-toggle">
        <button type="button" className={`exp-toggle-btn${requirement.statOp === ">" ? " active" : ""}`} onClick={() => onUpdate({ statOp: ">" })}>{">"}</button>
        <button type="button" className={`exp-toggle-btn${requirement.statOp === "=" ? " active" : ""}`} onClick={() => onUpdate({ statOp: "=" })}>=</button>
        <button type="button" className={`exp-toggle-btn${requirement.statOp === "<" ? " active" : ""}`} onClick={() => onUpdate({ statOp: "<" })}>&lt;</button>
    </div>;
}

export default function RequirementEditor({
    requirement,
    skillVariants,
    supportCardVariants,
    onUpdate,
    onRemove,
    aptitudeInput = "number",
    fallbackToFirstEntity = false,
}: RequirementEditorProps) {
    const hasNumericValue = requirement.property !== "none"
        && requirement.property !== "skill"
        && requirement.property !== "supportCard"
        && requirement.property !== "isDebuffer";
    const useGradeSelect = aptitudeInput === "grade" && isAptitudeProperty(requirement.property);

    return <div className="exp-condition-row exp-condition-row--feature">
        <select
            className="exp-select"
            value={requirement.truthMode}
            onChange={(event) => onUpdate({ truthMode: event.target.value === "requireNot" ? "requireNot" : "require" })}
        >
            <option value="require">requires</option>
            <option value="requireNot">requires not</option>
        </select>
        <select
            className="exp-select"
            value={requirement.property}
            onChange={(event) => onUpdate({ property: event.target.value as FilterProperty })}
        >
            {PROPERTY_OPTIONS.map((property) => (
                <option key={property} value={property}>{PROPERTY_LABELS[property]}</option>
            ))}
        </select>

        {hasNumericValue && <>
            <ComparisonToggle requirement={requirement} onUpdate={onUpdate} />
            {useGradeSelect ? <select
                className="exp-select"
                value={requirement.statValue}
                onChange={(event) => onUpdate({ statValue: Number(event.target.value) })}
            >
                {APTITUDE_GRADE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select> : <input
                type="number"
                className="exp-stat-input"
                value={requirement.statValue}
                min={0}
                onChange={(event) => onUpdate({ statValue: Number(event.target.value) || 0 })}
            />}
        </>}

        {requirement.property === "skill" && <>
            <select
                className="exp-select exp-select--wide"
                value={requirement.skillMode}
                onChange={(event) => onUpdate({ skillMode: event.target.value as SkillFilterMode })}
            >
                <option value="learned">learned</option>
                <option value="activated">activated</option>
            </select>
            <SkillSelect
                variants={skillVariants}
                value={requirement.skillId}
                fallbackToFirst={fallbackToFirstEntity}
                onChange={(skillId) => onUpdate({ skillId })}
            />
        </>}

        {requirement.property === "supportCard" && <>
            <div className="exp-toggle">
                <button type="button" className={`exp-toggle-btn${requirement.supportCardPresent ? " active" : ""}`} onClick={() => onUpdate({ supportCardPresent: true })}>used</button>
                <button type="button" className={`exp-toggle-btn${!requirement.supportCardPresent ? " active" : ""}`} onClick={() => onUpdate({ supportCardPresent: false })}>not used</button>
            </div>
            <SupportCardSelect
                variants={supportCardVariants}
                value={requirement.supportCardId}
                fallbackToFirst={fallbackToFirstEntity}
                onChange={(supportCardId) => onUpdate({ supportCardId })}
            />
            <select
                className="exp-select"
                value={requirement.supportCardLb}
                onChange={(event) => onUpdate({ supportCardLb: Number(event.target.value) })}
            >
                {SUPPORT_CARD_LB_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </>}

        <button type="button" className="exp-remove-btn" onClick={onRemove}>×</button>
    </div>;
}

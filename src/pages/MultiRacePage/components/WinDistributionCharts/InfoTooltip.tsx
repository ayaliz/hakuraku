import React from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";

interface InfoTooltipProps {
    id: string;
    tip: React.ReactNode;
    className?: string;
    placement?: React.ComponentProps<typeof OverlayTrigger>["placement"];
    label?: string;
    ariaLabel?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({
    id,
    tip,
    className = "sa-info-icon",
    placement = "top",
    label = "Info",
    ariaLabel = "More information",
}) => (
    <OverlayTrigger
        trigger={["hover", "focus"]}
        placement={placement}
        overlay={<Tooltip id={id}>{tip}</Tooltip>}
    >
        <button type="button" className={className} aria-label={ariaLabel}>
            {label}
        </button>
    </OverlayTrigger>
);

export default InfoTooltip;

import React from "react";
import { Nav } from "react-bootstrap";
import {
    UMA_LOGS_SECTIONS,
    UMA_LOGS_SECTION_LABELS,
    type UmaLogsSection,
} from "../model/sections";

type UmaLogsSectionNavProps = {
    section: UmaLogsSection;
    onSectionChange: (section: UmaLogsSection) => void;
};

const UmaLogsSectionNav: React.FC<UmaLogsSectionNavProps> = ({
    section,
    onSectionChange,
}) => (
    <Nav variant="tabs" className="uma-section-nav">
        {UMA_LOGS_SECTIONS.map((candidate) => (
            <Nav.Item key={candidate}>
                <Nav.Link
                    active={section === candidate}
                    onClick={() => onSectionChange(candidate)}
                    className="uma-section-link"
                >
                    {UMA_LOGS_SECTION_LABELS[candidate]}
                </Nav.Link>
            </Nav.Item>
        ))}
    </Nav>
);

export default UmaLogsSectionNav;

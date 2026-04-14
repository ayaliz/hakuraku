import React from "react";
import SupportCardPanel from "../MultiRacePage/components/WinDistributionCharts/SupportCardPanel";
import type { SupportCardSummaryRow } from "./umaLogsTypes";

interface CardUsageModalProps {
    open: boolean;
    onClose: () => void;
    rows: SupportCardSummaryRow[] | undefined;
}

const CardUsageModal: React.FC<CardUsageModalProps> = ({ open, onClose, rows }) => {
    if (!open) return null;
    return (
        <div className="cdt-overlay" onClick={onClose}>
            <div className="cdt-modal ca-cards-modal" onClick={e => e.stopPropagation()}>
                <div className="cdt-header">
                    <h3 className="cdt-title">Support Card Usage</h3>
                    <button className="cdt-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="cdt-content">
                    <SupportCardPanel rows={rows} />
                </div>
            </div>
        </div>
    );
};

export default CardUsageModal;

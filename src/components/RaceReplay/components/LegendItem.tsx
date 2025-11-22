import React from "react";
import { LEGEND_ITEM_GAP_X, LEGEND_ITEM_GAP_Y, LEGEND_SWATCH_GAP } from "../RaceReplay.constants";

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <span className="d-inline-flex align-items-center" style={{ whiteSpace: "nowrap", marginRight: LEGEND_ITEM_GAP_X, marginBottom: LEGEND_ITEM_GAP_Y }}>
        <span style={{ width: 12, height: 12, background: color, border: "1px solid #888", display: "inline-block", marginRight: LEGEND_SWATCH_GAP, borderRadius: 2 }} />
        <span style={{ fontSize: 12 }}>{label}</span>
    </span>
);

export default LegendItem;

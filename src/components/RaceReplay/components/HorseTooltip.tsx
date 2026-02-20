import React from "react";
import { HorseHoverEntry } from "../hooks/useCanvasOverlay";

interface HorseTooltipProps {
    hoveredHorse: { idx: number; x: number; y: number; containerW: number };
    entry: HorseHoverEntry | undefined;
    name: string;
}

const HorseTooltip: React.FC<HorseTooltipProps> = ({ hoveredHorse, entry, name }) => {
    if (!entry) return null;

    const speed = (entry.speed / 100).toFixed(2);
    const accelV = entry.accel / 100;
    const accelStr = (accelV > 0 ? "+" : "") + accelV.toFixed(2);
    const hpStr = entry.maxHp > 0
        ? `HP: ${Math.round(entry.hp)}/${Math.round(entry.maxHp)} (${((entry.hp / entry.maxHp) * 100).toFixed(1)}%)`
        : null;

    const tipY = Math.max(hoveredHorse.y - 8, 4);
    const flipLeft = hoveredHorse.x > hoveredHorse.containerW / 2;
    const tipStyle = flipLeft
        ? { right: hoveredHorse.containerW - hoveredHorse.x + 12, top: tipY }
        : { left: hoveredHorse.x + 12, top: tipY };

    return (
        <div className="replay-horse-tooltip" style={tipStyle}>
            {name && <div className="replay-horse-tooltip-name">{name}</div>}
            <div>Dist: {entry.distance.toFixed(1)} m &nbsp; Lane: {Math.round(entry.lanePosition)}</div>
            <div>Speed: {speed} m/s &nbsp; Accel: {accelStr} m/s²</div>
            {entry.targetSpeedMin !== undefined && entry.targetSpeedMax !== undefined && (
                entry.targetSpeedMin === entry.targetSpeedMax
                    ? <div>Target: {entry.targetSpeedMin.toFixed(2)} m/s</div>
                    : <div>Target: {entry.targetSpeedMin.toFixed(2)} – {entry.targetSpeedMax.toFixed(2)} m/s</div>
            )}
            {hpStr && <div>{hpStr}</div>}
            {entry.startDelay > 0 && <div>Start delay: {(entry.startDelay * 1000).toFixed(0)} ms</div>}
        </div>
    );
};

export default HorseTooltip;

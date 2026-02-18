import { useRef, useCallback, useEffect, type MutableRefObject, type RefObject } from "react";
import { bisectFrameIndex, clamp01, lerp, getCharaIcon, formatSigned, mixWithWhite } from "../RaceReplay.utils";
import { buildPositionKeepSeries, teamColorFor } from "../utils/chartBuilders";
import { getSkillDurationSecs, getActiveSpeedDebuff, hasSkillEffect } from "../utils/SkillDataUtils";
import { InterpolatedFrame } from "../RaceReplay.types";
import { TrainedCharaData } from "../../../data/TrainedCharaData";
import {
    BG_OFFSET_X_PX, BG_OFFSET_Y_PX, BG_SIZE, ICON_SIZE, DOT_SIZE,
    BLOCKED_ICON_SIZE,
    SPEED_BOX_WIDTH, SPEED_BOX_HEIGHT, SPEED_BOX_BG, SPEED_BOX_BORDER, SPEED_BOX_TEXT, SPEED_BOX_FONT_SIZE,
    OVERLAY_INSET, ACCEL_BOX_GAP_Y,
    HP_BAR_WIDTH, HP_BAR_HEIGHT, HP_BAR_GAP_Y, HP_BAR_BG_COLOR, HP_BAR_FILL_COLOR,
    EXCLUDE_SKILL_RE, TEMPTATION_TEXT, STACK_BASE_PX, STACK_GAP_PX,
} from "../RaceReplay.constants";
import AssetLoader from "../../../data/AssetLoader";

const GRID_TOP = 80;
const GRID_RIGHT = 16;
const GRID_BOTTOM = 40;
const GRID_LEFT = 50;

function xToPixel(x: number, xMin: number, xMax: number, W: number) {
    return GRID_LEFT + (x - xMin) / (xMax - xMin) * (W - GRID_LEFT - GRID_RIGHT);
}

function yToPixel(y: number, yMax: number, H: number) {
    return GRID_TOP + (1 - y / yMax) * (H - GRID_TOP - GRID_BOTTOM);
}

const imgCache = new Map<string, HTMLImageElement>();
function getImg(url: string, onFirstLoad?: () => void): HTMLImageElement {
    let img = imgCache.get(url);
    if (!img) {
        img = new Image();
        if (onFirstLoad) img.onload = onFirstLoad;
        img.src = url;
        imgCache.set(url, img);
    }
    return img;
}

let _blockedIconUrl: string | null | undefined;
function getBlockedIconUrl(): string | null {
    if (_blockedIconUrl === undefined) _blockedIconUrl = AssetLoader.getBlockedIcon();
    return _blockedIconUrl;
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function drawOverlayBox(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    drawRoundRect(ctx, x, y, SPEED_BOX_WIDTH, SPEED_BOX_HEIGHT, 6);
    ctx.fillStyle = SPEED_BOX_BG;
    ctx.fill();
    ctx.strokeStyle = SPEED_BOX_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = SPEED_BOX_TEXT;
    ctx.font = `700 ${SPEED_BOX_FONT_SIZE}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + SPEED_BOX_WIDTH / 2, y + SPEED_BOX_HEIGHT / 2);
}

export interface CanvasOverlayParams {
    frames: any[];
    displayNames: Record<number, string>;
    horseInfoByIdx: Record<number, any>;
    trainerColors: Record<number, string> | undefined;
    legendSelection: Record<string, boolean>;
    toggles: {
        speed: boolean;
        accel: boolean;
        blocked: boolean;
        hp: boolean;
        skills: boolean;
        heuristics: boolean;
        skillDuration: boolean;
        positionKeep: boolean;
    };
    maxHpByIdx: Record<number, number>;
    goalInX: number;
    trainedCharaByIdx: Record<number, TrainedCharaData>;
    oonigeByIdx: Record<number, boolean>;
    lastSpurtStartDistances: Record<number, number>;
    trackSlopes: any[];
    skillActivations: Record<number, { time: number; name: string; param: number[] }[]> | undefined;
    passiveStatModifiers: Record<number, { speed: number; stamina: number; power: number; guts: number; wisdom: number }> | undefined;
    combinedOtherEvents: Record<number, { time: number; duration: number; name: string }[]>;
    selectedTrackId: string | null;
    startDelayByIdx: Record<number, number>;
    cameraWindow: number;
    yMaxWithHeadroom: number;
}

export type HorseHoverEntry = {
    idx: number;
    cx: number; cy: number;
    speed: number; accel: number;
    hp: number; maxHp: number;
    distance: number; lanePosition: number;
    startDelay: number;
};

export function useCanvasOverlay(
    echartsRef: RefObject<any>,
    canvasRef: RefObject<HTMLCanvasElement | null>,
    params: CanvasOverlayParams
): { tick: (time: number) => void; interpolatedFrameRef: MutableRefObject<InterpolatedFrame>; xAxisRef: MutableRefObject<{ min: number; max: number }>; horseHoverDataRef: MutableRefObject<HorseHoverEntry[]> } {
    const paramsRef = useRef<CanvasOverlayParams>(params);
    paramsRef.current = params;

    const latestTimeRef = useRef(0);
    const redrawRef = useRef<() => void>(() => {});
    const horseHoverDataRef = useRef<HorseHoverEntry[]>([]);

    const interpolatedFrameRef = useRef<InterpolatedFrame>({
        frameIndex: 0,
        horseFrame: [],
        time: 0,
    });

    const xAxisRef = useRef({ min: 0, max: params.cameraWindow });

    const tick = useCallback((time: number) => {
        latestTimeRef.current = time;
        const instance = echartsRef.current?.getEchartsInstance?.();
        if (!instance) return;

        const p = paramsRef.current;
        if (!p.frames.length) return;

        const i = bisectFrameIndex(p.frames, time);
        const f0 = p.frames[i], f1 = p.frames[i + 1] ?? f0;
        const t0 = f0.time ?? 0, t1 = f1.time ?? 0;
        const a = i < p.frames.length - 1 ? clamp01((time - t0) / Math.max(1e-9, t1 - t0)) : 0;
        const cnt = Math.min(f0.horseFrame.length, f1.horseFrame.length);
        const horseFrame = Array.from({ length: cnt }, (_, idx) => {
            const h0 = f0.horseFrame[idx], h1 = f1.horseFrame[idx] ?? h0, take1 = a >= 0.5;
            return {
                distance: lerp(h0.distance ?? 0, h1.distance ?? 0, a),
                lanePosition: lerp(h0.lanePosition ?? 0, h1.lanePosition ?? 0, a),
                speed: lerp(h0.speed ?? 0, h1.speed ?? 0, a),
                hp: lerp(h0.hp ?? 0, h1.hp ?? 0, a),
                temptationMode: (take1 ? h1 : h0).temptationMode,
                blockFrontHorseIndex: (take1 ? h1 : h0).blockFrontHorseIndex,
            };
        });
        const interpolatedFrame: InterpolatedFrame = { time: lerp(t0, t1, a), horseFrame, frameIndex: i };
        interpolatedFrameRef.current = interpolatedFrame;

        const accByIdx: Record<number, number> = {};
        const f0a = p.frames[i], f1a = p.frames[i + 1];
        if (f0a && f1a) {
            const dt = Math.max(1e-9, (f1a.time ?? 0) - (f0a.time ?? 0));
            const cnt2 = Math.min(f0a.horseFrame.length, f1a.horseFrame.length);
            for (let idx = 0; idx < cnt2; idx++) {
                accByIdx[idx] = ((f1a.horseFrame[idx]?.speed ?? 0) - (f0a.horseFrame[idx]?.speed ?? 0)) / dt;
            }
        } else {
            (f0a?.horseFrame ?? []).forEach((_: any, idx: number) => { accByIdx[idx] = 0; });
        }

        const consumptionRateByIdx: Record<number, number> = {};
        if (f0a && f1a) {
            const dt = (f1a.time ?? 0) - (f0a.time ?? 0);
            if (dt > 1e-9) {
                (f0a.horseFrame ?? []).forEach((h0: any, idx: number) => {
                    const h1 = f1a.horseFrame?.[idx];
                    if (!h0 || !h1) return;
                    consumptionRateByIdx[idx] = ((h0.hp ?? 0) - (h1.hp ?? 0)) / dt;
                });
            }
        }

        const frontRunnerDistance = horseFrame.reduce((m: number, h: any) => Math.max(m, h?.distance ?? 0), 0);
        const lead = p.cameraWindow * 0.1;
        const front = Math.min(frontRunnerDistance, p.goalInX) + lead;
        const xMin = Math.max(0, Math.max(p.cameraWindow, front) - p.cameraWindow);
        const xMax = Math.max(p.cameraWindow, front);
        xAxisRef.current = { min: xMin, max: xMax };

        const seriesUpdate: any[] = [];
        if (p.toggles.positionKeep && p.goalInX) {
            if (frontRunnerDistance < (10 / 24) * p.goalInX) {
                seriesUpdate.push(buildPositionKeepSeries(frontRunnerDistance, p.goalInX, p.yMaxWithHeadroom));
            } else {
                seriesUpdate.push({ id: "position-keep-areas", markArea: { data: [] } });
            }
        }
        instance.setOption(
            {
                xAxis: { min: xMin, max: xMax },
                graphic: {
                    elements: [
                        { id: "distance-readout", style: { text: `${Math.round(xMax)} m` } },
                    ],
                },
                ...(seriesUpdate.length ? { series: seriesUpdate } : {}),
            },
            { notMerge: false }
        );

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        if (w === 0 || h === 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const yMax = p.yMaxWithHeadroom;

        const hoverEntries: HorseHoverEntry[] = [];
        Object.entries(p.displayNames).forEach(([iStr, name]) => {
            if (p.legendSelection && p.legendSelection[name] === false) return;
            const idx = +iStr;
            const hf = interpolatedFrame.horseFrame[idx];
            if (!hf) return;

            const info = p.horseInfoByIdx[idx] ?? {};
            const teamColor = teamColorFor(idx, info, p.trainerColors);
            const iconUrl = getCharaIcon(info?.chara_id) ?? "";
            const cx = xToPixel(hf.distance ?? 0, xMin, xMax, w);
            const cy = yToPixel(hf.lanePosition ?? 0, yMax, h);

            hoverEntries.push({
                idx, cx, cy,
                speed: hf.speed ?? 0,
                accel: accByIdx[idx] ?? 0,
                hp: hf.hp ?? 0,
                maxHp: p.maxHpByIdx[idx] ?? 0,
                distance: hf.distance ?? 0,
                lanePosition: hf.lanePosition ?? 0,
                startDelay: p.startDelayByIdx[idx] ?? 0,
            });

            if (iconUrl) {
                ctx.beginPath();
                ctx.arc(cx + BG_OFFSET_X_PX, cy + BG_OFFSET_Y_PX, BG_SIZE / 2, 0, 2 * Math.PI);
                ctx.fillStyle = teamColor;
                ctx.fill();

                const img = getImg(iconUrl, redrawRef.current);
                if (img.complete && img.naturalWidth > 0) {
                    ctx.drawImage(img, cx - ICON_SIZE / 2, cy - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
                }
            } else {
                ctx.beginPath();
                ctx.arc(cx, cy, DOT_SIZE / 2, 0, 2 * Math.PI);
                ctx.fillStyle = teamColor;
                ctx.fill();
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            const isBlocked = p.toggles.blocked && hf.blockFrontHorseIndex != null && hf.blockFrontHorseIndex !== -1;
            if (isBlocked) {
                const blockedUrl = getBlockedIconUrl();
                if (blockedUrl) {
                    const img = getImg(blockedUrl, redrawRef.current);
                    if (img.complete && img.naturalWidth > 0) {
                        const bx = cx + (iconUrl ? ICON_SIZE : DOT_SIZE) / 2 - BLOCKED_ICON_SIZE;
                        const by = cy + (iconUrl ? ICON_SIZE : DOT_SIZE) / 2 - BLOCKED_ICON_SIZE;
                        ctx.drawImage(img, bx, by, BLOCKED_ICON_SIZE, BLOCKED_ICON_SIZE);
                    }
                }
            }

            const baseSize = iconUrl ? ICON_SIZE : DOT_SIZE;
            const speedRectX = cx - baseSize / 2 + OVERLAY_INSET;
            const speedRectY = cy + baseSize / 2 - SPEED_BOX_HEIGHT - OVERLAY_INSET;
            const accelRectX = speedRectX;
            const accelRectY = speedRectY - SPEED_BOX_HEIGHT - ACCEL_BOX_GAP_Y;

            if (p.toggles.speed) {
                drawOverlayBox(ctx, speedRectX, speedRectY, ((hf.speed ?? 0) / 100).toFixed(2));
            }
            if (p.toggles.accel) {
                drawOverlayBox(ctx, accelRectX, accelRectY, formatSigned(accByIdx[idx] ?? 0));
            }

            if (p.toggles.hp) {
                const maxHp = p.maxHpByIdx[idx] ?? 1;
                const hp = hf.hp ?? 0;
                const rate = consumptionRateByIdx[idx] ?? 0;
                const hpPct = Math.max(0, Math.min(1, hp / maxHp));
                const hpBarX = cx - HP_BAR_WIDTH / 2;
                const hpBarY = cy + baseSize / 2 + HP_BAR_GAP_Y;

                ctx.fillStyle = HP_BAR_BG_COLOR;
                ctx.fillRect(hpBarX, hpBarY, HP_BAR_WIDTH, HP_BAR_HEIGHT);
                ctx.fillStyle = HP_BAR_FILL_COLOR;
                ctx.fillRect(hpBarX, hpBarY, HP_BAR_WIDTH * hpPct, HP_BAR_HEIGHT);

                if ((hf.distance ?? 0) > (5 / 6) * p.goalInX) {
                    const timeToEmpty = rate > 0 ? hp / rate : Number.POSITIVE_INFINITY;
                    const estText = Number.isFinite(timeToEmpty) ? `${timeToEmpty.toFixed(1)}s` : "∞";

                    ctx.font = "bold 9px sans-serif";
                    ctx.textBaseline = "bottom";
                    ctx.strokeStyle = "#000";
                    ctx.lineWidth = 2;

                    ctx.textAlign = "left";
                    ctx.strokeText(`${Math.round(hp)}`, hpBarX + 1, hpBarY - 2);
                    ctx.fillStyle = "#fff";
                    ctx.fillText(`${Math.round(hp)}`, hpBarX + 1, hpBarY - 2);

                    ctx.textAlign = "right";
                    ctx.strokeText(estText, hpBarX + HP_BAR_WIDTH - 1, hpBarY - 2);
                    ctx.fillStyle = "#fff";
                    ctx.fillText(estText, hpBarX + HP_BAR_WIDTH - 1, hpBarY - 2);
                }
            }
        });
        horseHoverDataRef.current = hoverEntries;

        if (p.toggles.skills) {
            Object.entries(p.displayNames).forEach(([iStr, name]) => {
                if (p.legendSelection && p.legendSelection[name] === false) return;
                const idx = +iStr;
                const hf = interpolatedFrame.horseFrame[idx];
                if (!hf) return;

                const info = p.horseInfoByIdx[idx] ?? {};
                const teamColor = teamColorFor(idx, info, p.trainerColors);
                const bgColor = mixWithWhite(teamColor, 0.9);
                const iconUrl = getCharaIcon(info?.chara_id) ?? "";
                const baseSize = iconUrl ? ICON_SIZE : DOT_SIZE;
                const cx = xToPixel(hf.distance ?? 0, xMin, xMax, w);
                const cy = yToPixel(hf.lanePosition ?? 0, yMax, h);

                const labels: { text: string; bg: string }[] = [];

                const mode = hf.temptationMode ?? 0;
                if (mode) {
                    labels.push({ text: TEMPTATION_TEXT[mode] ?? "Rushed", bg: bgColor });
                }

                (p.skillActivations?.[idx] ?? [])
                    .filter(s => {
                        const dur = getSkillDurationSecs(s.param[1], p.goalInX, s.param?.[2]);
                        return time >= s.time && time < s.time + dur && !EXCLUDE_SKILL_RE.test(s.name);
                    })
                    .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
                    .forEach(s => {
                        const dur = getSkillDurationSecs(s.param[1], p.goalInX, s.param?.[2]);
                        const remaining = Math.max(0, s.time + dur - time);
                        const label = p.toggles.skillDuration ? `${s.name} ${remaining.toFixed(1)}s` : s.name;
                        labels.push({ text: label, bg: bgColor });
                    });

                Object.values(p.skillActivations ?? {}).flat()
                    .filter(s => {
                        const targetMask = s.param?.[4] ?? 0;
                        if ((targetMask & (1 << idx)) === 0) return false;
                        if ((p.skillActivations?.[idx] ?? []).some((self: any) => self === s)) return false;
                        if (getActiveSpeedDebuff(s.param[1]) <= 0 && !hasSkillEffect(s.param[1], 9)) return false;
                        const dur = getSkillDurationSecs(s.param[1], p.goalInX);
                        return time >= s.time && time < s.time + dur && !EXCLUDE_SKILL_RE.test(s.name);
                    })
                    .forEach(s => {
                        const dur = getSkillDurationSecs(s.param[1], p.goalInX);
                        const remaining = Math.max(0, s.time + dur - time);
                        const label = p.toggles.skillDuration ? `↓ ${s.name} ${remaining.toFixed(1)}s` : `↓ ${s.name}`;
                        labels.push({ text: label, bg: "#ffcccb" });
                    });

                (p.combinedOtherEvents[idx] ?? [])
                    .filter(e => time >= e.time && time < e.time + e.duration)
                    .sort((a, b) => a.time - b.time || a.name.localeCompare(b.name))
                    .forEach(e => {
                        labels.push({ text: e.name, bg: bgColor });
                    });

                if (labels.length === 0) return;

                const boxH = 20;
                ctx.font = "12px sans-serif";
                let labelY = cy - STACK_BASE_PX - boxH / 2;

                for (const lbl of labels) {
                    const textW = ctx.measureText(lbl.text).width;
                    const boxW = textW + 12;
                    const boxX = cx - boxW / 2;
                    const boxY = labelY - boxH / 2;

                    drawRoundRect(ctx, boxX, boxY, boxW, boxH, 5);
                    ctx.fillStyle = lbl.bg;
                    ctx.fill();
                    ctx.strokeStyle = "#000";
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = "#000";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(lbl.text, cx, labelY);

                    labelY -= STACK_GAP_PX;
                }
            });
        }

        ctx.restore();
    }, [echartsRef, canvasRef]);

    useEffect(() => { redrawRef.current = () => tick(latestTimeRef.current); }, [tick]);

    return { tick, interpolatedFrameRef, xAxisRef, horseHoverDataRef };
}

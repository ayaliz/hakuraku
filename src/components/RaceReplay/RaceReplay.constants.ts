export const SURFACE_MAP: Record<number, string> = { 1: "Turf", 2: "Dirt" };

export const STACK_BASE_PX = 24;
export const STACK_GAP_PX = 22;
export const ICON_SIZE = 64;
export const BG_SIZE = 52;
export const BG_OFFSET_X_PX = 0;
export const BG_OFFSET_Y_PX = 3;
export const DOT_SIZE = 52;
export const BLOCKED_ICON_SIZE = 24;

export const SPEED_BOX_WIDTH = 44;
export const SPEED_BOX_HEIGHT = 20;
export const SPEED_BOX_BG = "rgba(255,255,255,0.4)";
export const SPEED_BOX_BORDER = "rgba(0,0,0,1)";
export const SPEED_BOX_TEXT = "#000";
export const SPEED_BOX_FONT_SIZE = 12;
export const OVERLAY_INSET = 9;
export const ACCEL_BOX_GAP_Y = 1;

export const DEFAULT_TEAM_PALETTE = [
    "#2563EB", "#16A34A", "#DC2626", "#9333EA", "#EA580C", "#0891B2",
    "#DB2777", "#4F46E5", "#059669", "#B45309", "#0EA5E9", "#C026D3",
];

export const STRAIGHT_FILL = "rgba(79, 109, 122, 0.32)";
export const CORNER_FILL = "rgba(192, 139, 91, 0.30)";
export const STRAIGHT_FINAL_FILL = "rgba(14, 42, 71, 0.38)";
export const CORNER_FINAL_FILL = "rgba(122, 59, 18, 0.36)";

export const SLOPE_UP_FILL = "rgba(255, 221, 221, 0.28)";
export const SLOPE_DOWN_FILL = "rgba(221, 221, 255, 0.28)";
export const SLOPE_DIAG_LINE = "rgba(0,0,0,0.35)";
export const SLOPE_HALF_RATIO = 0.2;

export const EXCLUDE_SKILL_RE = /(standard\s*distance|-handed|savvy|days|conditions| runner| racecourse|target in sight|focus|concentration)/i;
export const TEMPTATION_TEXT: Record<number, string> = { 1: "Rushed (Late)", 2: "Rushed (Pace)", 3: "Rushed (Front)", 4: "Rushed (Speed up)" };

export const TOOLBAR_GAP = 12;
export const TOOLBAR_INLINE_GAP = 8;
export const LEGEND_ITEM_GAP_X = 12;
export const LEGEND_ITEM_GAP_Y = 6;
export const LEGEND_SWATCH_GAP = 6;

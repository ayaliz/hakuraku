// Strategy colors matching CharaList columns.tsx
export const STRATEGY_COLORS: Record<number, string> = {
    1: "rgb(94, 152, 231)",   // Front Runner - Blue
    2: "rgb(164, 219, 34)",   // Pace Chaser - Green
    3: "rgb(253, 222, 52)",   // Late Surger - Yellow
    4: "rgb(255, 178, 49)",   // End Closer - Orange
    5: "rgb(178, 102, 255)",
};

export const COLORBLIND_STRATEGY_COLORS: Record<number, string> = {
    1: "#648fff",
    2: "#dc267f",
    3: "#fe6100",
    4: "#ffb000",
    5: "#785ef0",
};

export const STRATEGY_NAMES: Record<number, string> = {
    1: "Front Runner",
    2: "Pace Chaser",
    3: "Late Surger",
    4: "End Closer",
    5: "Runaway",
};

export const STRATEGY_DISPLAY_ORDER = [5, 1, 2, 3, 4] as const;

// Unique colors for characters
export const CHARACTER_COLORS = [
    "#667eea", "#764ba2", "#48bb78", "#ed8936", "#e53e3e",
    "#38b2ac", "#dd6b20", "#9f7aea", "#f6e05e", "#fc8181",
    "#68d391", "#63b3ed", "#f687b3", "#b794f4", "#fbd38d",
    "#81e6d9", "#feb2b2", "#a3bffa", "#faf089", "#c6f6d5",
];

// Per uma smoothing
export const BAYES_UMA = {
    K: 54,
    PRIOR: 1 / 9,
} as const;

// Per team smoothing
export const BAYES_TEAM = {
    K: 18,
    PRIOR: 1 / 3,
} as const;

// Minimum fraction of total races a saturation bucket must have to display a data point.
// e.g. 0.003 @ 13600 rooms → floor of ~41 races.
export const SAT_MIN_RACE_FRACTION = 0.003;


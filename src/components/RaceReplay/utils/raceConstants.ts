// Race speed formula: baseSpeed = BASE_SPEED_CONSTANT - (courseDistance - BASE_SPEED_COURSE_OFFSET) / BASE_SPEED_COURSE_SCALE
export const BASE_SPEED_CONSTANT = 20.0;
export const BASE_SPEED_COURSE_OFFSET = 2000;
export const BASE_SPEED_COURSE_SCALE = 1000;

// HP consumption reference formula: SCALE * pow(speed - baseSpeed + SPEED_OFFSET, 2) / DIVISOR
export const HP_CONSUMPTION_SCALE = 20.0;
export const HP_CONSUMPTION_SPEED_OFFSET = 12.0;
export const HP_CONSUMPTION_DIVISOR = 144.0;

// Slope formulas
// slope units: raw game value where SLOPE_SCALE = 1 grade fraction (e.g. slope -10000 → 1% downhill)
export const SLOPE_SCALE = 10000;
export const SLOPE_PENALTY_COEFF = 200; // Uphill speed penalty: (slope / SLOPE_SCALE * SLOPE_PENALTY_COEFF) / adjustedPower

// Downhill Mode speed bonus: bonus = DOWNHILL_BONUS_BASE + |slope| / DOWNHILL_BONUS_DIVISOR
export const DOWNHILL_BONUS_BASE = 0.3;
export const DOWNHILL_BONUS_DIVISOR = 100000; // slope -10000 (1% grade) → +0.1 m/s bonus

// HP consumption ratios (actual / reference) used to detect downhill mode
export const DOWNHILL_HP_RATIO_THRESHOLD = 0.8;  // Below → likely downhill mode
export const DOWNHILL_HP_RATIO_STRONG = 0.5;      // Below → definitely downhill (skip speed matching)
export const DOWNHILL_HP_RATIO_PACE_DOWN = 0.3;   // Downhill + pace down confirmation

// Position keep mode speed multipliers
export const PACE_UP_MULTIPLIER = 1.04;
export const OVERTAKE_MULTIPLIER = 1.05;
export const PACE_DOWN_MULTIPLIER = 0.915;
export const RUSHED_TYPE2_MULTIPLIER = 1.04; // Applied multiplicatively alongside other mode multipliers

// Skill timing
export const SKILL_TIME_SCALE = 10000;     // Converts game base time to race-proportional duration: (baseTime / SKILL_TIME_SCALE) * (distance / 1000)
export const DEFAULT_SKILL_DURATION = 2.0; // Fallback duration (seconds) when skill has no base time

// Guts bonus speed formulas
// Spot Struggle (Competes Pos): Math.pow(BASE * guts, EXPONENT) * SCALE
export const SPOT_STRUGGLE_GUTS_BASE = 500;
export const SPOT_STRUGGLE_GUTS_EXPONENT = 0.6;
export const SPOT_STRUGGLE_GUTS_SCALE = 0.0001;
// Dueling (Competes Speed): Math.pow(BASE * guts, EXPONENT) * SCALE
export const DUELING_GUTS_BASE = 200;
export const DUELING_GUTS_EXPONENT = 0.708;
export const DUELING_GUTS_SCALE = 0.0001;

// Special skill IDs
export const OONIGE_SKILL_ID = 202051;

// Temptation mode values
export const TEMPTATION_MODE_RUSH_BOOST = 4; // The "rushed boost" variant that applies RUSHED_TYPE2_MULTIPLIER

// Career race (raceType === 'Single') flat stat bonus, applied after mood modifier and 1200 cap
export const CAREER_RACE_STAT_BONUS = 400;

// Display adjustment for mode/downhill durations (server vs client simulation timing)
export const MODE_DISPLAY_TIME_SCALE = 15 / 16;

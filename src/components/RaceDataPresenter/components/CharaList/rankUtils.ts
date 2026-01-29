// Uma rank thresholds and icon mapping
// Thresholds are minimum scores for each rank

// Import all rank icons
import G from "../../../../data/textures/uma_ranks/G_w_trans.png";
import G_plus from "../../../../data/textures/uma_ranks/G+_w_trans.png";
import F from "../../../../data/textures/uma_ranks/F_w_trans.png";
import F_plus from "../../../../data/textures/uma_ranks/F+_w_trans.png";
import E from "../../../../data/textures/uma_ranks/E_w_trans.png";
import E_plus from "../../../../data/textures/uma_ranks/E+_w_trans.png";
import D from "../../../../data/textures/uma_ranks/D_w_trans.png";
import D_plus from "../../../../data/textures/uma_ranks/D+_w_trans.png";
import C from "../../../../data/textures/uma_ranks/C_w_trans.png";
import C_plus from "../../../../data/textures/uma_ranks/C+_w_trans.png";
import B from "../../../../data/textures/uma_ranks/B_w_trans.png";
import B_plus from "../../../../data/textures/uma_ranks/B+_w_trans.png";
import A from "../../../../data/textures/uma_ranks/A_w_trans.png";
import A_plus from "../../../../data/textures/uma_ranks/A+_w_trans.png";
import S from "../../../../data/textures/uma_ranks/S_w_trans.png";
import S_plus from "../../../../data/textures/uma_ranks/S+_w_trans.png";
import SS from "../../../../data/textures/uma_ranks/SS_w_trans.png";
import SS_plus from "../../../../data/textures/uma_ranks/SS+_w_trans.png";
import UG from "../../../../data/textures/uma_ranks/UG_w_trans.png";
import UG1 from "../../../../data/textures/uma_ranks/UG1_w_trans.png";
import UG2 from "../../../../data/textures/uma_ranks/UG2_w_trans.png";
import UG3 from "../../../../data/textures/uma_ranks/UG3_w_trans.png";
import UG4 from "../../../../data/textures/uma_ranks/UG4_w_trans.png";
import UG5 from "../../../../data/textures/uma_ranks/UG5_w_trans.png";
import UG6 from "../../../../data/textures/uma_ranks/UG6_w_trans.png";
import UG7 from "../../../../data/textures/uma_ranks/UG7_w_trans.png";
import UG8 from "../../../../data/textures/uma_ranks/UG8_w_trans.png";
import UG9 from "../../../../data/textures/uma_ranks/UG9_w_trans.png";
import UF from "../../../../data/textures/uma_ranks/UF_w_trans.png";
import UF1 from "../../../../data/textures/uma_ranks/UF1_w_trans.png";
import UF2 from "../../../../data/textures/uma_ranks/UF2_w_trans.png";
import UF3 from "../../../../data/textures/uma_ranks/UF3_w_trans.png";
import UF4 from "../../../../data/textures/uma_ranks/UF4_w_trans.png";
import UF5 from "../../../../data/textures/uma_ranks/UF5_w_trans.png";
import UF6 from "../../../../data/textures/uma_ranks/UF6_w_trans.png";
import UF7 from "../../../../data/textures/uma_ranks/UF7_w_trans.png";
import UF8 from "../../../../data/textures/uma_ranks/UF8_w_trans.png";
import UF9 from "../../../../data/textures/uma_ranks/UF9_w_trans.png";
import UE from "../../../../data/textures/uma_ranks/UE_w_trans.png";
import UE1 from "../../../../data/textures/uma_ranks/UE1_w_trans.png";
import UE2 from "../../../../data/textures/uma_ranks/UE2_w_trans.png";
import UE3 from "../../../../data/textures/uma_ranks/UE3_w_trans.png";
import UE4 from "../../../../data/textures/uma_ranks/UE4_w_trans.png";
import UE5 from "../../../../data/textures/uma_ranks/UE5_w_trans.png";
import UE6 from "../../../../data/textures/uma_ranks/UE6_w_trans.png";
import UE7 from "../../../../data/textures/uma_ranks/UE7_w_trans.png";
import UE8 from "../../../../data/textures/uma_ranks/UE8_w_trans.png";
import UE9 from "../../../../data/textures/uma_ranks/UE9_w_trans.png";
import UD from "../../../../data/textures/uma_ranks/UD_w_trans.png";
import UD1 from "../../../../data/textures/uma_ranks/UD1_w_trans.png";
import UD2 from "../../../../data/textures/uma_ranks/UD2_w_trans.png";
import UD3 from "../../../../data/textures/uma_ranks/UD3_w_trans.png";
import UD4 from "../../../../data/textures/uma_ranks/UD4_w_trans.png";
import UD5 from "../../../../data/textures/uma_ranks/UD5_w_trans.png";
import UD6 from "../../../../data/textures/uma_ranks/UD6_w_trans.png";
import UD7 from "../../../../data/textures/uma_ranks/UD7_w_trans.png";
import UD8 from "../../../../data/textures/uma_ranks/UD8_w_trans.png";
import UD9 from "../../../../data/textures/uma_ranks/UD9_w_trans.png";

// Rank thresholds in descending order (check highest first)
const rankThresholds: { minScore: number; icon: string; name: string }[] = [
    // UD tier (highest)
    { minScore: 40000, icon: UD9, name: "UD9" },
    { minScore: 39400, icon: UD8, name: "UD8" },
    { minScore: 38700, icon: UD7, name: "UD7" },
    { minScore: 38100, icon: UD6, name: "UD6" },
    { minScore: 37500, icon: UD5, name: "UD5" },
    { minScore: 36800, icon: UD4, name: "UD4" },
    { minScore: 36200, icon: UD3, name: "UD3" },
    { minScore: 35600, icon: UD2, name: "UD2" },
    { minScore: 35000, icon: UD1, name: "UD1" },
    { minScore: 34400, icon: UD, name: "UD" },
    // UE tier
    { minScore: 33800, icon: UE9, name: "UE9" },
    { minScore: 33200, icon: UE8, name: "UE8" },
    { minScore: 32700, icon: UE7, name: "UE7" },
    { minScore: 32100, icon: UE6, name: "UE6" },
    { minScore: 31500, icon: UE5, name: "UE5" },
    { minScore: 31000, icon: UE4, name: "UE4" },
    { minScore: 30400, icon: UE3, name: "UE3" },
    { minScore: 29900, icon: UE2, name: "UE2" },
    { minScore: 29400, icon: UE1, name: "UE1" },
    { minScore: 28800, icon: UE, name: "UE" },
    // UF tier
    { minScore: 28300, icon: UF9, name: "UF9" },
    { minScore: 27800, icon: UF8, name: "UF8" },
    { minScore: 27300, icon: UF7, name: "UF7" },
    { minScore: 26800, icon: UF6, name: "UF6" },
    { minScore: 26300, icon: UF5, name: "UF5" },
    { minScore: 25800, icon: UF4, name: "UF4" },
    { minScore: 25300, icon: UF3, name: "UF3" },
    { minScore: 24800, icon: UF2, name: "UF2" },
    { minScore: 24300, icon: UF1, name: "UF1" },
    { minScore: 23900, icon: UF, name: "UF" },
    // UG tier
    { minScore: 23400, icon: UG9, name: "UG9" },
    { minScore: 23000, icon: UG8, name: "UG8" },
    { minScore: 22500, icon: UG7, name: "UG7" },
    { minScore: 22100, icon: UG6, name: "UG6" },
    { minScore: 21600, icon: UG5, name: "UG5" },
    { minScore: 21200, icon: UG4, name: "UG4" },
    { minScore: 20800, icon: UG3, name: "UG3" },
    { minScore: 20400, icon: UG2, name: "UG2" },
    { minScore: 20000, icon: UG1, name: "UG1" },
    { minScore: 19600, icon: UG, name: "UG" },
    // SS tier
    { minScore: 19200, icon: SS_plus, name: "SS+" },
    { minScore: 17500, icon: SS, name: "SS" },
    // S tier
    { minScore: 15900, icon: S_plus, name: "S+" },
    { minScore: 14500, icon: S, name: "S" },
    // A tier
    { minScore: 12100, icon: A_plus, name: "A+" },
    { minScore: 10000, icon: A, name: "A" },
    // B tier
    { minScore: 8200, icon: B_plus, name: "B+" },
    { minScore: 6500, icon: B, name: "B" },
    // C tier
    { minScore: 4900, icon: C_plus, name: "C+" },
    { minScore: 3500, icon: C, name: "C" },
    // D tier
    { minScore: 1900, icon: D_plus, name: "D+" },
    { minScore: 1300, icon: D, name: "D" },
    // E tier
    { minScore: 800, icon: E_plus, name: "E+" },
    { minScore: 600, icon: E, name: "E" },
    // F tier
    { minScore: 400, icon: F_plus, name: "F+" },
    { minScore: 200, icon: F, name: "F" },
    // G tier
    { minScore: 100, icon: G_plus, name: "G+" },
    { minScore: 0, icon: G, name: "G" },
];

/**
 * Get the rank icon for a given score
 * @param score The character's rank score
 * @returns The icon path and rank name
 */
export function getRankIcon(score: number): { icon: string; name: string } {
    // Anything above UD9's max stays at UD9
    for (const rank of rankThresholds) {
        if (score >= rank.minScore) {
            return { icon: rank.icon, name: rank.name };
        }
    }
    // Fallback to G
    return { icon: G, name: "G" };
}

import _ from "lodash";
import UMDatabaseWrapper from "./UMDatabaseWrapper";

export type CharaSkill = {
    skillId: number,
    level: number,
}

type CourseAptitudeFilters = {
    ground: number,
    distance: number,
};

export type TrainedCharaData = {
    viewerId: number,
    viewerName: string,

    trainedCharaId: number,
    charaId: number,
    cardId: number,

    skills: CharaSkill[],

    speed: number,
    stamina: number,
    pow: number,
    guts: number,
    wiz: number,

    properDistances: Record<number, number>,
    properRunningStyles: Record<number, number>,
    properGroundTurf: number,
    properGroundDirt: number,

    rankScore: number,

    // Drives the fan-count tier multiplier on skills like 210071 / 210072.
    fanCount?: number,

    rawData: any,
};

const DISTANCE_FIELD_BY_CATEGORY: Record<number, string> = {
    1: "proper_distance_short",
    2: "proper_distance_mile",
    3: "proper_distance_middle",
    4: "proper_distance_long",
};

const RUNNING_STYLE_FIELD_BY_ID: Record<number, string> = {
    1: "proper_running_style_nige",
    2: "proper_running_style_senko",
    3: "proper_running_style_sashi",
    4: "proper_running_style_oikomi",
    5: "proper_running_style_nige",
};

const GROUND_FIELD_BY_ID: Record<number, string> = {
    1: "proper_ground_turf",
    2: "proper_ground_dirt",
};

function normalizeSkillArray(skills: any): CharaSkill[] {
    if (!Array.isArray(skills)) return [];
    return skills
        .map((skill: any) => {
            if (typeof skill === "number") {
                return { skillId: skill, level: 1 } as CharaSkill;
            }
            if (!skill || typeof skill !== "object") return null;
            const skillId = Number(skill["skillId"] ?? skill["skill_id"]);
            if (!Number.isFinite(skillId) || skillId <= 0) return null;
            const level = Number(skill["level"]);
            return {
                skillId,
                level: Number.isFinite(level) && level > 0 ? level : 1,
            } as CharaSkill;
        })
        .filter((skill): skill is CharaSkill => skill !== null);
}

export function hydrateCompactRaceHorseData(
    raceHorseData: any,
    options?: { courseAptitudeFilters?: CourseAptitudeFilters | null },
): any {
    if (!raceHorseData || typeof raceHorseData !== "object") {
        return raceHorseData;
    }

    const normalized = {
        ...raceHorseData,
    };

    if (normalized["fan_count"] === undefined) {
        const fanCount = normalized["fanCount"] ?? normalized["fans"];
        if (fanCount !== undefined) {
            normalized["fan_count"] = fanCount;
        }
    }

    if (Array.isArray(normalized["skill_array"])) {
        normalized["skill_array"] = normalizeSkillArray(normalized["skill_array"]);
    }

    const courseAptitudeFilters = options?.courseAptitudeFilters ?? null;
    const compactGround = normalized["apt_ground"];
    const compactDistance = normalized["apt_distance"];
    const compactStyle = normalized["apt_style"];
    const runningStyle = Number(normalized["running_style"]);

    if (courseAptitudeFilters) {
        const groundField = GROUND_FIELD_BY_ID[courseAptitudeFilters.ground];
        if (groundField && normalized[groundField] === undefined && Number.isFinite(Number(compactGround))) {
            normalized[groundField] = Number(compactGround);
        }

        const distanceField = DISTANCE_FIELD_BY_CATEGORY[courseAptitudeFilters.distance];
        if (distanceField && normalized[distanceField] === undefined && Number.isFinite(Number(compactDistance))) {
            normalized[distanceField] = Number(compactDistance);
        }
    }

    const runningStyleField = RUNNING_STYLE_FIELD_BY_ID[runningStyle];
    if (runningStyleField && normalized[runningStyleField] === undefined && Number.isFinite(Number(compactStyle))) {
        normalized[runningStyleField] = Number(compactStyle);
    }

    return normalized;
}

type StatusPoints = {
    speed: number,
    stamina: number,
    pow: number,
    guts: number,
    wiz: number,
}

function calcRankScore(raceHorseData: any, statusPoints: StatusPoints, charaSkills: CharaSkill[], properRunningStyles: Record<number, number>, properDistances: Record<number, number>, properGrounds: Record<number, number>): number {
    if (raceHorseData['rank_score']) {
        return raceHorseData['rank_score'];
    }

    let rankScore = _.sumBy([statusPoints.speed, statusPoints.stamina, statusPoints.pow, statusPoints.guts, statusPoints.wiz],
        value => statusPoint(value));
    for (let charaSkill of charaSkills) {
        const skillId = charaSkill.skillId;
        const skill = UMDatabaseWrapper.skills[skillId];
        if (skill === undefined) {
            continue;
        }

        if (skillId < 200000) {
            // 固有スキル
            rankScore += skill.gradeValue! / 2 * charaSkill.level;
        } else {
            const tagIds = new Set(skill.tagId);
            let runningStyleMultiplier = 0;
            [1, 2, 3, 4].forEach(runningStyleTag => {
                if (tagIds.has('10' + runningStyleTag.toString())) {
                    runningStyleMultiplier = _.max([runningStyleMultiplier, properSkillMultiplier[properRunningStyles[runningStyleTag]]])!;
                }
            });
            if (runningStyleMultiplier === 0) runningStyleMultiplier = 1;
            let distanceMultiplier = 0;
            [1, 2, 3, 4].forEach(distanceTag => {
                if (tagIds.has('20' + distanceTag.toString())) {
                    distanceMultiplier = _.max([distanceMultiplier, properSkillMultiplier[properDistances[distanceTag]]])!;
                }
            });
            if (distanceMultiplier === 0) distanceMultiplier = 1;
            let groundMultiplier = 0;
            [1, 2].forEach(groundTag => {
                if (tagIds.has('50' + groundTag.toString())) {
                    groundMultiplier = _.max([groundMultiplier, properSkillMultiplier[properGrounds[groundTag]]])!;
                }
            });
            if (groundMultiplier === 0) groundMultiplier = 1;
            rankScore += Math.round(skill.gradeValue! * runningStyleMultiplier * distanceMultiplier * groundMultiplier);
        }
    }

    return rankScore;
}

function toFiniteNumber(value: any): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function fromRaceHorseData(raceHorseData: any): TrainedCharaData {
    const normalizedRaceHorseData = hydrateCompactRaceHorseData(raceHorseData);
    const charaSkills: CharaSkill[] = normalizeSkillArray(normalizedRaceHorseData['skill_array']);

    const statusPoints = {
        speed: normalizedRaceHorseData['speed'],
        stamina: normalizedRaceHorseData['stamina'],
        pow: normalizedRaceHorseData['pow'] || normalizedRaceHorseData['power'], // 'power' in trained_chara
        guts: normalizedRaceHorseData['guts'],
        wiz: normalizedRaceHorseData['wiz'],
    };

    const properDistances: Record<number, number> = {
        1: normalizedRaceHorseData['proper_distance_short'],
        2: normalizedRaceHorseData['proper_distance_mile'],
        3: normalizedRaceHorseData['proper_distance_middle'],
        4: normalizedRaceHorseData['proper_distance_long'],
    };
    const properRunningStyles: Record<number, number> = {
        1: normalizedRaceHorseData['proper_running_style_nige'],
        2: normalizedRaceHorseData['proper_running_style_senko'],
        3: normalizedRaceHorseData['proper_running_style_sashi'],
        4: normalizedRaceHorseData['proper_running_style_oikomi'],
    };

    const turf = normalizedRaceHorseData['proper_ground_turf'];
    const dirt = normalizedRaceHorseData['proper_ground_dirt'];

    return {
        viewerId: normalizedRaceHorseData['viewer_id'],
        viewerName: normalizedRaceHorseData['trainer_name'],

        trainedCharaId: normalizedRaceHorseData['trained_chara_id'],
        charaId: normalizedRaceHorseData['chara_id'],
        cardId: normalizedRaceHorseData['card_id'],

        skills: charaSkills,

        ...statusPoints,

        properDistances: properDistances,
        properRunningStyles: properRunningStyles,
        properGroundTurf: turf,
        properGroundDirt: dirt,

        rankScore: calcRankScore(
            normalizedRaceHorseData, statusPoints, charaSkills, properRunningStyles, properDistances, {1: turf, 2: dirt}),

        fanCount: toFiniteNumber(normalizedRaceHorseData['fan_count'] ?? normalizedRaceHorseData['fanCount'] ?? normalizedRaceHorseData['fans']),

        rawData: normalizedRaceHorseData,
    };
}

function statusPoint(point: number): number {
    const normalized = Math.max(0, Math.min(MAX_STATUS_POINT, Math.trunc(Number(point))));
    return Number.isFinite(normalized) ? statusPointToRankPoint[normalized] : 0;
}

const MAX_STATUS_POINT = 2500;
const statusPointRatesTo1200 = [
    5, 8, 10, 13, 16, 18, 21, 24, 26, 28, 29, 30, 31, 33, 34, 35, 39, 41, 42, 43, 52, 55, 66, 68, 68,
];
const statusPointRatesTo2000 = [
    79, 80, 81, 83, 84, 85, 86, 88, 89, 90, 92, 93, 94, 96, 97, 98, 100, 101, 102, 103, 105,
    106, 107, 109, 110, 111, 113, 114, 115, 117, 118, 119, 121, 122, 123, 124, 126, 127, 128,
    130, 131, 132, 134, 135, 136, 138, 139, 140, 141, 143, 144, 145, 147, 148, 149, 151, 152,
    153, 155, 156, 157, 159, 160, 161, 162, 164, 165, 166, 168, 169, 170, 172, 173, 174, 176,
    177, 178, 179, 181, 182, 182,
];

const statusPointToRankPoint: number[] = (() => {
    const scores = [0];
    let rawScore = 0;
    let rateIndex = 0;

    for (let stat = 1; stat <= 1200; stat++) {
        if (stat <= 49) rateIndex = 0;
        else if (stat <= 99) rateIndex = 1;
        else if (stat % 50 === 0) rateIndex++;
        rawScore += statusPointRatesTo1200[rateIndex];
        scores[stat] = Math.round(rawScore / 10);
    }

    rawScore = 38413;
    rateIndex = 0;
    for (let stat = 1201; stat <= 2000; stat++) {
        if (stat <= 1209) rateIndex = 0;
        else if (stat <= 1219) rateIndex = 1;
        else if (stat % 10 === 0) rateIndex++;
        rawScore += statusPointRatesTo2000[rateIndex];
        scores[stat] = Math.round(rawScore / 10);
    }

    rawScore = 142796;
    rateIndex = 0;
    let rate = 183;
    for (let stat = 2001; stat <= MAX_STATUS_POINT; stat++) {
        if (rateIndex >= 25) {
            rate++;
            rateIndex = 0;
        }
        rawScore += rate;
        rateIndex++;
        scores[stat] = Math.round(rawScore / 10);
    }

    return scores;
})();

const properSkillMultiplier: Record<number, number> = {1: 0.7, 2: 0.8, 3: 0.8, 4: 0.8, 5: 0.9, 6: 0.9, 7: 1.1, 8: 1.1};

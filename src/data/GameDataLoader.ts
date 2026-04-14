import * as pako from "pako";
import type { CourseBaseRatioData, CourseShapeData } from "./CourseShapeLoader";

export type SkillNameFallbackEntry = {
    id: number;
    enname?: string;
    jpname?: string;
};

class GameDataLoaderClass {
    private data: Record<string, any> | null = null;
    private skillNameFallbacksById: Record<number, SkillNameFallbackEntry> | null = null;
    private courseDataOverride: Record<string, any> | null = null;

    private normalizeCourseDataShape(raw: unknown): Record<string, any> | null {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return null;
        }

        const source = raw as Record<string, any>;
        const normalized: Record<string, any> = {};

        for (const [courseId, value] of Object.entries(source)) {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                continue;
            }
            const entry = value as Record<string, any>;
            normalized[courseId] = {
                raceTrackId: entry.raceTrackId ?? entry.race_track_id ?? 0,
                distance: entry.distance ?? 0,
                distanceType: entry.distanceType ?? entry.distance_type ?? 0,
                surface: entry.surface ?? entry.ground ?? 0,
                turn: entry.turn ?? 0,
                course: entry.course ?? entry.inout ?? 0,
                laneMax: entry.laneMax ?? entry.lane_max ?? entry.float_lane_max ?? 0,
                finishTimeMin: entry.finishTimeMin ?? entry.finish_time_min ?? 0,
                finishTimeMax: entry.finishTimeMax ?? entry.finish_time_max ?? 0,
                courseSetStatus: entry.courseSetStatus ?? entry.course_set_status ?? [],
                corners: entry.corners ?? [],
                straights: entry.straights ?? [],
                slopes: entry.slopes ?? [],
            };
        }

        return Object.keys(normalized).length > 0 ? normalized : null;
    }

    setCourseDataOverride(rawCourseData: unknown): void {
        this.courseDataOverride = this.normalizeCourseDataShape(rawCourseData);
    }

    async initialize(): Promise<void> {
        if (this.data) return;

        const response = await fetch(
            import.meta.env.BASE_URL + "data/gamedata.bin.gz",
            { cache: "no-cache" }
        );
        const buffer = await response.arrayBuffer();
        const inflated = pako.inflate(new Uint8Array(buffer), { to: "string" });
        this.data = JSON.parse(inflated);
        this.skillNameFallbacksById = null;
        this.courseDataOverride = null;

        // Optional canonical override: if present, prefer standalone course_data.json.
        try {
            const overrideResponse = await fetch(
                import.meta.env.BASE_URL + "data/course_data.json",
                { cache: "no-cache" },
            );
            if (overrideResponse.ok) {
                const overrideData = await overrideResponse.json();
                this.setCourseDataOverride(overrideData);
            }
        } catch {
            // Fall back to embedded gamedata when override is absent/unreadable.
        }
    }

    private ensureLoaded() {
        if (!this.data) {
            throw new Error(
                "GameDataLoader not initialized. Call initialize() first."
            );
        }
    }

    get enums(): any {
        this.ensureLoaded();
        return this.data!["Enums"];
    }

    get staticVariableDefine(): any {
        this.ensureLoaded();
        return this.data!["StaticVariableDefine"];
    }

    get courseData(): Record<string, any> {
        this.ensureLoaded();
        const embedded = this.data!["tracks/course_data"] ?? {};
        if (!this.courseDataOverride) {
            return embedded;
        }
        // Prefer canonical override entries, but retain embedded fallback IDs.
        return { ...embedded, ...this.courseDataOverride };
    }

    get cups(): any {
        this.ensureLoaded();
        return this.data!["tracks/cups"];
    }

    get racetracks(): any {
        this.ensureLoaded();
        return this.data!["tracks/racetracks"];
    }

    get tracknames(): Record<string, string[]> {
        this.ensureLoaded();
        return this.data!["tracks/tracknames"];
    }

    get umaRaces(): Record<string, { turn: number; races: { id: number; name_en: string; icon_id: number }[] }[]> {
        this.ensureLoaded();
        return this.data!["tracks/uma_races"];
    }

    get uraRaces(): { instance: number; half: number; month: number; year: number }[] {
        this.ensureLoaded();
        return this.data!["tracks/ura_races"];
    }

    get courseShapes(): CourseShapeData {
        this.ensureLoaded();
        return this.data!["tracks/course_shapes"];
    }

    get courseBaseRatios(): CourseBaseRatioData {
        this.ensureLoaded();
        return this.data!["tracks/course_base_ratios"];
    }

    get shopRefreshData(): any {
        this.ensureLoaded();
        return this.data!["shop_refresh/data"];
    }

    get skillNameFallbacks(): SkillNameFallbackEntry[] {
        this.ensureLoaded();
        return this.data!["skills"] ?? [];
    }

    getSkillNameFallback(skillId: number): SkillNameFallbackEntry | undefined {
        this.ensureLoaded();

        if (!this.skillNameFallbacksById) {
            this.skillNameFallbacksById = {};
            for (const entry of this.skillNameFallbacks) {
                this.skillNameFallbacksById[entry.id] = entry;
            }
        }

        return this.skillNameFallbacksById[skillId];
    }
}

const GameDataLoader = new GameDataLoaderClass();
export default GameDataLoader;

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

    async initialize(): Promise<void> {
        if (this.data) return;

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(
                import.meta.env.BASE_URL + "data/gamedata.bin.gz",
                { cache: "no-cache", signal: controller.signal }
            );
            if (!response.ok) {
                throw new Error(`Failed to fetch data/gamedata.bin.gz (${response.status} ${response.statusText})`);
            }
            const buffer = await response.arrayBuffer();
            const inflated = pako.inflate(new Uint8Array(buffer), { to: "string" });
            this.data = JSON.parse(inflated);
            this.skillNameFallbacksById = null;
        } finally {
            window.clearTimeout(timeoutId);
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
        return this.data!["tracks/course_data"] ?? {};
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

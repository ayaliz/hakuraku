import GameDataLoader from "./GameDataLoader";

export type CourseShapePoint = [number, number];

export interface CourseShapeEntry {
    baseRatio?: number;
    distance: number;
    pointCount: number;
    pointStep: number;
    sourceFile: string;
    points: CourseShapePoint[];
}

export type CourseShapeData = Record<string, CourseShapeEntry>;
export type CourseBaseRatioData = Record<string, number>;

class CourseShapeLoaderClass {
    private data: CourseShapeData | null = null;
    private baseRatios: CourseBaseRatioData | null = null;
    private loadingPromise: Promise<void> | null = null;

    async initialize(): Promise<void> {
        if (this.data) return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            await GameDataLoader.initialize();
            const shapeData = structuredClone(GameDataLoader.courseShapes);
            const ratioData = GameDataLoader.courseBaseRatios;

            for (const [trackId, entry] of Object.entries(shapeData)) {
                const baseRatio = ratioData[trackId];
                if (typeof baseRatio === "number") {
                    entry.baseRatio = baseRatio;
                }
            }

            this.data = shapeData;
            this.baseRatios = ratioData;
        })();

        try {
            await this.loadingPromise;
        } catch (error) {
            this.loadingPromise = null;
            throw error;
        }
    }

    getCourseShape(trackId: string): CourseShapeEntry | undefined {
        return this.data?.[trackId];
    }

    getBaseRatio(trackId: string): number | undefined {
        return this.data?.[trackId]?.baseRatio ?? this.baseRatios?.[trackId];
    }
}

const CourseShapeLoader = new CourseShapeLoaderClass();
export default CourseShapeLoader;

export type CourseShapePoint = [number, number];

export interface CourseShapeEntry {
    distance: number;
    pointCount: number;
    pointStep: number;
    sourceFile: string;
    points: CourseShapePoint[];
}

export type CourseShapeData = Record<string, CourseShapeEntry>;

class CourseShapeLoaderClass {
    private data: CourseShapeData | null = null;
    private loadingPromise: Promise<void> | null = null;

    async initialize(): Promise<void> {
        if (this.data) return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            const response = await fetch(
                import.meta.env.BASE_URL + "data/course-shapes.json",
                { cache: "no-cache" }
            );
            if (!response.ok) {
                throw new Error(`Failed to load course shapes (${response.status})`);
            }
            this.data = await response.json() as CourseShapeData;
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
}

const CourseShapeLoader = new CourseShapeLoaderClass();
export default CourseShapeLoader;

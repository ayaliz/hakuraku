import * as pako from "pako";

class GameDataLoaderClass {
    private data: Record<string, any> | null = null;

    async initialize(): Promise<void> {
        if (this.data) return;

        const response = await fetch(
            process.env.PUBLIC_URL + "/data/gamedata.bin.gz",
            { cache: "no-cache" }
        );
        const buffer = await response.arrayBuffer();
        const inflated = pako.inflate(new Uint8Array(buffer), { to: "string" });
        this.data = JSON.parse(inflated);
    }

    private ensureLoaded() {
        if (!this.data) {
            throw new Error(
                "GameDataLoader not initialized. Call initialize() first."
            );
        }
    }

    get skills(): any[] {
        this.ensureLoaded();
        return this.data!["skills"];
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
        return this.data!["tracks/course_data"];
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

}

const GameDataLoader = new GameDataLoaderClass();
export default GameDataLoader;

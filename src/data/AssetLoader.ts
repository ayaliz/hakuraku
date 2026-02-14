import * as pako from "pako";

class AssetLoaderClass {
    private manifest: Map<string, { offset: number; length: number }> | null = null;
    private dataStart: number = 0;
    private rawBuffer: Uint8Array | null = null;
    private urlCache = new Map<string, string>();

    async initialize(): Promise<void> {
        if (this.manifest) return;

        const response = await fetch(
            process.env.PUBLIC_URL + "/data/assets.bin.gz",
            { cache: "no-cache" }
        );
        const buffer = await response.arrayBuffer();
        const inflated = pako.inflate(new Uint8Array(buffer));
        this.rawBuffer = inflated;

        const view = new DataView(inflated.buffer, inflated.byteOffset, inflated.byteLength);
        let pos = 0;

        const entryCount = view.getUint32(pos, true);
        pos += 4;

        this.manifest = new Map();
        for (let i = 0; i < entryCount; i++) {
            const keyLen = view.getUint16(pos, true);
            pos += 2;

            const keyBytes = inflated.slice(pos, pos + keyLen);
            const key = new TextDecoder().decode(keyBytes);
            pos += keyLen;

            const offset = view.getUint32(pos, true);
            pos += 4;
            const length = view.getUint32(pos, true);
            pos += 4;

            this.manifest.set(key, { offset, length });
        }

        this.dataStart = pos;
    }

    private ensureLoaded() {
        if (!this.manifest || !this.rawBuffer) {
            throw new Error("AssetLoader not initialized. Call initialize() first.");
        }
    }

    getAssetUrl(key: string): string | null {
        this.ensureLoaded();
        const cached = this.urlCache.get(key);
        if (cached !== undefined) return cached;

        const entry = this.manifest!.get(key);
        if (!entry) {
            this.urlCache.set(key, "");
            return null;
        }

        const start = this.dataStart + entry.offset;
        const slice = this.rawBuffer!.slice(start, start + entry.length);
        const blob = new Blob([slice], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        this.urlCache.set(key, url);
        return url;
    }

    getCharaIcon(charaId: number): string | null {
        return this.getAssetUrl(`umamusume_icons/chr_icon_${charaId}.png`);
    }

    getCharaThumb(cardId: number): string | null {
        const prefix = Math.floor(cardId / 100);
        return this.getAssetUrl(`character_thumbs/chara_stand_${prefix}_${cardId}.png`);
    }

    getStatIcon(name: string): string | null {
        return this.getAssetUrl(`textures/${name}.png`);
    }

    getRankIcon(filename: string): string | null {
        return this.getAssetUrl(`textures/uma_ranks/${filename}.png`);
    }

    getSupportCardIcon(id: number): string | null {
        return this.getAssetUrl(`umamusume_cards/tex_support_card_${id}.png`);
    }

    getBlockedIcon(): string | null {
        return this.getAssetUrl("umamusume_icons/blocked.png");
    }

    getGradeIcon(grade: string): string | null {
        const gradeToNum: Record<string, string> = {
            G: "00", F: "02", E: "04", D: "06",
            C: "08", B: "10", A: "12", S: "14",
        };
        const num = gradeToNum[grade];
        if (!num) return null;
        return this.getRankIcon(`utx_ico_statusrank_${num}`);
    }

    hasAsset(key: string): boolean {
        this.ensureLoaded();
        return this.manifest!.has(key);
    }
}

const AssetLoader = new AssetLoaderClass();
export default AssetLoader;

class AssetLoaderClass {
    async initialize(): Promise<void> { }

    getAssetUrl(key: string): string {
        return `${import.meta.env.BASE_URL}assets/${key}`;
    }

    getCharaIcon(charaId: number): string {
        return this.getAssetUrl(`umamusume_icons/chr_icon_${charaId}.webp`);
    }

    getCharaThumb(cardId: number): string {
        const prefix = Math.floor(cardId / 100);
        return this.getAssetUrl(`character_thumbs/chara_stand_${prefix}_${cardId}.webp`);
    }

    getStatIcon(name: string): string {
        return this.getAssetUrl(`textures/${name}.webp`);
    }

    getRankIcon(filename: string): string {
        return this.getAssetUrl(`textures/uma_ranks/${filename}.webp`);
    }

    getSupportCardIcon(id: number): string {
        return this.getAssetUrl(`umamusume_cards/tex_support_card_${id}.webp`);
    }

    getSkillIcon(iconId: number): string {
        return this.getAssetUrl(`skill_icons/utx_ico_skill_${iconId}.webp`);
    }

    getBlockedIcon(): string {
        return this.getAssetUrl("umamusume_icons/blocked.webp");
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
}

const AssetLoader = new AssetLoaderClass();
export default AssetLoader;

import pako from "pako";
import type { FrontendModel, RaceRoomModelSpec } from "./types";

const modelPromiseById = new Map<string, Promise<FrontendModel>>();

export async function loadRaceRoomModel(spec: RaceRoomModelSpec): Promise<FrontendModel> {
    const cacheKey = `${spec.id}:${spec.artifactPath}`;
    if (!modelPromiseById.has(cacheKey)) {
        const modelPromise = fetch(import.meta.env.BASE_URL + spec.artifactPath, { cache: "no-cache" })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${spec.label}: HTTP ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((buffer) => {
                const inflated = pako.inflate(new Uint8Array(buffer), { to: "string" });
                return JSON.parse(inflated) as FrontendModel;
            });
        modelPromiseById.set(cacheKey, modelPromise);
    }
    return modelPromiseById.get(cacheKey)!;
}

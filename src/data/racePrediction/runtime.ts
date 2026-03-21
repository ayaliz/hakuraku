import type { FrontendModel, RaceRoomPrediction } from "./types";

function gelu(value: number): number {
    return 0.5 * value * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (value + 0.044715 * Math.pow(value, 3))));
}

function layerNorm(row: number[], weight: number[], bias: number[], epsilon = 1e-5): number[] {
    const mean = row.reduce((sum, value) => sum + value, 0) / row.length;
    const variance = row.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / row.length;
    const denom = Math.sqrt(variance + epsilon);
    return row.map((value, index) => ((value - mean) / denom) * weight[index] + bias[index]);
}

function linear(row: number[], weight: FrontendModel["weights"][string], bias: FrontendModel["weights"][string]): number[] {
    const outDim = weight.shape[0];
    const inDim = weight.shape[1];
    const output = new Array(outDim).fill(0);
    for (let outIndex = 0; outIndex < outDim; outIndex++) {
        let sum = bias.data[outIndex] ?? 0;
        const offset = outIndex * inDim;
        for (let inIndex = 0; inIndex < inDim; inIndex++) {
            sum += weight.data[offset + inIndex] * row[inIndex];
        }
        output[outIndex] = sum;
    }
    return output;
}

function mlpBlock(row: number[], prefix: string, model: FrontendModel): number[] {
    const linear1 = linear(row, model.weights[`${prefix}.0.weight`], model.weights[`${prefix}.0.bias`]);
    const act1 = linear1.map(gelu);
    const norm1 = layerNorm(act1, model.weights[`${prefix}.2.weight`].data, model.weights[`${prefix}.2.bias`].data);
    const linear2 = linear(norm1, model.weights[`${prefix}.4.weight`], model.weights[`${prefix}.4.bias`]);
    const act2 = linear2.map(gelu);
    return layerNorm(act2, model.weights[`${prefix}.6.weight`].data, model.weights[`${prefix}.6.bias`].data);
}

function scorer(row: number[], model: FrontendModel): number {
    const l1 = linear(row, model.weights["scorer.0.weight"], model.weights["scorer.0.bias"]);
    const a1 = l1.map(gelu);
    const n1 = layerNorm(a1, model.weights["scorer.2.weight"].data, model.weights["scorer.2.bias"].data);
    const l2 = linear(n1, model.weights["scorer.4.weight"], model.weights["scorer.4.bias"]);
    const a2 = l2.map(gelu);
    const n2 = layerNorm(a2, model.weights["scorer.6.weight"].data, model.weights["scorer.6.bias"].data);
    const finalWeight = model.weights["scorer.8.weight"] ?? model.weights["scorer.7.weight"];
    const finalBias = model.weights["scorer.8.bias"] ?? model.weights["scorer.7.bias"];
    return linear(n2, finalWeight, finalBias)[0];
}

function softmax(values: number[]): number[] {
    const maxValue = Math.max(...values);
    const exps = values.map((value) => Math.exp(value - maxValue));
    const sum = exps.reduce((acc, value) => acc + value, 0);
    return exps.map((value) => value / sum);
}

export function predictEncodedRoom(
    normalizedFeatures: number[][][],
    orderedHorses: { frame_order: number; team_id: number }[],
    model: FrontendModel,
): RaceRoomPrediction[] {
    const horseEmbeddings = normalizedFeatures.flatMap((team) =>
        team.map((horse) => mlpBlock(horse, "horse_encoder.net", model))
    );
    const hiddenDim = model.modelConfig.hiddenDim;

    const teamMeans: number[][] = [];
    const teamMaxes: number[][] = [];
    for (let teamIndex = 0; teamIndex < normalizedFeatures.length; teamIndex++) {
        const teamHorses = horseEmbeddings.slice(teamIndex * 3, teamIndex * 3 + 3);
        const mean = new Array(hiddenDim).fill(0);
        const max = new Array(hiddenDim).fill(Number.NEGATIVE_INFINITY);
        teamHorses.forEach((horse) => {
            for (let i = 0; i < hiddenDim; i++) {
                mean[i] += horse[i] / teamHorses.length;
                if (horse[i] > max[i]) max[i] = horse[i];
            }
        });
        teamMeans.push(mean);
        teamMaxes.push(max);
    }

    const roomMean = new Array(hiddenDim).fill(0);
    const roomMax = new Array(hiddenDim).fill(Number.NEGATIVE_INFINITY);
    teamMeans.forEach((team) => {
        for (let i = 0; i < hiddenDim; i++) {
            roomMean[i] += team[i] / teamMeans.length;
        }
    });
    teamMaxes.forEach((team) => {
        for (let i = 0; i < hiddenDim; i++) {
            if (team[i] > roomMax[i]) roomMax[i] = team[i];
        }
    });

    const logits = horseEmbeddings.map((horse, index) => {
        const teamIndex = Math.floor(index / 3);
        if (model.modelConfig.modelType === "deepsets") {
            return scorer(
                [
                    ...horse,
                    ...teamMeans[teamIndex],
                    ...teamMaxes[teamIndex],
                    ...roomMean,
                    ...roomMax,
                ],
                model,
            );
        }
        return scorer([...horse, ...teamMeans[teamIndex], ...roomMean], model);
    });

    const probabilities = softmax(logits);
    const rankedIndices = [...probabilities.keys()].sort((a, b) => probabilities[b] - probabilities[a]);
    const rankByIndex = new Map(rankedIndices.map((horseIndex, rank) => [horseIndex, rank + 1]));

    return orderedHorses.map((horse, index) => ({
        frameOrder: horse.frame_order + 1,
        teamId: horse.team_id,
        probability: probabilities[index],
        rank: rankByIndex.get(index) ?? (index + 1),
    }));
}

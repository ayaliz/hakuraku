import { useEffect, useMemo, useState } from "react";
import { getSupportedRaceRoomModel, predictRaceRoom, type RaceRoomPrediction } from "../../../../data/racePrediction";

type PredictionState = {
    status: "idle" | "unsupported" | "loading" | "ready" | "error";
    predictions: RaceRoomPrediction[];
    error?: string;
};

export function useRacePredictions(raceHorseInfo: any[], effectiveCourseId: number | undefined) {
    const [state, setState] = useState<PredictionState>({
        status: "idle",
        predictions: [],
    });

    useEffect(() => {
        let cancelled = false;

        if (!raceHorseInfo || raceHorseInfo.length === 0 || effectiveCourseId === undefined) {
            setState({ status: "idle", predictions: [] });
            return () => {
                cancelled = true;
            };
        }

        const supportedModel = getSupportedRaceRoomModel(effectiveCourseId);
        if (!supportedModel) {
            setState({ status: "unsupported", predictions: [] });
            return () => {
                cancelled = true;
            };
        }

        setState({ status: "loading", predictions: [] });
        predictRaceRoom(raceHorseInfo, effectiveCourseId)
            .then((result) => {
                if (cancelled) return;
                if (!result || result.predictions.length === 0) {
                    setState({ status: "unsupported", predictions: [] });
                    return;
                }
                setState({
                    status: "ready",
                    predictions: result.predictions,
                });
            })
            .catch((error: Error) => {
                if (cancelled) return;
                setState({
                    status: "error",
                    predictions: [],
                    error: error.message,
                });
            });

        return () => {
            cancelled = true;
        };
    }, [raceHorseInfo, effectiveCourseId]);

    const predictionMap = useMemo(() => new Map(
        state.predictions.map((prediction) => [prediction.frameOrder, prediction])
    ), [state.predictions]);

    return {
        ...state,
        predictionMap,
    };
}

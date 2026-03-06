import pako from "pako";
import { create } from "@bufbuild/protobuf";
import {
    RaceSimulateData,
    RaceSimulateDataSchema,
    RaceSimulateData_EventDataWrapperSchema,
    RaceSimulateEventDataSchema,
    RaceSimulateEventData_SimulateEventType,
    RaceSimulateFrameDataSchema,
    RaceSimulateHeaderDataSchema,
    RaceSimulateHorseFrameDataSchema,
    RaceSimulateHorseResultData_RunningStyle,
    RaceSimulateHorseResultDataSchema,
} from "./race_data_pb";

// Struct layouts (all little-endian):
// header:      ii   = int32, int32                                         (8 bytes)
// raceStruct:  fiii = float32, int32, int32, int32                         (16 bytes)
// horseFrame:  fHHHbb = float32, uint16, uint16, uint16, int8, int8        (12 bytes)
// horseResult: ifffBBfBif = int32, f, f, f, uint8, uint8, f, uint8, i, f  (31 bytes)
// event:       fbb = float32, int8, int8                                   (6 bytes)

const RACE_STRUCT_SIZE = 16;
const EVENT_STRUCT_SIZE = 6;
const JP_HORSE_FRAME_SIZE = 12;
const JP_HORSE_RESULT_CORE_SIZE = 39;

function ensureReadable(view: DataView, offset: number, size: number) {
    if (offset < 0 || size < 0 || offset + size > view.byteLength) {
        throw new Error("Out-of-bounds race data");
    }
}

function deserializeHeader(view: DataView) {
    ensureReadable(view, 0, 8);
    const maxLength = view.getInt32(0, true);
    ensureReadable(view, 0, 4 + maxLength);
    const version = view.getInt32(4, true);
    return [create(RaceSimulateHeaderDataSchema, {maxLength, version}), 4 + maxLength] as const;
}

function deserializeHorseFrame(view: DataView, offset: number) {
    const distance         = view.getFloat32(offset,      true);
    const lanePosition     = view.getUint16 (offset + 4,  true);
    const speed            = view.getUint16 (offset + 6,  true);
    const hp               = view.getUint16 (offset + 8,  true);
    const temptationMode   = view.getInt8   (offset + 10);
    const blockFrontHorseIndex = view.getInt8(offset + 11);
    return create(RaceSimulateHorseFrameDataSchema, {
        distance, lanePosition, speed, hp, temptationMode, blockFrontHorseIndex,
    });
}

function deserializeFrame(view: DataView, offset: number, horseNum: number, horseFrameSize: number) {
    const frame = create(RaceSimulateFrameDataSchema, {time: view.getFloat32(offset, true)});
    offset += 4;
    for (let i = 0; i < horseNum; i++) {
        frame.horseFrame.push(deserializeHorseFrame(view, offset));
        offset += horseFrameSize;
    }
    return frame;
}

function deserializeHorseResult(view: DataView, offset: number) {
    const finishOrder            = view.getInt32  (offset,      true);
    const finishTime             = view.getFloat32(offset + 4,  true);
    const finishDiffTime         = view.getFloat32(offset + 8,  true);
    const startDelayTime         = view.getFloat32(offset + 12, true);
    const gutsOrder              = view.getUint8  (offset + 16);
    const wizOrder               = view.getUint8  (offset + 17);
    const lastSpurtStartDistance = view.getFloat32(offset + 18, true);
    const runningStyle           = view.getUint8  (offset + 22);
    const defeat                 = view.getInt32  (offset + 23, true);
    const finishTimeRaw          = view.getFloat32(offset + 27, true);
    return create(RaceSimulateHorseResultDataSchema, {
        finishOrder, finishTime, finishDiffTime, startDelayTime,
        gutsOrder, wizOrder, lastSpurtStartDistance, runningStyle, defeat, finishTimeRaw,
    });
}

function deserializeEvent(view: DataView, offset: number) {
    const frameTime  = view.getFloat32(offset,     true);
    const type       = view.getInt8   (offset + 4);
    const paramCount = view.getInt8   (offset + 5);
    const event = create(RaceSimulateEventDataSchema, {frameTime, type, paramCount});
    offset += EVENT_STRUCT_SIZE;
    for (let i = 0; i < paramCount; i++) {
        event.param.push(view.getInt32(offset, true));
        offset += 4;
    }
    return event;
}

function deserialize(input: Uint8Array) {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

    let [header, offset] = deserializeHeader(view);
    const data = create(RaceSimulateDataSchema, {header});

    data.distanceDiffMax = view.getFloat32(offset,      true);
    data.horseNum        = view.getInt32  (offset + 4,  true);
    data.horseFrameSize  = view.getInt32  (offset + 8,  true);
    data.horseResultSize = view.getInt32  (offset + 12, true);
    offset += RACE_STRUCT_SIZE;

    const horseNum       = data.horseNum!;
    const horseFrameSize = data.horseFrameSize!;
    const horseResultSize = data.horseResultSize!;

    data.PaddingSize1 = view.getInt32(offset, true);
    offset += 4 + data.PaddingSize1!;

    data.frameCount = view.getInt32(offset,     true);
    data.frameSize  = view.getInt32(offset + 4, true);
    offset += 8;

    for (let i = 0; i < data.frameCount!; i++) {
        data.frame.push(deserializeFrame(view, offset, horseNum, horseFrameSize));
        offset += data.frameSize!;
    }

    data.PaddingSize2 = view.getInt32(offset, true);
    offset += 4 + data.PaddingSize2!;

    for (let i = 0; i < horseNum; i++) {
        data.horseResult.push(deserializeHorseResult(view, offset));
        offset += horseResultSize;
    }

    data.PaddingSize3 = view.getInt32(offset, true);
    offset += 4 + data.PaddingSize3!;

    data.eventCount = view.getInt32(offset, true);
    offset += 4;

    for (let i = 0; i < data.eventCount!; i++) {
        const eventWrapper = create(RaceSimulateData_EventDataWrapperSchema);
        eventWrapper.eventSize = view.getInt16(offset, true);
        offset += 2;
        eventWrapper.event = deserializeEvent(view, offset);
        offset += eventWrapper.eventSize;
        data.event.push(eventWrapper);
    }

    return data;
}

function normalizeLanePosition(value: number) {
    const normalized = value <= 1 ? Math.round(value * 10000) : Math.round(value);
    return Math.min(10000, Math.max(0, normalized));
}

function normalizeSpeed(value: number) {
    const normalized = value <= 30 ? Math.round(value * 100) : Math.round(value);
    return Math.max(0, normalized);
}

function toSignedInt8(v: number) {
    return v > 127 ? v - 256 : v;
}

function isPlausibleHorseFrame(view: DataView, offset: number) {
    if (offset + JP_HORSE_FRAME_SIZE > view.byteLength) return false;
    const distance = view.getFloat32(offset, true);
    const lanePosRaw = view.getUint16(offset + 4, true);
    const speedRaw = view.getUint16(offset + 6, true);
    const hp = view.getUint16(offset + 8, true);
    return distance >= 0 && distance <= 10000 && lanePosRaw <= 20000 && speedRaw <= 10000 && hp <= 6000;
}

function readHorseFrameJp(view: DataView, offset: number) {
    ensureReadable(view, offset, JP_HORSE_FRAME_SIZE);
    const distance = view.getFloat32(offset, true);
    const lanePositionRaw = view.getUint16(offset + 4, true);
    const speedRaw = view.getUint16(offset + 6, true);
    const hp = view.getUint16(offset + 8, true);
    const temptationRaw = view.getUint16(offset + 10, true);
    const lanePosition = normalizeLanePosition(lanePositionRaw);
    const speed = normalizeSpeed(speedRaw);
    const temptationMode = temptationRaw & 0xff;
    const blockFrontHorseIndex = toSignedInt8((temptationRaw >> 8) & 0xff);
    return create(RaceSimulateHorseFrameDataSchema, {
        distance,
        lanePosition,
        speed,
        hp,
        temptationMode,
        blockFrontHorseIndex,
    });
}

function isValidFrameStart(view: DataView, offset: number, horseNum: number) {
    const frameSize = 4 + horseNum * JP_HORSE_FRAME_SIZE;
    if (offset < 32 || offset + frameSize > view.byteLength) return false;
    const frameTime = view.getFloat32(offset, true);
    if (frameTime < 0 || frameTime > 200) return false;
    const horseStart = offset + 4;
    for (let i = 0; i < horseNum; i++) {
        const horseOffset = horseStart + i * JP_HORSE_FRAME_SIZE;
        if (!isPlausibleHorseFrame(view, horseOffset)) return false;
    }
    return true;
}

function readFrameAtJp(view: DataView, offset: number, horseNum: number) {
    const frame = create(RaceSimulateFrameDataSchema, {time: view.getFloat32(offset, true)});
    let horseOffset = offset + 4;
    for (let i = 0; i < horseNum; i++) {
        frame.horseFrame.push(readHorseFrameJp(view, horseOffset));
        horseOffset += JP_HORSE_FRAME_SIZE;
    }
    return frame;
}

function findNextBlockStart(view: DataView, searchStart: number, horseNum: number, lastTime: number) {
    const frameSize = 4 + horseNum * JP_HORSE_FRAME_SIZE;
    for (let offset = searchStart; offset <= view.byteLength - frameSize; offset += 4) {
        if (!isValidFrameStart(view, offset, horseNum)) continue;
        const frameTime = view.getFloat32(offset, true);
        if (frameTime <= lastTime) continue;
        const nextOffset = offset + frameSize;
        if (isValidFrameStart(view, nextOffset, horseNum)) {
            const nextTime = view.getFloat32(nextOffset, true);
            if (frameTime < nextTime && nextTime <= 200) return offset;
        }
        const prevOffset = offset - frameSize;
        if (prevOffset < searchStart && frameTime > lastTime) return offset;
    }
    return null;
}

function comprehensiveBlockDetection(view: DataView, horseNum: number) {
    const frameSize = 4 + horseNum * JP_HORSE_FRAME_SIZE;
    const allFrames: ReturnType<typeof readFrameAtJp>[] = [];
    let currentStart = isValidFrameStart(view, 32, horseNum) ? 32 : findNextBlockStart(view, 32, horseNum, -1);
    let lastTime = -1;
    while (currentStart !== null) {
        let currentOffset = currentStart;
        let blockCount = 0;
        while (isValidFrameStart(view, currentOffset, horseNum)) {
            const frameTime = view.getFloat32(currentOffset, true);
            if (frameTime <= lastTime) break;
            allFrames.push(readFrameAtJp(view, currentOffset, horseNum));
            lastTime = frameTime;
            currentOffset += frameSize;
            blockCount++;
        }
        if (blockCount === 0) break;
        currentStart = findNextBlockStart(view, currentOffset, horseNum, lastTime);
    }
    allFrames.sort((a, b) => a.time - b.time);
    const seen = new Set<number>();
    const unique: ReturnType<typeof readFrameAtJp>[] = [];
    for (const frame of allFrames) {
        const key = Math.round(frame.time * 1_000_000);
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(frame);
        }
    }
    return unique;
}

function readHorseResultJp(view: DataView, offset: number) {
    ensureReadable(view, offset, JP_HORSE_RESULT_CORE_SIZE);
    const finishOrder = view.getInt32(offset, true);
    const finishTime = view.getFloat32(offset + 4, true);
    const finishDiffTime = view.getFloat32(offset + 8, true);
    const startDelayTime = view.getFloat32(offset + 12, true);
    const gutsPacked = view.getUint16(offset + 16, true);
    const lastSpurtStartDistance = view.getFloat32(offset + 18, true);
    const runningStyleRaw = view.getUint8(offset + 22);
    const defeat = view.getInt32(offset + 23, true);
    const finishTimeRaw = view.getFloat32(offset + 27, true);
    const noActivateSkillCount = view.getInt32(offset + 35, true);
    if (noActivateSkillCount < 0 || noActivateSkillCount > 512) {
        throw new Error("Invalid JP horse result payload");
    }
    const nextOffset = offset + JP_HORSE_RESULT_CORE_SIZE + noActivateSkillCount * 5;
    ensureReadable(view, offset, nextOffset - offset);
    const runningStyle = runningStyleRaw >= 1 && runningStyleRaw <= 4
        ? runningStyleRaw
        : RaceSimulateHorseResultData_RunningStyle.NONE;
    const result = create(RaceSimulateHorseResultDataSchema, {
        finishOrder,
        finishTime,
        finishDiffTime,
        startDelayTime,
        gutsOrder: gutsPacked & 0xff,
        wizOrder: (gutsPacked >> 8) & 0xff,
        lastSpurtStartDistance,
        runningStyle,
        defeat,
        finishTimeRaw,
    });
    return {result, nextOffset};
}

function isPlausibleHorseResult(horseNum: number, finishOrder: number, finishTime: number, finishDiffTime: number, startDelayTime: number, runningStyle: number, defeat: number) {
    return finishOrder >= 0
        && finishOrder < horseNum
        && finishTime >= 100
        && finishTime <= 220
        && finishDiffTime >= 0
        && finishDiffTime <= 60
        && startDelayTime >= 0
        && startDelayTime <= 5
        && runningStyle >= 0
        && runningStyle <= 10
        && defeat >= -32
        && defeat <= 32;
}

function parseHorseResultsNearOffset(view: DataView, startGuess: number, horseNum: number) {
    for (let startOffset = startGuess; startOffset < Math.min(startGuess + 128, view.byteLength - 1); startOffset += 4) {
        const results: RaceSimulateData["horseResult"] = [];
        let offset = startOffset;
        let ok = true;
        for (let i = 0; i < horseNum; i++) {
            try {
                const parsed = readHorseResultJp(view, offset);
                const r = parsed.result;
                if (!isPlausibleHorseResult(horseNum, r.finishOrder, r.finishTime, r.finishDiffTime, r.startDelayTime, r.runningStyle, r.defeat)) {
                    ok = false;
                    break;
                }
                results.push(r);
                offset = parsed.nextOffset;
            } catch {
                ok = false;
                break;
            }
        }
        if (!ok) continue;
        const finishOrders = new Set(results.map(r => r.finishOrder));
        if (finishOrders.size !== horseNum) continue;
        return {results, endOffset: offset};
    }
    return {results: [] as RaceSimulateData["horseResult"], endOffset: null as number | null};
}

function findAllHorseResults(view: DataView, horseNum: number) {
    const found: {offset: number, result: RaceSimulateData["horseResult"][number]}[] = [];
    for (let offset = 32; offset <= view.byteLength - JP_HORSE_RESULT_CORE_SIZE; offset++) {
        try {
            const parsed = readHorseResultJp(view, offset);
            const r = parsed.result;
            if (isPlausibleHorseResult(horseNum, r.finishOrder, r.finishTime, r.finishDiffTime, r.startDelayTime, r.runningStyle, r.defeat)) {
                found.push({offset, result: r});
            }
        } catch {
            continue;
        }
    }
    found.sort((a, b) => a.offset - b.offset);
    const uniqueByOrder = new Map<number, RaceSimulateData["horseResult"][number]>();
    for (const entry of found) {
        if (!uniqueByOrder.has(entry.result.finishOrder)) {
            uniqueByOrder.set(entry.result.finishOrder, entry.result);
        }
    }
    return Array.from(uniqueByOrder.values());
}

function mapJpEventType(typeId: number, paramCount: number) {
    if (typeId === 1 || typeId === 3) return RaceSimulateEventData_SimulateEventType.SKILL;
    if (typeId === 2 || typeId === 4 || paramCount === 2) return RaceSimulateEventData_SimulateEventType.COMPETE_TOP;
    return typeId as RaceSimulateEventData_SimulateEventType;
}

function readEventJp(view: DataView, offset: number) {
    ensureReadable(view, offset, 6);
    const frameTime = view.getFloat32(offset, true);
    const typeId = view.getUint8(offset + 4);
    const paramCount = view.getUint8(offset + 5);
    if (paramCount > 64) {
        throw new Error("Invalid JP event param count");
    }
    let cursor = offset + EVENT_STRUCT_SIZE;
    ensureReadable(view, cursor, paramCount * 4 + 3);
    const param: number[] = [];
    for (let i = 0; i < paramCount; i++) {
        param.push(view.getInt32(cursor, true));
        cursor += 4;
    }
    cursor += 3;
    const event = create(RaceSimulateEventDataSchema, {
        frameTime,
        type: mapJpEventType(typeId, paramCount),
        paramCount,
        param,
    });
    return {event, typeId, nextOffset: cursor};
}

function isPlausibleEvent(typeId: number, frameTime: number, paramCount: number) {
    return frameTime >= 0 && frameTime <= 1000 && typeId >= 0 && typeId <= 255 && paramCount <= 64;
}

function parseEventSequenceWithCount(view: DataView, startOffset: number, eventCount: number) {
    const events: {event: ReturnType<typeof create<typeof RaceSimulateEventDataSchema>>, eventSize: number}[] = [];
    let offset = startOffset;
    for (let i = 0; i < eventCount; i++) {
        try {
            const parsed = readEventJp(view, offset);
            if (!isPlausibleEvent(parsed.typeId, parsed.event.frameTime, parsed.event.paramCount)) {
                return events;
            }
            events.push({event: parsed.event, eventSize: 6 + parsed.event.paramCount * 4});
            offset = parsed.nextOffset;
        } catch {
            return events;
        }
    }
    return events;
}

function parseSimEventsWithCountNearOffset(view: DataView, startGuess: number, eventCount: number) {
    let bestEvents: ReturnType<typeof parseEventSequenceWithCount> = [];
    for (let padding = 0; padding <= 8; padding++) {
        const startOffset = startGuess + padding;
        if (startOffset >= view.byteLength) break;
        const events = parseEventSequenceWithCount(view, startOffset, eventCount);
        if (events.length > bestEvents.length) bestEvents = events;
        if (events.length === eventCount) return events;
    }
    return bestEvents;
}

function deserializeJp(input: Uint8Array) {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const [header] = deserializeHeader(view);
    let offset = 4 + header.maxLength;
    ensureReadable(view, offset, RACE_STRUCT_SIZE);
    const distanceDiffMax = view.getFloat32(offset, true);
    const horseNum = view.getInt32(offset + 4, true);
    const horseFrameSize = view.getInt32(offset + 8, true);
    const horseResultSize = view.getInt32(offset + 12, true);
    offset += RACE_STRUCT_SIZE;
    ensureReadable(view, offset, 4);
    const paddingSize1 = view.getInt32(offset, true);
    const frames = comprehensiveBlockDetection(view, horseNum);
    const frameSize = 4 + horseNum * JP_HORSE_FRAME_SIZE;
    const postFrameOffset = 32 + frames.length * frameSize;
    let horseResult: RaceSimulateData["horseResult"] = [];
    let resultsEndOffset: number | null = null;
    if (postFrameOffset + 12 <= view.byteLength) {
        const startGuess = postFrameOffset + 12;
        const near = parseHorseResultsNearOffset(view, startGuess, horseNum);
        horseResult = near.results;
        resultsEndOffset = near.endOffset;
    }
    if (horseResult.length === 0) {
        horseResult = findAllHorseResults(view, horseNum);
    }
    if (horseResult.length === 0) {
        throw new Error("Failed to parse JP horse results");
    }
    const event: RaceSimulateData["event"] = [];
    if (resultsEndOffset !== null && resultsEndOffset + 10 <= view.byteLength) {
        const simSyncRoot = view.getInt32(resultsEndOffset, true);
        const simSize = view.getInt32(resultsEndOffset + 4, true);
        const simVersion = view.getUint16(resultsEndOffset + 8, true);
        if (simSyncRoot >= 0 && simSyncRoot <= 1 && simSize >= 0 && simSize <= 5000 && simVersion >= 0 && simVersion <= 10000) {
            const events = parseSimEventsWithCountNearOffset(view, resultsEndOffset + 10, simSize);
            for (const e of events) {
                event.push(create(RaceSimulateData_EventDataWrapperSchema, {
                    eventSize: e.eventSize,
                    event: e.event,
                }));
            }
        }
    }
    return create(RaceSimulateDataSchema, {
        header,
        distanceDiffMax,
        horseNum,
        horseFrameSize: horseFrameSize > 0 ? horseFrameSize : JP_HORSE_FRAME_SIZE,
        horseResultSize,
        PaddingSize1: paddingSize1,
        frameCount: frames.length,
        frameSize,
        frame: frames,
        PaddingSize2: 0,
        horseResult,
        PaddingSize3: 0,
        eventCount: event.length,
        event,
    });
}

function deserializeFromBase64(input: string) {
    const decoded = pako.inflate(Uint8Array.from(atob(input), c => c.charCodeAt(0)));
    try {
        return deserialize(decoded);
    } catch (globalError: any) {
        try {
            return deserializeJp(decoded);
        } catch (jpError: any) {
            throw new Error(`Failed to parse race data. Global parser error: ${globalError?.message ?? String(globalError)}. JP parser error: ${jpError?.message ?? String(jpError)}`);
        }
    }
}

export {deserializeFromBase64};

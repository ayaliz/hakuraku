import pako from "pako";
import { create } from "@bufbuild/protobuf";
import {
    RaceSimulateDataSchema,
    RaceSimulateData_EventDataWrapperSchema,
    RaceSimulateEventDataSchema,
    RaceSimulateFrameDataSchema,
    RaceSimulateHeaderDataSchema,
    RaceSimulateHorseFrameDataSchema,
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

function deserializeHeader(view: DataView) {
    const maxLength = view.getInt32(0, true);
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

function deserializeFromBase64(input: string) {
    return deserialize(pako.inflate(Uint8Array.from(atob(input), c => c.charCodeAt(0))));
}

export {deserializeFromBase64};

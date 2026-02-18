import React, { Fragment } from "react";
import { Table } from "react-bootstrap";
import { TrainedCharaData } from "../data/TrainedCharaData";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";

import AssetLoader from "../data/AssetLoader";

const gradeLetters = ["", "G", "F", "E", "D", "C", "B", "A", "S"];
let _gradeImages: Record<number, string> | null = null;
function getGradeImages(): Record<number, string> {
  if (!_gradeImages) {
    _gradeImages = {};
    for (let i = 1; i <= 8; i++) {
      const url = AssetLoader.getGradeIcon(gradeLetters[i]);
      if (url) _gradeImages[i] = url;
    }
  }
  return _gradeImages;
}

const GradeDisplay = ({ value }: { value: number }) => {
  const src = getGradeImages()[value];
  if (!src) return <>{UMDatabaseUtils.charaProperLabels[value]}</>;
  return <img src={src} alt={UMDatabaseUtils.charaProperLabels[value]} style={{ height: '20px', width: 'auto', verticalAlign: 'middle' }} />;
};

type CharaProperLabelsProps = {
  chara: TrainedCharaData,
  groundFilter?: number,       // 1 = Turf only, 2 = Dirt only; omit for both
  distanceFilter?: number,     // 1–4 (Sprint/Mile/Medium/Long); omit for all
  runningStyleFilter?: number, // 1–4 (Front Runner/Pace Chaser/Late Surger/End Closer); omit for all
};

export default function CharaProperLabels({ chara, groundFilter, distanceFilter, runningStyleFilter }: CharaProperLabelsProps) {
  const distanceEntries = Object
    .entries(UMDatabaseUtils.distanceLabels as Record<number, string>)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .filter(([k]) => distanceFilter == null || Number(k) === distanceFilter);

  const runningStyleEntries = Object
    .entries(UMDatabaseUtils.runningStyleLabels as Record<number, string>)
    .filter(([k]) => Number(k) !== 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .filter(([k]) => runningStyleFilter == null || Number(k) === runningStyleFilter);

  return (
    <Table size="sm" className="w-auto m-2">
      <tbody>
        <tr>
          {(groundFilter == null || groundFilter === 1) && <>
            <td>Turf</td>
            <td className="text-center"><GradeDisplay value={chara.properGroundTurf} /></td>
          </>}
          {(groundFilter == null || groundFilter === 2) && <>
            <td>Dirt</td>
            <td className="text-center"><GradeDisplay value={chara.properGroundDirt} /></td>
          </>}
        </tr>

        <tr>
          {distanceEntries.map(([k, name]) => {
            const idx = Number(k);
            return [
              <td key={`dist-${idx}-label`}>{name}</td>,
              <td key={`dist-${idx}-value`} className="text-center"><GradeDisplay value={chara.properDistances[idx]} /></td>
            ];
          })}
        </tr>

        <tr>
          {runningStyleEntries.map(([k, name]) => {
            const idx = Number(k);
            return [
              <td key={`rs-${idx}-label`}>{name}</td>,
              <td key={`rs-${idx}-value`} className="text-center"><GradeDisplay value={chara.properRunningStyles[idx]} /></td>
            ];
          })}
        </tr>
      </tbody>
    </Table>
  );
}

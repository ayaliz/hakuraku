import React, { Fragment } from "react";
import { Table } from "react-bootstrap";
import { TrainedCharaData } from "../data/TrainedCharaData";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";

import imgG from "../data/textures/G.png";
import imgF from "../data/textures/F.png";
import imgE from "../data/textures/E.png";
import imgD from "../data/textures/D.png";
import imgC from "../data/textures/C.png";
import imgB from "../data/textures/B.png";
import imgA from "../data/textures/A.png";
import imgS from "../data/textures/S.png";

const gradeImages: Record<number, string> = {
  1: imgG, 2: imgF, 3: imgE, 4: imgD,
  5: imgC, 6: imgB, 7: imgA, 8: imgS
};

const GradeDisplay = ({ value }: { value: number }) => {
  const src = gradeImages[value];
  if (!src) return <>{UMDatabaseUtils.charaProperLabels[value]}</>;
  return <img src={src} alt={UMDatabaseUtils.charaProperLabels[value]} style={{ height: '20px', width: '20px', verticalAlign: 'middle' }} />;
};

type CharaProperLabelsProps = {
  chara: TrainedCharaData,
};

export default function CharaProperLabels({ chara }: CharaProperLabelsProps) {
  const distanceEntries = Object
    .entries(UMDatabaseUtils.distanceLabels as Record<number, string>)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const runningStyleEntries = Object
    .entries(UMDatabaseUtils.runningStyleLabels as Record<number, string>)
    .filter(([k]) => Number(k) !== 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <Table size="sm" className="w-auto m-2">
      <tbody>
        <tr>
          <td>Turf</td>
          <td className="text-center"><GradeDisplay value={chara.properGroundTurf} /></td>
          <td>Dirt</td>
          <td className="text-center"><GradeDisplay value={chara.properGroundDirt} /></td>
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

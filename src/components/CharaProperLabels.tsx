import _ from "lodash";
import React from "react";
import {Table} from "react-bootstrap";
import {TrainedCharaData} from "../data/TrainedCharaData";
import * as UMDatabaseUtils from "../data/UMDatabaseUtils";

type CharaProperLabelsProps = {
  chara: TrainedCharaData,
};

export default function CharaProperLabels(props: CharaProperLabelsProps) {
  const distanceEntries = Object
    .entries(UMDatabaseUtils.distanceLabels as Record<number, string>)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  const runningStyleEntries = Object
    .entries(UMDatabaseUtils.runningStyleLabels as Record<number, string>)
    .filter(([k]) => Number(k) !== 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <Table size="small" className="w-auto m-2">
      <tbody>
        <tr>
          <td>Turf</td>
          <td>{UMDatabaseUtils.charaProperLabels[props.chara.properGroundTurf]}</td>
          <td>Dirt</td>
          <td>{UMDatabaseUtils.charaProperLabels[props.chara.properGroundDirt]}</td>
        </tr>

        <tr>
          {distanceEntries.map(([k, name]) => {
            const idx = Number(k);
            return (
              <React.Fragment key={`dist-${idx}`}>
                <td>{name}</td>
                <td>{UMDatabaseUtils.charaProperLabels[props.chara.properDistances[idx]]}</td>
              </React.Fragment>
            );
          })}
        </tr>

        <tr>
          {runningStyleEntries.map(([k, name]) => {
            const idx = Number(k);
            return (
              <React.Fragment key={`rs-${idx}`}>
                <td>{name}</td>
                <td>{UMDatabaseUtils.charaProperLabels[props.chara.properRunningStyles[idx]]}</td>
              </React.Fragment>
            );
          })}
        </tr>
      </tbody>
    </Table>
  );
}

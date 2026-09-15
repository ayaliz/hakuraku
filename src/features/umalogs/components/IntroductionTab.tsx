import React from "react";

type IntroductionTabProps = {
    totalRaces: number;
    cmLabel: string;
};

const IntroductionTab: React.FC<IntroductionTabProps> = ({ totalRaces, cmLabel }) => (
    <div className="uma-intro-tab">
        <p>
            Welcome to the public room data page, aka UmaLogs. It currently serves stats for{" "}
            <strong>{totalRaces.toLocaleString()}</strong> total {cmLabel} room matches.
        </p>
        <h5>Adjusted Win Rates</h5>
        <p>
            In many places you&apos;ll see references to adjusted win rates over raw win rates. To
            prevent umas or teams with very low representation in the data from dominating win
            rate leaderboards - for example, something like 3 wins in 4 appearances counting as
            a 75% win rate and appearing above popular, strong umas that scored below 75% - the
            Bayesian average is used:
        </p>
        <ul>
            <li>Per-uma data: prior m = 1/9, C = 54</li>
            <li>Per-team data: prior m = 1/3, C = 18</li>
            <li>Per-skill win rates: prior m = uma&apos;s base win rate in the data, C = 54</li>
        </ul>
    </div>
);

export default IntroductionTab;

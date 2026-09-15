import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql as sqlLang, SQLite } from "@codemirror/lang-sql";
import type { Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";

const HELP_EXAMPLES = [
    {
        title: "Debuffers by original style",
        query: `select uma, style, is_debuffer, entries, win_rate
where style = "Pace Chaser" and is_debuffer = true
group by uma, style, is_debuffer
order by entries desc
limit 20`,
    },
    {
        title: "Activation rate for one Uma",
        query: `select uma, style, entries, activated_entries(Angling and Scheming), activation_rate(Angling and Scheming), win_rate
where uma = [Reeling in the Big One] and style = "Front Runner"
group by uma, style
order by entries desc
limit 20`,
    },
    {
        title: "Activation baseline",
        query: `select entries, activated_entries(Angling and Scheming), activation_rate(Angling and Scheming), win_rate
where uma = [Reeling in the Big One] and style = "Front Runner"
limit 1`,
    },
    {
        title: "Activation without another skill",
        query: `select entries, activated_entries(Angling and Scheming), activation_rate(Angling and Scheming), win_rate
where uma = [Reeling in the Big One] and style = "Front Runner"
  and not has_skill(Taking the Lead)
limit 1`,
    },
    {
        title: "Find high-score cohorts with either of two skills",
        query: `select uma, style, entries, win_rate, avg_speed, avg_stamina, avg_power, avg_wit
where rank_score >= 20000
  and learned has any (Angling and Scheming, Taking the Lead)
group by uma, style
order by win_rate desc
limit 25`,
    },
    {
        title: "Support card cohort",
        query: `select card, style, entries, wins, win_rate
where support_cards has [Fire at My Heels] Kitasan Black and speed >= 1200
group by card, style
order by entries desc
limit 20`,
    },
    {
        title: "Room composition comparison",
        query: `select uma, style, room_front_count, entries, win_rate
where style = "Pace Chaser" and room_front_count = 0
group by uma, style, room_front_count
order by win_rate desc
limit 25`,
    },
    {
        title: "Team composition",
        query: `select uma, style, teams, team_wins, team_win_rate
where team has all (
  member(style = "Front Runner" and has_skill(Angling and Scheming)),
  member(style = "Front Runner" and has_skill(Taking the Lead)),
  member(style = "Pace Chaser")
)
group by uma, style
order by team_win_rate desc
limit 20`,
    },
    {
        title: "Winning Uma against a losing Uma",
        query: `select uma, style, entries, wins, win_rate
where winning_team has member(uma = [Wild Frontier])
  and losing_team has member(uma = [Starlight Beat])
group by uma, style
order by wins desc
limit 20`,
    },
];

const FILTER_FIELDS = [
    "frame_order",
    "style / strategy",
    "is_debuffer / debuffer",
    "uma / card / card_id",
    "chara_id",
    "speed",
    "stamina",
    "power / pow",
    "guts",
    "wit / wiz",
    "rank_score / score",
    "finish_order / finish",
    "finish_time",
    "race_distance",
    "career_wins",
    "mood",
    "activation_chance",
    "apt_ground",
    "apt_distance",
    "apt_style",
    "total_skill_points / skill_points",
    "deck_race_bonus",
    "race_type",
    "uma_count",
    "team_count",
    "is_full_room / full_room",
    "has_replay_data",
    "ground_condition",
    "weather",
    "season",
    "room_front_count",
    "room_front_runner_count",
    "room_runaway_count",
    "room_pace_count",
    "room_late_count",
    "room_end_count",
    "room_debuffer_count",
    "winner_team_id",
    "winner_card_id",
    "winner_chara_id",
    "winner_strategy",
    "team_front_count",
    "team_front_runner_count",
    "team_runaway_count",
    "team_pace_count",
    "team_late_count",
    "team_end_count",
    "is_winner_team",
    "team_id",
    "won",
    "team has member(...)",
    "team has all (member(...), member(...))",
    "any_team has member(...)",
    "winning_team has member(...)",
    "losing_team has member(...)",
];

const HELP_SKILL_FIELDS = [
    "learned has Skill Name",
    "activated has Skill Name",
    "learned has any (Skill A, Skill B)",
    "learned has all (Skill A, Skill B)",
    "not learned has Skill Name",
    "has_skill(Skill Name) as an alias for learned has Skill Name",
    "has_activated_skill(Skill Name) as an alias for activated has Skill Name",
    "support_cards has Support Card Name",
    "support_cards has Support Card Name at lb 4",
    "has_support_card(Support Card Name) as an alias for support_cards has Support Card Name",
    "team has member(style = \"Front Runner\" and has_skill(Skill Name))",
    "team has all (member(...), member(...)) requires distinct team members",
    "any_team has member(...) matches any team in the race",
    "winning_team has member(...) matches the race winner's team",
    "losing_team has member(...) matches any non-winning team",
];

const SELECT_FIELDS = [
    "uma",
    "card",
    "style",
    "is_debuffer",
    "chara_id",
    "race_distance",
    "ground_condition",
    "weather",
    "season",
    "room_front_count",
    "room_pace_count",
    "room_late_count",
    "room_end_count",
    "room_debuffer_count",
    "winner_strategy",
    "team_pace_count",
    "team_late_count",
    "team_end_count",
    "entries",
    "wins",
    "win_rate",
    "teams",
    "team_wins",
    "team_win_rate",
    "avg_speed",
    "avg_stamina",
    "avg_power",
    "avg_guts",
    "avg_wit",
    "avg_score",
    "activation_rate(Skill Name)",
    "skill_activation_rate(Skill Name)",
    "activated_entries(Skill Name)",
    "skill_activations(Skill Name)",
];


const QueryHelpSnippet: React.FC<{
    query: string;
    title?: string;
    onUse?: () => void;
    extensions: readonly Extension[];
}> = ({ query, title = "Query", onUse, extensions }) => (
    <div className="query-help-snippet">
        <div className="query-help-snippet-header">
            <span>{title}</span>
            {onUse && (
                <button className="query-help-use-btn" type="button" onClick={onUse}>
                    Use Query
                </button>
            )}
        </div>
        <CodeMirror
            value={query}
            extensions={[sqlLang({ dialect: SQLite }), ...extensions]}
            theme={oneDark}
            editable={false}
            basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
            }}
            className="query-help-code"
        />
    </div>
);

const QueryHelpModal: React.FC<{
    onClose: () => void;
    onUseExample: (query: string) => void;
    snippetExtensions: readonly Extension[];
}> = ({ onClose, onUseExample, snippetExtensions }) => (
    <div className="query-help-backdrop" onClick={onClose}>
        <div className="query-help-modal" role="dialog" aria-modal="true" aria-labelledby="umalogs-query-help-title" onClick={(event) => event.stopPropagation()}>
            <div className="query-help-header">
                <div>
                    <h4 id="umalogs-query-help-title">UmaLogs Query Help</h4>
                    <p>Queries use a small SQL-like language for the selected UmaLogs dataset. Start from race entries; no FROM clause is needed.</p>
                </div>
                <button className="query-help-close" type="button" onClick={onClose} aria-label="Close query help">x</button>
            </div>

            <div className="query-help-body">
                <section>
                    <h5>Shape</h5>
                    <p>Clauses are optional. Selecting a dimension such as <code>uma</code>, <code>card</code>, or <code>style</code> groups by that dimension automatically.</p>
                    <QueryHelpSnippet
                        query={`select uma, style, entries, wins, win_rate
where style = "End Closer" and has_skill(Angling and Scheming)
group by uma, style
order by wins desc
limit 20`}
                        extensions={snippetExtensions}
                    />
                </section>

                <section>
                    <h5>Samples and Pages</h5>
                    <p>Use <code>having</code> to remove aggregate rows with small samples. It accepts one selected metric comparison. Use <code>offset</code> with <code>limit</code> to fetch later result pages.</p>
                    <QueryHelpSnippet
                        query={`select uma, style, entries, wins, win_rate
group by uma, style
having entries >= 20
order by win_rate desc
limit 20
offset 20`}
                        extensions={snippetExtensions}
                    />
                </section>

                <section>
                    <h5>Fields</h5>
                    <div className="query-help-grid">
                        <div>
                            <strong>Filters and groups</strong>
                            <code>{FILTER_FIELDS.join(", ")}</code>
                        </div>
                        <div>
                            <strong>Outputs</strong>
                            <code>{SELECT_FIELDS.join(", ")}</code>
                        </div>
                    </div>
                </section>

                <section>
                    <h5>Filters</h5>
                    <p>Comparisons support <code>=</code>, <code>!=</code>, <code>&lt;</code>, <code>&lt;=</code>, <code>&gt;</code>, and <code>&gt;=</code>. Combine filters with <code>and</code>, <code>or</code>, <code>not</code>, and parentheses.</p>
                    <QueryHelpSnippet
                        query={`where style = "End Closer" and speed >= 1700
  and won = true
  and (weather = "rainy" or room_front_count = 0)
  and team_pace_count >= 2`}
                        extensions={snippetExtensions}
                    />
                </section>

                <section>
                    <h5>Skills and Arrays</h5>
                    <p>Skill names and support card names can be written directly in their matching contexts. Recognized skills show an icon in the editor, and numeric IDs also work.</p>
                    <QueryHelpSnippet
                        query={`where has_skill(Angling and Scheming)
  and learned has any (Taking the Lead, Right-Handed)
  and activated has all (Angling and Scheming, Taking the Lead)
  and support_cards has [Fire at My Heels] Kitasan Black`}
                        extensions={snippetExtensions}
                    />
                    <div className="query-help-reference-list">
                        {HELP_SKILL_FIELDS.map((line) => <code key={line}>{line}</code>)}
                    </div>
                </section>

                <section>
                    <h5>Teams and Replays</h5>
                    <p><code>team</code> means the current entry's team. Use <code>any_team</code>, <code>winning_team</code>, or <code>losing_team</code> to match teams across the whole race. <code>has all</code> requires each listed <code>member(...)</code> to be a different Uma on the same team.</p>
                    <QueryHelpSnippet
                        query={`where winning_team has member(uma = [Wild Frontier])
  and losing_team has member(uma = [Starlight Beat])`}
                        extensions={snippetExtensions}
                    />
                    <p>Select <strong>Replays</strong> as the output to run the written <code>where</code> clause as a replay search. Race-scoped team predicates are preserved when the Replay results open.</p>
                </section>

                <section>
                    <h5>Examples</h5>
                    <div className="query-help-examples">
                        {HELP_EXAMPLES.map((example) => (
                            <QueryHelpSnippet
                                key={example.title}
                                title={example.title}
                                query={example.query}
                                extensions={snippetExtensions}
                                onUse={() => onUseExample(example.query)}
                            />
                        ))}
                    </div>
                </section>

                <section>
                    <h5>Limits</h5>
                    <p>Queries do not support joins, subqueries, aliases, formulas, or arbitrary SQL. Results are capped at 100 rows. Skill activation metrics are observed rates from UmaLogs entries.</p>
                    <p>The selected fields, grouping, ordering, and limit apply to Aggregate output. Replay output uses the <code>where</code> clause and Replay's own sorting and pagination.</p>
                </section>
            </div>
        </div>
    </div>
);


export default QueryHelpModal;

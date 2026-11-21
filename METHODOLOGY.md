# Methodology

Draft Ledger supports a coach deciding which opening tendencies to contest and what remains available later in a series. The application links scouting evidence to a draft board where the coach can simulate an action before committing.

## Cohorts and denominators

The scout picks an opponent, patch, player, champion and recency window. The app filters team games by patch and player appearance, sorts newest first, then takes the selected number of games. The champion filter narrows displayed pick and ban rows and conditions the macro view on recorded picks. A named player narrows pick rows to that player's assignments. Ban rows describe the whole team within those same games.

Each pick rate counts games with the pick over roster-eligible scoped games. Ban rates count games with the ban over scoped games with complete, distinct, verified ban entries for both sides. The opening insight uses Game 1 only. It displays a Wilson 95% binomial interval for the observed selection frequency. Series dependence, opponent mix and selection bias can make the real uncertainty wider. The card suggests testing a ban at six or more observed openers, three or more matching picks and a selection rate of at least 35%. These are display heuristics. Historical win splits describe associations and can reflect opponent strength, side, patch or lineup differences.

## Fearless rules and later games

The board implements the 20-action professional pick/ban sequence. Picks on either side become unavailable for the rest of the series. Ordinary bans are unique within the current draft and expire afterward. The simulator supports Best of 3 and Best of 5 planning, immutable earlier boards and undo on the active board. Series planning can explore later games before results are known. [Official Fearless Draft format](https://lolesports.com/en-SG/news/fearless-draft-takes-over-2025)

Historical Game 1–5 rows use inferred lockout compatibility. The app requires at least two consecutive games starting at Game 1, the same two teams and complete picks with no repeat on either side. A champion's opportunity denominator counts games where the earlier picks did not lock that champion. A same-role replacement counts observed roster assignments after a target lockout, when role evidence is available. Compatible histories are evidence about recorded drafts. Competition format and later-game selection can introduce biases.

## Macro evidence

The local importer starts with CSV metadata for game results, sides, players and champion IDs. It selects the compressed feeds through the series index and reads Zstandard JSON Lines as a stream. It associates draft and telemetry events with metadata-verified games. The import keeps team bans only when it can verify ten distinct bans that do not overlap the game's picks.

The jungle proxy requires a single identified jungler on that team, inferred from a role label or a recognizable Smite ability identifier. It samples the map position in 10-second buckets from 2:30 through 3:40. It accepts interior coordinates sufficiently away from the map diagonal and classifies top or bottom only when at least three accepted positions agree at a 70% threshold. The proxy describes an opening position. Telemetry coverage, axis conventions and role identifiers should be checked on official feeds before treating it as match evidence.

Verified objective events contribute their team and elapsed time. First drake uses games with at least one recognized timed drake. Drake and Grubs by 14:00 use games with any recognized timed objective. Feed gaps and event-schema gaps can bias both denominators. The public demo generates original route and objective observations.

## Live estimate and evaluation

An L2-regularized logistic regression scores the blue-side win probability from an intercept, a signed team-strength difference and signed champion effects. Each full draft has five picks per side. Data with fewer than 20 complete games, no examples of either team, or too few legal champions produces an unavailable forecast.

For each incomplete board, the app samples 120 legal completions of the remaining picks and bans. Team affinity, patch similarity, game number and recency weight the candidates. A prior allows unseen champions, and a soft role penalty encourages filling unrepresented known roles. Candidate draws are deterministic and paired between the current board and the proposed action. The average model score is the displayed percentage. The standard error describes the Monte Carlo difference across paired draws. It does not incorporate model error or identify what the ban would have caused in a real match.

The first 80% of series in time order train the holdout model. Later series measure Brier loss for completed drafts against a regularized model with side and team features alone. Games in the same series stay together. The live model then refits on all complete rows supplied to the app. On the original demo the split is 256 training games in 76 series, with 65 later games in 20 series. The Brier scores are 0.241 for the draft model and 0.254 for the baseline. This result is specific to the original demo generator. Calibration and generalization on official matches remain to be measured.

## Reading the counter-draft plan

The opening pick, repeated ban and late-game leader each use their own opportunity count. To compare Game 2 results, the app pairs Game 1 and Game 2 from the same compatible series. Both must survive the patch, player and recency filters. A complete Game 1 ban record identifies series where the opposing side banned the focus champion and series where both sides left it unbanned. Self-bans are excluded. In the Breakwater demo, the resulting Game 2 splits for Mirehorn are 4 wins in 5 series and 19 in 45. The first group is small. These are historical groups with different opponents, and an intervention effect cannot be identified from them.

Choosing a series in the timeline opens its complete history, even if a recency or player filter included only its final game. The score follows the scouted team across side swaps. Each row counts the distinct picks by both teams in earlier games. A released champion was banned by the scouted team one game earlier, survived the carry-over locks and escaped both teams’ current bans. The row identifies who picked it or whether it went unpicked. A missing ban record leaves this comparison unknown. Bottom and support form the featured pair where both positions are identified. For unlabeled rosters the view shows two teammates in stable player-ID order. A change in a recorded pair or ban does not establish the coach’s intent.

## Objective times, side splits and stream coverage

Each scoped game contributes at most one time to each first-objective median. The earliest recognized drake or Herald by either side supplies the time. The range spans those games, and the capture count belongs to the scouted team. Missing events can shift the earliest recorded time. Blue and red win rates use separate counts of scoped games played on each side. Their difference is reported in percentage points when both sides have results.

The exact-slice importer joins LoL game and active roster IDs to the team, player and character tables. It keeps the roster name used at match time when present. Event, stage and scheduled time resolve the tournament stage when exactly one lookup row matches. A streaming decoder reads each envelope into memory. Delta game IDs identify the game even when a full state lists earlier games. Final draft snapshots carry the drafter and draftable IDs. The collector handles corrected bans, removes reversed objective records and counts generic and elemental labels for a single drake once. Only metadata-backed complete games enter the extract.

Route voting uses one accepted position per player per ten-second bucket. A player’s role or identifiable Smite ability can appear outside the sampling window. A side with ambiguous role evidence or insufficient positions stays unclassified. Sequence gaps are counts of jumps and skipped envelope numbers. The feed cannot establish how many underlying gameplay events those jumps represent.

## Reproducibility

Node.js provides the offline build, test runner and streaming importer. The implementation uses browser JavaScript for the local evidence and forecast. WebStorm is the coordinator's designated IDE for implementation review and build verification. The actual IDE steps and evidence will be recorded after the coordinator's verification.

# Implementation and verification log

## 2026-11-21 · V2 coaching rehearsal and LoL slice

Scouting now connects repeated picks and bans to a preparation plan. The Game 2 comparison uses observed Game 1 bans. The series timeline follows both teams’ picks, released bans, the opponent’s pair and the score through side swaps. Opening macro adds first drake and Herald times and wins by side. The four-step coach rehearsal uses the original fictional series `demo-29` and a temporary first-ban board.

The GRID check used starter revision `496fa7f41df598ede863f1244f8a9b08e2868482`, the LoL index, six lookup tables and two LCS Split 3 playoff feeds. The two compressed feeds totaled 1,696,302 bytes.

| Series | Games | Envelopes | Events |
| --- | ---: | ---: | ---: |
| 3000374 | 4 | 3,399 | 3,781 |
| 3000378 | 4 | 3,907 | 4,338 |
| Total | 8 | 7,306 | 8,119 |

Both streams completed. No incomplete game was skipped. Team, character, player and tournament-stage lookup misses were all zero. The audit counted 1,245 sequence jumps spanning 1,762 absent sequence numbers. Eight ban or ban-reversal events referred to game IDs outside the final game index. No recognized objective lacked a time or roster join. A second streaming pass matched all eight winners, sides, rosters and final ban sets, and all 84 objective kind/side/time tuples. The extract contains 80 verified bans. Route coverage was 0/8 because this slice did not support the jungler-position classification. The official check covered these two series only.

Node.js 24.22.1 passed all 12 original tests and 7 new checks. The standalone HTML built to 116,977 bytes with SHA-256 `c6ada383b43c4574ec621eb2156e14eff8d7dbe864ce9d3b9965bfe698e7c994`. The reproducible v1 reference is the 95,925-byte build of commit `2169c5f`. Its template and embedded draft, demo and forecast modules match byte for byte. The v2 build changes the stylesheet, scouting and app modules, and adds the coaching module. The base commit tracks no dist file and the repository had no release asset for an independent comparison.

Chrome 157 opened the standalone file with networking disabled. The full coach rehearsal passed at 1,440, 768 and 390 pixels, including going back from Insights and restoring the workspace. The default first-ban preview moved Northstar’s estimate from 54.5% to 57.8% across 120 paired completions. The local file input accepted the eight-game extract. Exiting a rehearsal returned to that import, and reloading returned to the fictional demo. The local HTTP server returned the same bytes as the offline file. WebStorm execution and IDE evidence remain with the coordinator.

## 2026-11-20 · Draft mechanics

Implemented the professional 20-action draft sequence and immutable prior boards. This gives coaches a reversible workspace with consistent Fearless locks across both teams. Added per-game side assignments so a later side swap preserves the earlier board. Automated checks passed for duplicate picks and bans, ordinary ban expiry, Game 3 and Game 5, Best of 3 termination, undo and saved-state restoration.

## 2026-11-20 · Scouting and telemetry

Added cohort filters, ranked evidence, an opening recommendation, later-game eligibility and opening macro. Separate denominators keep incomplete records visible. The original demo has 321 complete games from 96 series. Verified the 35/51 Mirehorn opening pattern, 31/35 bottom-side route evidence and 2/13 Game 5 availability. The local importer processed an author-generated 10-series, 35-game CSV and Zstandard fixture end to end. It returned 35 verified ban records, 35 timed objective records, and 35 games with route evidence. Official GRID acceptance is pending registered-participant access.

## 2026-11-20 · Forecast

Added a regularized draft model, legal draft completion and paired scenario deltas. This gives coaches a reproducible comparison while preserving the distinction between observed results and model estimates. The original demo chronological holdout scored 0.241 Brier for completed drafts versus 0.254 for a side-and-team baseline over 65 games in 20 held-out series. Automated checks passed for deterministic previews and the transition from the penultimate to the completed board.

## 2026-11-20 · Application and delivery

Added the static browser workspace, standalone build, shared WebStorm run configurations and English submission materials. Chrome over local HTTP exercised scouting filters, previewing, confirming and undoing a ban, Game 3 and Game 5 lockouts, and draft persistence after refresh. The browser file chooser test did not finish in the hosted test session. The local CLI and its import format passed independently. Node.js v24.22.3 passed 12 of 12 automated checks. The local server returned the exact static build and enforced its supported routes and methods.

Remaining submission checks are real GRID validation on the coordinator's machine, actual WebStorm usage evidence, the public GitHub repository at the proposed `zonglinc00-debug/draft-ledger` location, and the coordinator's video and Devpost submission.

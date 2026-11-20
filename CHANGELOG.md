# Implementation and verification log

## 2026-11-20 · Draft mechanics

Implemented the professional 20-action draft sequence and immutable prior boards. This gives coaches a reversible workspace with consistent Fearless locks across both teams. Added per-game side assignments so a later side swap preserves the earlier board. Automated checks passed for duplicate picks and bans, ordinary ban expiry, Game 3 and Game 5, Best of 3 termination, undo and saved-state restoration.

## 2026-11-20 · Scouting and telemetry

Added cohort filters, ranked evidence, an opening recommendation, later-game eligibility and opening macro. Separate denominators keep incomplete records visible. The original demo has 321 complete games from 96 series. Verified the 35/51 Mirehorn opening pattern, 31/35 bottom-side route evidence and 2/13 Game 5 availability. The local importer processed an author-generated 10-series, 35-game CSV and Zstandard fixture end to end. It returned 35 verified ban records, 35 timed objective records, and 35 games with route evidence. Official GRID acceptance is pending registered-participant access.

## 2026-11-20 · Forecast

Added a regularized draft model, legal draft completion and paired scenario deltas. This gives coaches a reproducible comparison while preserving the distinction between observed results and model estimates. The original demo chronological holdout scored 0.241 Brier for completed drafts versus 0.254 for a side-and-team baseline over 65 games in 20 held-out series. Automated checks passed for deterministic previews and the transition from the penultimate to the completed board.

## 2026-11-20 · Application and delivery

Added the static browser workspace, standalone build, shared WebStorm run configurations and English submission materials. Chrome over local HTTP exercised scouting filters, previewing, confirming and undoing a ban, Game 3 and Game 5 lockouts, and draft persistence after refresh. The browser file chooser test did not finish in the hosted test session. The local CLI and its import format passed independently. Node.js v24.22.3 passed 12 of 12 automated checks. The local server returned the exact static build and enforced its supported routes and methods.

Remaining submission checks are real GRID validation on the coordinator's machine, actual WebStorm usage evidence, the public GitHub repository at the proposed `zonglinc00-debug/draft-ledger` location, and the coordinator's video and Devpost submission.

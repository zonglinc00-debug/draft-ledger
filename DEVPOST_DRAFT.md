# Draft Ledger | Devpost description draft

**Category 2 (LoL) · Macro Scouting & Draft Management System**

## What it does

Draft Ledger gives coaches a workspace for three linked decisions. Which opponent picks and bans warrant preparation? Which champions remain eligible late in a Fearless series? How does the model score the next draft action?

Scouting filters by opponent, patch, player, champion and recent games. Ranked charts display the underlying counts for picks, verified bans and opening macro. Game 1 through Game 5 views show changes in the eligible pool and the most common recorded picks. Coaches can open the underlying recent records.

The draft room supports Best of 3 and Best of 5, tracks the standard ban/pick sequence and carries both sides' picks into the later-game lockout. Select an available champion to preview the forecast impact, then confirm the action or compare another option.

## A tactical example

In the original demo, Breakwater picked Mirehorn in 35 of 51 openers. Its jungler was bottom-side in 31 of those 35 classifiable games. The evidence suggests a first-ban rehearsal and checking bottom-side vision if Mirehorn stays available. In Game 5, Mirehorn was still eligible in only 2 of 13 compatible games. The workflow shows rates, counts, historical win splits and the assumptions behind the live scenario comparison.

## How we built it

The code uses JavaScript and Node.js 24. We combined cohort-based statistics with a regularized draft outcome model and paired legal draft simulations. The project ships an original demo, a standalone browser build and an optional local stream importer for eligible participants with access to the official GRID files.

## JetBrains tooling draft

WebStorm is the designated IDE for the coordinator's code review, debugging, building and automated tests. Shared run configurations are tracked under `.idea/runConfigurations/`. Replace this paragraph with the actual WebStorm version, the files edited or debugged, and the observed build and test results after the coordinator completes the work.

Submission links should point to the public repository, the hosted demo or judge build, and the final workflow case study in `AI_SHOWCASE.md`.

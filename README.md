# Draft Ledger

Draft Ledger is a coaching workspace for Category 2 of the Cloud9 × JetBrains Sky’s The Limit Hackathon. It lets a coach trace an opponent draft tendency back to the games that produced it, then test the next pick or ban in a Fearless series.

## Run the application

Install [Node.js 24 LTS](https://nodejs.org/) and use a current Chrome, Edge, Firefox, or Safari. No npm install, keys, or paid services are needed.

```sh
npm test
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). To build the standalone judge edition, run `npm run build` and open `dist/index.html` in a browser. The same file can be served from any static web host. The judge edition contains the original demo only and can run offline.

## Coaching workflow

Choose **Start coach rehearsal** to replay the fictional Northstar–Breakwater series from July 29. Scout the opener, choose a first ban, compare the paired forecast and confirm the ban to reach the counter-draft plan. The final timeline follows all five recorded games. **Finish rehearsal** returns to your scouting filters and draft board.

1. In **Scouting**, choose your team and the opponent. Filter by patch, player, champion and recency. Repeat picks, documented bans and macro events each show their own denominators.
2. Inspect **How to win**. In the original demo, Breakwater picks Mirehorn in 35 of 51 openers. It is bottom-side in 31 of 35 classified openers with that pick. The card also shows the home team’s usage, the opponent’s historical win split and observed later alternatives.
3. Click **Test in draft room** to preview the opening ban. Compare the estimated win probability and the paired simulation difference, then confirm or try a different move.
4. Load the **Game 5 scenario**. Compare its 40 carry-over locks with Game 3’s 20. Change the pool filter to **Unavailable** to inspect a specific lock.
5. Open **Method & data** for forecast evidence and the chronological holdout. In the demo, the completed-draft model’s Brier score is 0.241 on 65 games in 20 held-out series. The side-and-team baseline scores 0.254. Demo results illustrate the workflow.

The best-of-three and best-of-five boards track all 20 draft steps per game. Past picks from either side are locked across the series. Current-game bans expire before the next draft. The app saves the original demo board in this browser when local storage is available.

**Counter-draft plan** shows the most frequent opponent pick and verified ban, the leading picks in Games 3–5, and Game 2 results grouped by whether the other side banned the focus champion in Game 1. **Series timeline** follows one recorded matchup across side swaps, naming the previous pair that became locked and any former ban that returned to the draft. **Opening macro** reports median first drake and Herald times and blue/red win rates with their own sample sizes.

## Optional local GRID import

The official feeds are licensed for eligible entrants building this project during the hackathon. Keep the data and derived extracts local. Redistribution and commercial use are prohibited. Read the starter’s README, agent instructions and [data license](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter/blob/main/LICENSE.md).

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../stl-hackathon-2026-grid-starter
git -C ../stl-hackathon-2026-grid-starter fetch --depth 1 origin 496fa7f41df598ede863f1244f8a9b08e2868482
git -C ../stl-hackathon-2026-grid-starter checkout --detach 496fa7f41df598ede863f1244f8a9b08e2868482
git -C ../stl-hackathon-2026-grid-starter sparse-checkout set --no-cone "/AGENTS.md" "/README.md" "/LICENSE.md" "/meta/" "/lol/series.csv"
```

Choose series by ID from `lol/series.csv`. To reproduce the two-series LCS playoff check, run these commands from the application directory.

```sh
git -C ../stl-hackathon-2026-grid-starter sparse-checkout add "/lol/events_3000374_grid.jsonl.zst" "/lol/events_3000378_grid.jsonl.zst"
npm run grid -- --root ../stl-hackathon-2026-grid-starter --series 3000374,3000378 --home "Cloud9 Kia"
```

`--series` reads exactly the indexed series listed. It uses the first team in matching game metadata as home unless you supply a participating team name or ID. A missing or invalid stream fails this mode before replacing the previous extract. The CLI also accepts `STL_DATA_DIR` as the source path.

Without `--series`, the v1 cohort mode defaults to Cloud9 Kia, up to 120 recent related series and 24 selected streams. It reserves part of both budgets for series featuring the home team. Use `--series-limit` and `--feeds` to change those budgets. `--feeds 0` builds a metadata-only import.

In the app choose **Import local data** and select `.grid-private/scouting.grid.json`. The extract and fitted coefficients are held in browser memory and reset on refresh. Keep the clone and extract on an eligible participant’s machine. Distribute the code and original demo build. Judges can reproduce the import with their licensed data access.

The verified slice produced 8 complete games, 80 bans and 84 timed objectives from 7,306 envelopes containing 8,119 events. All eight game results, rosters and ban sets matched the final states. No game qualified for an opening route. See [the verification log](CHANGELOG.md) for anomaly counts and coverage.

## JetBrains development

**Coordinator verification pending.** WebStorm is the designated IDE. The shared `.idea/runConfigurations/` files define **Start Draft Ledger** and **Verify Draft Ledger**. Open the repository in WebStorm with Node.js 24 configured, run both configurations and debug a draft action in `src/draft.js` or the entry point. The coordinator should record the IDE version, a real edit or debug check, and the build and test results before submitting. Update this section and both submission drafts to describe what occurred.

For v2, **Verify Draft Ledger** includes the exact-slice importer and coaching regression tests. **Start Draft Ledger** builds the self-contained HTML and serves the rehearsal. A breakpoint in `followupResults` in `src/coaching.js` exposes the two Game 2 sample sizes shown in the counter-draft plan.

## Submission materials

The proposed public repository name is `zonglinc00-debug/draft-ledger`. The standalone judge build is `dist/index.html`. Publish only the source and the original demo build.

- [METHODOLOGY.md](METHODOLOGY.md) describes the evidence, forecast and limitations.
- [DEVPOST_DRAFT.md](DEVPOST_DRAFT.md) is the English project and tooling description.
- [AI_SHOWCASE.md](AI_SHOWCASE.md) is the English case-study draft for the optional bonus.
- [CHANGELOG.md](CHANGELOG.md) records implementation rounds and checks.

Source code is licensed under [MIT](LICENSE). The data provider retains rights to its data.

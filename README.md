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

1. In **Scouting**, choose your team and the opponent. Filter by patch, player, champion and recency. Repeat picks, documented bans and macro events each show their own denominators.
2. Inspect **How to win**. In the original demo, Breakwater picks Mirehorn in 35 of 51 openers. It is bottom-side in 31 of 35 classified openers with that pick. The card also shows the home team’s usage, the opponent’s historical win split and observed later alternatives.
3. Click **Test in draft room** to preview the opening ban. Compare the estimated win probability and the paired simulation difference, then confirm or try a different move.
4. Load the **Game 5 scenario**. Compare its 40 carry-over locks with Game 3’s 20. Change the pool filter to **Unavailable** to inspect a specific lock.
5. Open **Method & data** for forecast evidence and the chronological holdout. In the demo, the completed-draft model’s Brier score is 0.241 on 65 games in 20 held-out series. The side-and-team baseline scores 0.254. Demo results illustrate the workflow.

The best-of-three and best-of-five boards track all 20 draft steps per game. Past picks from either side are locked across the series. Current-game bans expire before the next draft. The app saves the original demo board in this browser when local storage is available.

## Optional local GRID import

An eligible registered entrant may use this mode under the [official data license](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter/blob/main/LICENSE.md). Work from a clone beside the application. Read the starter repository’s `AGENTS.md` before processing its data.

```sh
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git \
  ../stl-hackathon-2026-grid-starter
git -C ../stl-hackathon-2026-grid-starter sparse-checkout set lol meta
npm run grid -- --root ../stl-hackathon-2026-grid-starter
```

The CLI defaults to Cloud9 Kia, up to 120 recent related series for the metadata cohort, and 24 selected streams for bans and macro. It reserves part of both budgets for series featuring the home team. Set `--home` to a team name or ID, `--series-limit` for the cohort size and `--feeds` for the stream budget. `--feeds 0` builds a metadata-only import. Run `npm run grid -- --help` for the options.

In the app choose **Import local data** and select `.grid-private/scouting.grid.json`. The extract and fitted coefficients are held in browser memory and reset on refresh. Keep the clone and extract on an eligible participant’s machine. Distribute the code and original demo build. Judges can reproduce the import with their licensed data access.

The terminal reports complete games skipped, verified ban records, timed objectives, route coverage and unavailable feeds. Low coverage remains visible in the app. The adapter has passed tests with author-generated CSV and Zstandard fixtures. Official match verification is pending registered participant access.

## JetBrains development

**Coordinator verification pending.** WebStorm is the designated IDE. The shared `.idea/runConfigurations/` files define **Start Draft Ledger** and **Verify Draft Ledger**. Open the repository in WebStorm with Node.js 24 configured, run both configurations and debug a draft action in `src/draft.js` or the entry point. The coordinator should record the IDE version, a real edit or debug check, and the build and test results before submitting. Update this section and both submission drafts to describe what occurred.

## Submission materials

The proposed public repository name is `zonglinc00-debug/draft-ledger`. The standalone judge build is `dist/index.html`. Publish only the source and the original demo build.

- [METHODOLOGY.md](METHODOLOGY.md) describes the evidence, forecast and limitations.
- [DEVPOST_DRAFT.md](DEVPOST_DRAFT.md) is the English project and tooling description.
- [AI_SHOWCASE.md](AI_SHOWCASE.md) is the English case-study draft for the optional bonus.
- [CHANGELOG.md](CHANGELOG.md) records implementation rounds and checks.

Source code is licensed under [MIT](LICENSE). The data provider retains rights to its data.

# How AI helped build Draft Ledger

Case-study draft for the Sky’s The Limit Hackathon.

## From a coaching question to verifiable rules

We gave Codex the coaching brief, the official category requirements and the public starter documentation. The coding agent translated them into a draft turn table, a series state machine and checks at the critical transitions. Those tests exercise Game 3 and Game 5, both teams' carry-over picks, ordinary bans expiring, duplicate rejection and state restoration. They let us change the UI while retaining the rules.

Codex helped turn a proposed win-rate headline into two concrete views. The scouting page shows the observed sample and a historical win split. The board uses paired simulations to compare draft scenarios. The app also reports a chronological holdout and a simpler baseline, so the model contribution can be checked independently of the front end.

We developed and tested with original fictional records and author-generated adapter fixtures. The public build contains original demo data. The optional importer reads the licensed files from the entrant's local clone, and its output stays out of Git.

## JetBrains verification

The repository includes two shared WebStorm run configurations for the application and automated tests. The coordinator plans to open the project in WebStorm, review and edit the implementation, inspect a Game 5 lockout or forecast action in the debugger, then run the tests and the build.

Before publishing this case study, record the actual WebStorm version and a reproducible example of how it helped confirm or fix a requirement. Include the command output, the relevant commit and any measured time savings supported by a record.

## V2 · Testing a scouting claim against two feeds

The v1 fixture established that the reader could decompress a stream. Two official LoL series exposed a different question. Which game does a ban belong to when a snapshot lists several games or a draft is corrected? Codex compared the event delta with the game index, traced the final draft’s drafter and draftable IDs, and wrote a fictional regression fixture with a corrected ban and two game IDs in a snapshot. An independent local read reconciled eight final drafts and 84 objective records with the extract. No source events or private extracts are bundled.

The coaching brief suggested a hypothetical drop in win rate after a ban. Codex joined actual Game 1 bans to Game 2 outcomes in the fictional history. Breakwater won four of five follow-ups when the other side banned Mirehorn, versus 19 of 45 when both sides left it open. That result changed the copy. The coach sees the small sample beside the observed split and can rehearse the first ban separately in the paired forecast. The timeline then traces which options actually returned in the recorded series.

The same tests run through WebStorm’s shared **Verify Draft Ledger** configuration. **Start Draft Ledger** builds and serves the four-step browser rehearsal. This handoff exercised both npm entry points from the command line and the standalone rehearsal in Chrome. The coordinator’s IDE run, debugger observation and version are the remaining JetBrains evidence.

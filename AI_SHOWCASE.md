# How AI helped build Draft Ledger

Case-study draft for the Sky’s The Limit Hackathon.

## From a coaching question to verifiable rules

We gave Codex the coaching brief, the official category requirements and the public starter documentation. The coding agent translated them into a draft turn table, a series state machine and checks at the critical transitions. Those tests exercise Game 3 and Game 5, both teams' carry-over picks, ordinary bans expiring, duplicate rejection and state restoration. They let us change the UI while retaining the rules.

Codex helped turn a proposed win-rate headline into two concrete views. The scouting page shows the observed sample and a historical win split. The board uses paired simulations to compare draft scenarios. The app also reports a chronological holdout and a simpler baseline, so the model contribution can be checked independently of the front end.

We developed and tested with original fictional records and author-generated adapter fixtures. The public build contains original demo data. The optional importer reads the licensed files from the entrant's local clone, and its output stays out of Git.

## JetBrains verification

The repository includes two shared WebStorm run configurations for the application and automated tests. The coordinator plans to open the project in WebStorm, review and edit the implementation, inspect a Game 5 lockout or forecast action in the debugger, then run the tests and the build.

Before publishing this case study, record the actual WebStorm version and a reproducible example of how it helped confirm or fix a requirement. Include the command output, the relevant commit and any measured time savings supported by a record.

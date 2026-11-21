import assert from 'node:assert/strict';
import test from 'node:test';
import { followupResults, seriesTimeline, startRehearsal } from '../src/coaching.js';
import { makeDemo } from '../src/demo.js';
import { addAction, undoAction } from '../src/draft.js';
import { checkSeries, fearlessStages, macroSummary, scoutCohort, teamSide, tendencies } from '../src/scout.js';

const demo = makeDemo();
const evidence = checkSeries(demo.games);
const team = 'breakwater';
const cohort = scoutCohort(demo.games, { team });
const focus = 'demo-1-0';
const plan = startRehearsal(demo);

test('counterplan uses verified bans, compatible pairs and side-aware Game 2 results', () => {
  assert.deepEqual(followupResults(cohort, evidence, team, focus), {
    banned: { wins: 4, n: 5 }, open: { wins: 19, n: 45 }
  });
  assert.deepEqual(followupResults(cohort.filter(g => g.number === 2), evidence, team, focus), {
    banned: { wins: 0, n: 0 }, open: { wins: 0, n: 0 }
  });
  const damaged = structuredClone(demo.games.filter(g => g.series === plan.series));
  damaged[0].blue.bans.pop();
  const ranks = tendencies(damaged, team);
  assert.equal(ranks.banGames, 4);
  assert(ranks.picks.every(row => row.n === 5));
  const groups = followupResults(damaged, evidence, team, focus);
  assert.equal(groups.banned.n + groups.open.n, 0);
  const stages = fearlessStages(cohort, evidence, team, '', focus);
  assert.deepEqual(stages.slice(2).map(s => [s.games, s.games - s.eligible]), [[40, 34], [21, 19], [13, 11]]);
});

test('timeline follows both teams across side swaps and reports only genuinely released bans', () => {
  const rows = seriesTimeline([...demo.games].reverse(), evidence, plan.series, team);
  assert.deepEqual(rows.map(r => r.locks), [0, 10, 20, 30, 40]);
  assert.deepEqual(rows.map(r => r.wins + r.losses), [1, 2, 3, 4, 5]);
  assert.equal(rows[0].released, null);
  assert.notEqual(rows[0].side, rows[1].side);
  let pickedAfterRelease = 0;
  for (const [i, row] of rows.entries()) {
    assert.equal(row.game[row.side].team, team);
    const pair = row.game[row.side].picks.filter(p => ['Bottom', 'Support'].includes(p.role)).map(p => p.champion);
    assert.deepEqual(new Set(row.pair.ids), new Set(pair));
    if (!i) continue;
    const prev = rows[i - 1];
    assert.deepEqual(row.previousPair, prev.pair);
    assert(row.previousPair.ids.every(id => evidence.get(row.game.id).prior.has(id)));
    for (const { id, takenBy } of row.released) {
      assert(prev.game[prev.side].bans.includes(id));
      assert(!evidence.get(row.game.id).prior.has(id));
      assert(![...row.game.blue.bans, ...row.game.red.bans].includes(id));
      if (takenBy) {
        assert(row.game[takenBy].picks.some(p => p.champion === id));
        pickedAfterRelease++;
      }
    }
  }
  assert(pickedAfterRelease > 0);
  assert.deepEqual(seriesTimeline([rows[0].game, rows[2].game], checkSeries([rows[0].game, rows[2].game]), plan.series, team), []);
  const copy = structuredClone(rows.map(r => r.game));
  copy[0].red.bans = null;
  assert.equal(seriesTimeline(copy, evidence, plan.series, team)[1].released, null);
});

test('first objective timing gives each game one vote and keeps missing sides or clocks unknown', () => {
  const base = demo.games.find(g => g.red.team === team);
  const example = (winner, objectives) => ({ ...base, winner, macro: { routes: {}, objectivesRead: true, objectives } });
  const take = (kind, seconds, side = 'red') => ({ kind, seconds, side });
  const games = [
    example('red', [take('Drake', 940), take('Herald', 960), take('Drake', 400, 'blue')]),
    example('blue', [take('Drake', 350)]), { ...base, winner: 'red', macro: undefined }
  ];
  const stats = macroSummary(games, team);
  assert.deepEqual(stats.timings.Drake, { n: 2, taken: 1, median: 375, earliest: 350, latest: 400 });
  assert.deepEqual(stats.timings.Herald, { n: 1, taken: 1, median: 960, earliest: 960, latest: 960 });
  assert.deepEqual(stats.sides.red, { n: 3, wins: 2 });
  assert.equal(stats.sideGap, null);
  const swapped = { ...games[0], red: base.blue, blue: base.red, winner: 'blue' };
  assert(Math.abs(macroSummary([...games, swapped], team).sideGap - 1 / 3) < 1e-9);
  const empty = macroSummary(games, team, '', 'absent');
  assert.equal(empty.timings.Herald.median, null);
  assert.equal(empty.sides.red.n, 0);
});

test('coach preset opens a five-game series and can rewind its independent first-ban scenario', () => {
  const opener = demo.games.find(g => g.series === plan.series && g.number === 1);
  assert.equal(teamSide(opener, plan.home), 'blue');
  assert.equal(opener.red.team, plan.team);
  assert.equal(demo.games.filter(g => g.series === plan.series).length, 5);
  const catalog = new Map(demo.catalog.map(c => [c.id, c]));
  const confirmed = addAction(plan.draft, plan.choice, catalog);
  assert.deepEqual(confirmed.games[0], [{ champion: focus, kind: 'ban', side: 'blue' }]);
  assert.deepEqual(undoAction(confirmed), plan.draft);
  assert.deepEqual(startRehearsal(demo).draft.games, [[]]);
});

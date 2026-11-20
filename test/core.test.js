import assert from 'node:assert/strict';
import test from 'node:test';
import { addAction, availability, lockedBefore, newDraft, nextGame, ORDER, restoreDraft, setHomeSide, undoAction } from '../src/draft.js';
import { makeDemo } from '../src/demo.js';
import { compareForecast, draftEstimator, preferences, trainForecast } from '../src/forecast.js';
import { checkSeries, fearlessStages, macroSummary, scoutCohort, scoutInsight, tendencies, verifyDataset } from '../src/scout.js';

const demo = verifyDataset(makeDemo());
const catalog = new Map(demo.catalog.map(champ => [champ.id, champ]));

function complete(draft) {
  const locked = lockedBefore(draft, draft.games.length - 1);
  while (draft.games.at(-1).length < ORDER.length) {
    const available = demo.catalog.find(champ => !availability(champ.id, draft.games.at(-1), locked));
    draft = addAction(draft, available.id, catalog);
  }
  return draft;
}

test('draft enforces the turn order and champion uniqueness', () => {
  let draft = newDraft();
  assert.throws(() => nextGame(draft), /complete/i);
  draft = addAction(draft, demo.catalog[0].id, catalog);
  assert.deepEqual(draft.games[0][0], { side: 'blue', kind: 'ban', champion: demo.catalog[0].id });
  assert.throws(() => addAction(draft, demo.catalog[0].id, catalog), /banned/i);
  assert.throws(() => addAction(draft, 'unknown', catalog), /pool/i);
  draft = undoAction(draft);
  assert.equal(draft.games[0].length, 0);
  draft = complete(draft);
  for (const side of ['blue', 'red']) {
    assert.equal(draft.games[0].filter(move => move.side === side && move.kind === 'pick').length, 5);
    assert.equal(draft.games[0].filter(move => move.side === side && move.kind === 'ban').length, 5);
  }
});

test('Game 3 and Game 5 lock both teams’ past picks; bans expire', () => {
  let draft = complete(newDraft());
  const ban = draft.games[0][0].champion;
  const pick = draft.games[0][6].champion;
  const awayPick = draft.games[0][7].champion;
  draft = nextGame(draft);
  assert.equal(availability(ban, [], lockedBefore(draft, 1)), '');
  assert.throws(() => addAction(draft, pick, catalog), /fearless/i);
  assert.throws(() => addAction(draft, awayPick, catalog), /fearless/i);
  for (let game = 2; game <= 5; game++) {
    assert.equal(lockedBefore(draft, game - 1).size, (game - 1) * 10);
    draft = complete(draft);
    if (game < 5) draft = nextGame(draft);
  }
  assert.throws(() => nextGame(draft), /last scheduled/i);
  assert.deepEqual(restoreDraft(draft, catalog), draft);
});

test('swapping sides in a later game preserves the earlier side and restores both assignments', () => {
  const draft = setHomeSide(nextGame(complete(newDraft())), 'red');
  assert.deepEqual(draft.homeSides, ['blue', 'red']);
  assert.deepEqual(restoreDraft(draft, catalog).homeSides, ['blue', 'red']);
});

test('a best of three closes after three complete drafts', () => {
  let draft = complete(newDraft(3));
  draft = complete(nextGame(draft));
  draft = complete(nextGame(draft));
  assert.throws(() => nextGame(draft), /last scheduled/i);
});

test('filters determine scouting opportunities and unknown bans are excluded', () => {
  const cohort = scoutCohort(demo.games, { team: 'breakwater', player: 'breakwater:1', patch: '26.17', recent: 25 });
  assert.equal(cohort.length, 25);
  assert(cohort.every(game => game.patch === '26.17'));
  const rows = cohort.map((game, i) => i ? game : {
    ...game, blue: { ...game.blue, bans: null }, red: { ...game.red, bans: null }
  });
  const stats = tendencies(rows, 'breakwater', 'breakwater:1', 'demo-1-0');
  assert.equal(stats.banGames, 24);
  assert.equal(stats.picks[0].n, 25);
  assert.equal(stats.bans[0].n, 24);
});

test('tactical evidence is reproducible and later opportunities exclude prior locks', () => {
  const cohort = scoutCohort(demo.games, { team: 'breakwater' });
  const evidence = checkSeries(demo.games);
  const insight = scoutInsight(cohort, evidence, 'breakwater', '', '', catalog);
  assert.deepEqual([insight.champion, insight.count, insight.n], ['demo-1-0', 35, 51]);
  assert.deepEqual([insight.macro.bottom, insight.macro.routeGames], [31, 35]);
  assert(insight.actionable);
  const stages = fearlessStages(cohort, evidence, 'breakwater', '', insight.champion);
  assert.deepEqual([stages[2].games, stages[2].eligible], [40, 6]);
  assert.deepEqual([stages[4].games, stages[4].eligible], [13, 2]);
});

test('repeat picks and incomplete series do not enter historical Fearless comparisons', () => {
  const [first, second, third] = demo.games.slice(0, 3);
  const altered = { ...second, blue: first.blue, red: first.red };
  const evidence = checkSeries([first, altered]);
  assert(!evidence.get(first.id).compatible);
  assert(!checkSeries([first, third]).get(first.id).compatible);
});

test('route and objective denominators stay separate from missing records', () => {
  const cohort = scoutCohort(demo.games, { team: 'breakwater', recent: 10 });
  const rows = cohort.slice(1).concat({ ...cohort[0], macro: undefined });
  const stats = macroSummary(rows, 'breakwater', '');
  assert.equal(stats.games, 10);
  assert.equal(stats.routeGames, 9);
  assert.equal(stats.objectiveGames, 9);
  assert.equal(stats.dragonGames, 9);
});

test('forecast and paired deltas are reproducible across incomplete and complete drafts', () => {
  const model = trainForecast(demo.games);
  const teams = { blue: 'northstar', red: 'breakwater' };
  assert.equal(model.validation.trainSeries + model.validation.testSeries, model.series);
  assert.equal(model.validation.trainGames + model.validation.testGames, model.games);
  assert(model.validation.model < model.validation.baseline);
  const estimate = draftEstimator(demo, model, teams, new Set(), preferences(demo, teams));
  const completeBoard = complete(newDraft()).games[0];
  const initial = estimate([]);
  const banned = estimate(completeBoard.slice(0, 1));
  assert.deepEqual(estimate([]), initial);
  assert.notEqual(banned.blue, initial.blue);
  assert(initial.blue > 0 && initial.blue < 1);
  const lastChoice = compareForecast(estimate(completeBoard.slice(0, -1)), estimate(completeBoard), 'blue');
  assert(Number.isFinite(lastChoice.delta));
  assert(Number.isFinite(lastChoice.simulationNoise));
  assert.equal(estimate(completeBoard).draws, 1);
});

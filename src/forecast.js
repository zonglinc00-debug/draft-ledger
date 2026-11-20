import { ORDER, randomFrom } from './draft.js';
import { SIDES } from './scout.js';

const DRAWS = 120;

const logistic = value => 1 / (1 + Math.exp(-value));

function fit(games, withChampions) {
  const keys = new Map([['intercept', 0]]);
  const feature = key => {
    if (!keys.has(key)) keys.set(key, keys.size);
    return keys.get(key);
  };
  const rows = games.map(game => {
    const features = [[0, 1]];
    for (const side of SIDES) {
      const sign = side === 'blue' ? 1 : -1;
      features.push([feature(`team/${game[side].team}`), sign]);
      if (withChampions) {
        for (const pick of game[side].picks) features.push([feature(`champion/${pick.champion}`), sign]);
      }
    }
    return { features, y: Number(game.winner === 'blue') };
  });

  const coefficients = new Float64Array(keys.size);
  const gradient = new Float64Array(keys.size);
  for (let iteration = 0; iteration < 115; iteration++) {
    gradient.fill(0);
    for (const { features, y } of rows) {
      let logit = 0;
      for (const [index, sign] of features) logit += coefficients[index] * sign;
      const error = logistic(logit) - y;
      for (const [index, sign] of features) gradient[index] += sign * error;
    }
    for (let index = 0; index < coefficients.length; index++) {
      const penalty = index ? 7 : 1;
      coefficients[index] -= 0.55 * (gradient[index] + penalty * coefficients[index]) / Math.max(30, rows.length);
    }
  }
  const weight = key => coefficients[keys.get(key)] ?? 0;
  const intercept = weight('intercept');
  const teamWeight = id => weight(`team/${id}`);
  const championWeight = id => weight(`champion/${id}`);
  const predict = (blueTeam, redTeam, bluePicks, redPicks) => {
    let logit = intercept + teamWeight(blueTeam) - teamWeight(redTeam);
    for (const id of bluePicks) logit += championWeight(id);
    for (const id of redPicks) logit -= championWeight(id);
    return logistic(logit);
  };
  return { predict, includesTeam: id => keys.has(`team/${id}`) };
}

export function trainForecast(games) {
  if (!games.length) return null;
  const series = [...Map.groupBy(games, game => game.series).values()]
    .sort((a, b) => Math.min(...a.map(game => Date.parse(game.date))) - Math.min(...b.map(game => Date.parse(game.date)))
      || a[0].series.localeCompare(b[0].series));
  let validation = null;
  if (series.length >= 5) {
    const split = Math.min(series.length - 1, Math.floor(series.length * 0.8));
    const train = series.slice(0, split).flat();
    const test = series.slice(split).flat();
    const model = fit(train, true);
    const baseline = fit(train, false);
    const meanBrier = scoring => test.reduce((sum, game) => {
      const p = scoring.predict(game.blue.team, game.red.team, game.blue.picks.map(pick => pick.champion),
        game.red.picks.map(pick => pick.champion));
      return sum + (p - Number(game.winner === 'blue')) ** 2;
    }, 0) / test.length;
    validation = {
      trainGames: train.length, trainSeries: split, testGames: test.length, testSeries: series.length - split,
      model: meanBrier(model), baseline: meanBrier(baseline),
      from: new Date(Math.min(...test.map(game => Date.parse(game.date)))).toISOString().slice(0, 10)
    };
  }
  return { ...fit(games, true), games: games.length, series: series.length, validation };
}

export function preferences(data, { blue, red, patch = '', gameNumber = 1 }) {
  const latest = Math.max(...data.games.map(game => Date.parse(game.date)));
  const weights = {
    blue: { pick: new Map(), ban: new Map() },
    red: { pick: new Map(), ban: new Map() }
  };
  for (const game of data.games) {
    const age = (latest - Date.parse(game.date)) / 86400000;
    const recency = 0.20 + 0.80 * Math.exp(-age / 75);
    const patchAffinity = !patch || game.patch === patch ? 1 : 0.28;
    const roundAffinity = game.number === gameNumber ? 3.5 : 1;
    for (const side of SIDES) {
      for (const origin of SIDES) {
        const team = game[origin];
        const teamAffinity = team.team === (side === 'blue' ? blue : red) ? 7 : 0.25;
        const weight = recency * patchAffinity * roundAffinity * teamAffinity;
        for (const { champion } of team.picks) {
          weights[side].pick.set(champion, (weights[side].pick.get(champion) || 0) + weight);
        }
        for (const champion of team.bans || []) {
          weights[side].ban.set(champion, (weights[side].ban.get(champion) || 0) + weight);
        }
      }
    }
  }
  return weights;
}

function choose(ids, weights, used, covered, positions, seed) {
  const random = randomFrom(seed);
  let selected = null;
  let best = Infinity;
  for (let index = 0; index < ids.length; index++) {
    const draw = random();
    const id = ids[index];
    if (used.has(id)) continue;
    const rolePenalty = positions[index] && covered.has(positions[index]) ? 0.10 : 1;
    const cost = -Math.log(Math.max(Number.EPSILON, draw)) / (weights[index] * rolePenalty);
    if (cost < best) {
      best = cost;
      selected = id;
    }
  }
  return selected;
}

export function draftEstimator(data, model, teams, locked, weightMaps) {
  const candidates = data.catalog.filter(champ => !locked.has(champ.id));
  const ids = candidates.map(champ => champ.id);
  const roles = candidates.map(champ => champ.role);
  const roleMap = new Map(candidates.map(champ => [champ.id, champ.role]));
  const weights = Object.fromEntries(SIDES.map(side => [side, {
    pick: Float64Array.from(ids, id => 0.8 + (weightMaps[side].pick.get(id) || 0)),
    ban: Float64Array.from(ids, id => 0.8 + (weightMaps[side].ban.get(id) || 0))
  }]));
  return moves => {
    if (ids.length < ORDER.length || !model || model.games < 20
      || !model.includesTeam(teams.blue) || !model.includesTeam(teams.red)) return null;
    const initial = { blue: [], red: [] };
    for (const move of moves) {
      if (move.kind === 'pick') initial[move.side].push(move.champion);
    }
    const initialUsed = new Set(moves.map(move => move.champion));
    const n = moves.length === ORDER.length ? 1 : DRAWS;
    const predictions = [];
    for (let draw = 0; draw < n; draw++) {
      const random = randomFrom(Math.imul(draw + 1, 502277) ^ 274351);
      const picks = { blue: [...initial.blue], red: [...initial.red] };
      const used = new Set(initialUsed);
      const covered = { blue: new Set(picks.blue.map(id => roleMap.get(id))), red: new Set(picks.red.map(id => roleMap.get(id))) };
      for (const [index, [side, kind]] of ORDER.entries()) {
        const seed = Math.floor(random() * 4294967296);
        if (index < moves.length) continue;
        const champ = choose(ids, weights[side][kind], used, kind === 'pick' ? covered[side] : new Set(), roles, seed);
        if (!champ) return null;
        used.add(champ);
        if (kind === 'pick') {
          picks[side].push(champ);
          covered[side].add(roleMap.get(champ));
        }
      }
      predictions.push(model.predict(teams.blue, teams.red, picks.blue, picks.red));
    }
    return { blue: predictions.reduce((a, b) => a + b, 0) / predictions.length, draws: n, predictions };
  };
}

export function compareForecast(base, alternative, side) {
  if (!base || !alternative) return null;
  const sign = side === 'blue' ? 1 : -1;
  const n = Math.max(base.predictions.length, alternative.predictions.length);
  const paired = Array.from({ length: n }, (_, index) => sign * (
    alternative.predictions[index % alternative.predictions.length] - base.predictions[index % base.predictions.length]
  ));
  const delta = paired.reduce((a, b) => a + b, 0) / paired.length;
  const variance = paired.reduce((sum, value) => sum + (value - delta) ** 2, 0) / Math.max(1, paired.length - 1);
  return { delta, simulationNoise: Math.sqrt(variance / paired.length) };
}

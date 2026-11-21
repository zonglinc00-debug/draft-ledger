export const SIDES = ['blue', 'red'];
const OBJECTIVES = ['Drake', 'Grubs', 'Herald', 'Baron'];
export const ROUTES = ['Top', 'Bottom'];

export function otherSide(side) {
  return side === 'blue' ? 'red' : 'blue';
}

export function teamSide(game, team) {
  return SIDES.find(side => game[side].team === team);
}

export function verifyDataset(data) {
  if (data?.version !== 1 || !['demo', 'grid'].includes(data.source)
      || !Array.isArray(data.catalog) || !Array.isArray(data.teams) || !Array.isArray(data.games)) {
    throw new Error('Choose a v1 scouting JSON created with the GRID importer.');
  }
  const cleanList = (entries, label) => {
    if (!entries.length || entries.some(entry => typeof entry?.id !== 'string' || !entry.id
      || typeof entry.name !== 'string' || !entry.name || entry.name.length > 200)) {
      throw new Error(`Missing or invalid ${label} entries.`);
    }
    const map = new Map(entries.map(entry => [entry.id, entry]));
    if (map.size !== entries.length) throw new Error(`Duplicate ${label} IDs.`);
    return map;
  };
  const catalog = cleanList(data.catalog, 'champion');
  const teams = cleanList(data.teams, 'team');
  const seen = new Set();
  const seenGameNumbers = new Set();
  for (const game of data.games) {
    if (typeof game?.id !== 'string' || !game.id || seen.has(game.id)
      || typeof game.series !== 'string' || !game.series || !Number.isInteger(game.number) || game.number < 1
      || !Number.isFinite(Date.parse(game.date)) || typeof game.patch !== 'string'
      || !SIDES.includes(game.winner) || game.blue?.team === game.red?.team) {
      throw new Error('The file contains an invalid or duplicate game record.');
    }
    const seriesGame = JSON.stringify([game.series, game.number]);
    if (seenGameNumbers.has(seriesGame)) throw new Error('Duplicate game numbers in a series.');
    seenGameNumbers.add(seriesGame);
    seen.add(game.id);
    const seenPicks = new Set();
    for (const side of SIDES) {
      const team = game[side];
      if (!team || !teams.has(team.team) || !Array.isArray(team.picks) || team.picks.length !== 5
        || (team.bans !== null && (!Array.isArray(team.bans) || team.bans.length > 5
          || team.bans.some(ban => !catalog.has(ban))))) throw new Error('Invalid team draft record.');
      for (const pick of team.picks) {
        if (!pick || !catalog.has(pick.champion) || seenPicks.has(pick.champion)
          || typeof pick.player !== 'string' || typeof pick.playerName !== 'string') {
          throw new Error('Invalid champion or player reference.');
        }
        seenPicks.add(pick.champion);
      }
    }
    if (game.macro != null) {
      const { routes, objectives, objectivesRead } = game.macro;
      if (typeof objectivesRead !== 'boolean' || !routes || !Array.isArray(objectives)
        || SIDES.some(side => routes[side] != null && !ROUTES.includes(routes[side]))
        || objectives.some(item => !item || !OBJECTIVES.includes(item.kind) || !SIDES.includes(item.side)
          || !Number.isFinite(item.seconds) || item.seconds < 0)) throw new Error('Invalid macro evidence.');
    }
  }
  if (!data.games.length || !teams.has(data.home)) throw new Error('No complete games or home team found.');
  return data;
}

export function checkSeries(games) {
  const grouped = Map.groupBy(games, game => game.series);
  const evidence = new Map();
  for (const series of grouped.values()) {
    series.sort((a, b) => a.number - b.number);
    const prior = new Set();
    const continuous = series.length >= 2 && series.every((game, index) => game.number === index + 1)
      && series.every(game => SIDES.every(side => game[side].team === series[0].blue.team
        || game[side].team === series[0].red.team));
    let repeat = false;
    for (const game of series) {
      evidence.set(game.id, { prior: new Set(prior), compatible: false });
      for (const side of SIDES) {
        for (const { champion } of game[side].picks) {
          if (prior.has(champion)) repeat = true;
          prior.add(champion);
        }
      }
    }
    if (continuous && !repeat) {
      for (const game of series) evidence.get(game.id).compatible = true;
    }
  }
  return evidence;
}

export function scoutCohort(games, { team, patch, player, recent }) {
  return games.filter(game => {
    const side = teamSide(game, team);
    return side && (!patch || game.patch === patch)
      && (!player || game[side].picks.some(pick => pick.player === player));
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.number - a.number || a.id.localeCompare(b.id))
    .slice(0, recent || undefined);
}

export function interval(hits, n) {
  if (!n) return null;
  const z = 1.96;
  const p = hits / n;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function championsFor(game, team, player = '') {
  const side = teamSide(game, team);
  return game[side].picks.filter(pick => !player || pick.player === player);
}

export function tendencies(cohort, team, player, champion) {
  const bansKnown = cohort.filter(hasCompleteBans);
  const picked = cohort.map(game => championsFor(game, team, player).map(pick => pick.champion));
  const banned = bansKnown.map(game => game[teamSide(game, team)].bans);
  function ranks(perGame) {
    const counts = new Map();
    if (champion) counts.set(champion, 0);
    for (const ids of perGame) {
      for (const id of new Set(ids)) {
        if (!champion || id === champion) counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return [...counts.entries()].map(([id, hits]) => ({
      id, hits, n: perGame.length, ci: interval(hits, perGame.length)
    })).sort((a, b) => b.hits - a.hits || a.id.localeCompare(b.id));
  }
  return { picks: ranks(picked), bans: ranks(banned), banGames: bansKnown.length };
}

export function hasCompleteBans(game) {
  if (SIDES.some(side => game[side].bans?.length !== 5)) return false;
  const banned = new Set(SIDES.flatMap(side => game[side].bans));
  return banned.size === 10 && SIDES.every(side => game[side].picks.every(p => !banned.has(p.champion)));
}

export function fearlessStages(cohort, evidence, team, player, focus) {
  const eligibleSeries = cohort.filter(game => evidence.get(game.id).compatible);
  return Array.from({ length: 5 }, (_, index) => {
    const games = eligibleSeries.filter(game => game.number === index + 1);
    const scopedPicks = games.flatMap(game => championsFor(game, team, player));
    const available = games.filter(game => !evidence.get(game.id).prior.has(focus));
    const hits = available.filter(game => championsFor(game, team, player).some(pick => pick.champion === focus)).length;
    const counts = Map.groupBy(scopedPicks, pick => pick.champion);
    const leaders = [...counts].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return { number: index + 1, games: games.length, eligible: available.length, hits,
      diversity: counts.size, leader: leaders[0]?.[0], leaderHits: leaders[0]?.[1].length ?? 0 };
  });
}

export function macroSummary(cohort, team, player, focus = '') {
  const rows = cohort.filter(game => !focus || championsFor(game, team, player).some(pick => pick.champion === focus));
  const routeGames = rows.filter(game => game.macro?.routes[teamSide(game, team)]);
  const objectiveGames = rows.filter(game => game.macro?.objectivesRead);
  const headCount = (games, predicate) => games.filter(game => predicate(game, teamSide(game, team))).length;
  const timing = kind => {
    const firsts = objectiveGames.flatMap(game => {
      const first = game.macro.objectives.filter(item => item.kind === kind).sort((a, b) => a.seconds - b.seconds)[0];
      return first ? [{ seconds: first.seconds, taken: first.side === teamSide(game, team) }] : [];
    });
    const times = firsts.map(item => item.seconds).sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    return { n: times.length, taken: firsts.filter(item => item.taken).length,
      median: times.length ? (times[mid] + times[Math.floor((times.length - 1) / 2)]) / 2 : null,
      earliest: times[0], latest: times.at(-1) };
  };
  const timings = { Drake: timing('Drake'), Herald: timing('Herald') };
  const sides = Object.fromEntries(SIDES.map(side => {
    const games = rows.filter(game => teamSide(game, team) === side);
    return [side, { wins: games.filter(game => game.winner === side).length, n: games.length }];
  }));
  return {
    timings, sides,
    sideGap: sides.blue.n && sides.red.n ? sides.blue.wins / sides.blue.n - sides.red.wins / sides.red.n : null,
    games: rows.length,
    top: headCount(routeGames, (game, side) => game.macro.routes[side] === 'Top'),
    bottom: headCount(routeGames, (game, side) => game.macro.routes[side] === 'Bottom'),
    routeGames: routeGames.length, objectiveGames: objectiveGames.length,
    firstDrake: timings.Drake.taken,
    dragonGames: timings.Drake.n,
    drakeEarly: headCount(objectiveGames, (game, side) => game.macro.objectives.some(item =>
      item.kind === 'Drake' && item.side === side && item.seconds <= 14 * 60)),
    grubsEarly: headCount(objectiveGames, (game, side) => game.macro.objectives.some(item =>
      item.kind === 'Grubs' && item.side === side && item.seconds <= 14 * 60))
  };
}

export function scoutInsight(cohort, evidence, team, player, focus, catalog) {
  const early = cohort.filter(game => game.number === 1);
  const selected = focus || tendencies(early, team, player).picks[0]?.id;
  if (!selected) return null;
  const withPick = game => championsFor(game, team, player).some(pick => pick.champion === selected);
  const won = game => game[game.winner].team === team;
  const open = early.filter(withPick);
  const without = early.filter(game => !withPick(game));
  const role = catalog.get(selected)?.role;
  const replacements = new Map();
  const laterLocked = cohort.filter(game => game.number >= 2 && evidence.get(game.id).compatible
    && evidence.get(game.id).prior.has(selected));
  if (role) {
    for (const game of laterLocked) {
      const replacement = championsFor(game, team, player).find(pick => pick.role === role);
      if (replacement) replacements.set(replacement.champion, (replacements.get(replacement.champion) || 0) + 1);
    }
  }
  const backup = [...replacements].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const macro = macroSummary(open, team, player);
  return {
    champion: selected, count: open.length, n: early.length, ci: interval(open.length, early.length),
    winsWith: open.filter(won).length, gamesWith: open.length,
    winsWithout: without.filter(won).length, gamesWithout: without.length,
    laterGames: laterLocked.length, backup, backupN: [...replacements.values()].reduce((a, b) => a + b, 0),
    macro, actionable: early.length >= 6 && open.length >= 3 && open.length / early.length >= 0.35
  };
}

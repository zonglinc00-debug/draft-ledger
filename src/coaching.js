import { SIDES, championsFor, hasCompleteBans, otherSide, teamSide } from './scout.js';
import { newDraft } from './draft.js';

// Only pairs inside the filter window can contribute an exposure and an outcome.
export function followupResults(cohort, evidence, team, focus) {
  const results = { banned: { n: 0, wins: 0 }, open: { n: 0, wins: 0 } };
  for (const series of Map.groupBy(cohort, game => game.series).values()) {
    const first = series.find(game => game.number === 1);
    const second = series.find(game => game.number === 2);
    if (!first || !second || !evidence.get(first.id)?.compatible || !hasCompleteBans(first)) continue;
    const side = teamSide(first, team);
    // A self-ban is neither an opposing ban nor an open champion.
    if (first[side].bans.includes(focus)) continue;
    const group = first[otherSide(side)].bans.includes(focus) ? results.banned : results.open;
    group.n++;
    if (second[second.winner].team === team) group.wins++;
  }
  return results;
}

// Use the same two roles across games when known. Roster-only imports can still
// show a concrete pair without inferring a lane assignment or pick order.
function featuredPair(picks) {
  const lane = ['Bottom', 'Support'].map(role => picks.find(pick => pick.role === role));
  const selected = lane.every(Boolean) ? lane : [...picks].sort((a, b) => a.player.localeCompare(b.player)).slice(0, 2);
  return { lane: lane.every(Boolean), ids: selected.map(pick => pick.champion) };
}

export function seriesTimeline(games, evidence, series, team) {
  const rows = games.filter(game => game.series === series).sort((a, b) => a.number - b.number);
  if (!rows.length || rows.some(game => !teamSide(game, team) || !evidence.get(game.id)?.compatible)) return [];
  let wins = 0;
  return rows.map((game, index) => {
    const side = teamSide(game, team);
    if (game.winner === side) wins++;
    const prior = evidence.get(game.id).prior;
    const previous = rows[index - 1];
    const previousSide = previous && teamSide(previous, team);
    const released = previous && hasCompleteBans(previous) && hasCompleteBans(game)
      ? previous[previousSide].bans.filter(id => !prior.has(id) && SIDES.every(key => !game[key].bans.includes(id)))
        .map(id => ({ id, takenBy: SIDES.find(key => game[key].picks.some(pick => pick.champion === id)) }))
      : null;
    return { game, side, wins, losses: index + 1 - wins, locks: prior.size, released, pair: featuredPair(championsFor(game, team)),
      previousPair: previous ? featuredPair(championsFor(previous, team)) : null };
  });
}

export const rehearsalSeries = 'demo-29';

export function startRehearsal(data) {
  const opener = data.games.find(game => game.series === rehearsalSeries && game.number === 1);
  return { step: 0, series: opener.series, home: opener.blue.team, team: opener.red.team,
    draft: newDraft(5), choice: 'demo-1-0', game: 0 };
}

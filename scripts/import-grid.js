import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compiledGames, deriveRoles, feedCollector, parseCsv, readZstdFeed } from './grid-reader.js';
import { SIDES, verifyDataset } from '../src/scout.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const { values: args } = parseArgs({ options: {
  root: { type: 'string' }, home: { type: 'string' }, series: { type: 'string' },
  'series-limit': { type: 'string' }, feeds: { type: 'string' },
  help: { type: 'boolean', short: 'h' }
} });

if (args.help) {
  console.log('npm run grid -- --root ../stl-hackathon-2026-grid-starter [--home TEAM] [--series ID,ID | --series-limit 120 --feeds 24]');
  process.exit(0);
}

function withinBudget(recent, homeSeries, limit) {
  const reserved = recent.filter(row => homeSeries.has(row.series_id)).slice(0, Math.ceil(limit / 4));
  const selected = new Map(reserved.map(row => [row.series_id, row]));
  for (const row of recent) {
    if (selected.size >= limit) break;
    selected.set(row.series_id, row);
  }
  return [...selected.values()];
}

try {
  if (args.series !== undefined && (args.feeds !== undefined || args['series-limit'] !== undefined)) {
    throw new Error('Choose either an exact --series slice or cohort budgets.');
  }
  const seriesLimit = Number(args['series-limit'] ?? 120);
  const feedLimit = Number(args.feeds ?? 24);
  if (!Number.isSafeInteger(seriesLimit) || seriesLimit < 1 || !Number.isSafeInteger(feedLimit) || feedLimit < 0) {
    throw new Error('--series-limit must be a positive integer and --feeds a nonnegative integer.');
  }
  const root = await realpath(args.root || process.env.STL_DATA_DIR || path.join(project, '../stl-hackathon-2026-grid-starter'));
  const relative = path.relative(await realpath(project), root);
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error('Keep the GRID clone outside the project directory.');
  }
  const csv = async (file, legacyOptional = false) => {
    try {
      return parseCsv(await readFile(path.join(root, file), 'utf8'));
    } catch (error) {
      if (!legacyOptional || args.series !== undefined || error.code !== 'ENOENT') throw error;
      console.error(`Missing ${file}; using v1 roster and series labels.`);
      return [];
    }
  };
  const [seriesIndex, teamRows, champRows, gameRows, rosterRows, playerRows, tournamentRows] = await Promise.all([
    csv('lol/series.csv'), csv('meta/teams.csv'), csv('meta/characters.csv'), csv('meta/games.csv'), csv('meta/rosters.csv'),
    csv('meta/players.csv', true), csv('meta/tournaments.csv', true)
  ]);
  const league = rows => rows.filter(row => row.title === 'lol');
  const rawGames = league(gameRows);
  const exact = args.series === undefined ? null : new Set(args.series.split(',').map(id => id.trim()));
  const indexed = new Map(seriesIndex.map(row => [row.series_id, row]));
  if (exact && [...exact].some(id => !/^\d+$/.test(id) || !indexed.has(id))) {
    throw new Error('--series needs comma-separated IDs from lol/series.csv.');
  }
  const defaultTeam = exact ? rawGames.find(game => exact.has(game.series_id))?.team1_id : 'Cloud9 Kia';
  const homeText = (args.home ?? defaultTeam ?? '').trim().toLowerCase();
  const homeMatches = league(teamRows).filter(team =>
    [team.team_id, team.name, ...(team.other_names || '').split('; ')].some(name => name?.toLowerCase() === homeText));
  if (!homeText || homeMatches.length !== 1) throw new Error(`Expected one LoL team for --home "${homeText}". Use the team ID if names overlap.`);
  const home = homeMatches[0].team_id;
  const headToHead = new Set(rawGames.filter(game => game.team1_id === home || game.team2_id === home)
    .flatMap(game => [game.team1_id, game.team2_id]));
  if (!headToHead.size) throw new Error('The selected home team has no games.');
  const homeSeries = new Set(rawGames.filter(game => game.team1_id === home || game.team2_id === home)
    .map(game => game.series_id));
  const rivalSeries = new Set(rawGames.filter(game => headToHead.has(game.team1_id) || headToHead.has(game.team2_id))
    .map(game => game.series_id));
  const recentFirst = (a, b) => b.scheduled_start.localeCompare(a.scheduled_start) || b.series_id.localeCompare(a.series_id);
  const recent = seriesIndex.filter(row => rivalSeries.has(row.series_id)).sort(recentFirst);
  const selected = exact ? [...exact].map(id => indexed.get(id)) : withinBudget(recent, homeSeries, seriesLimit);
  if (exact && !selected.some(row => homeSeries.has(row.series_id))) {
    throw new Error('The --home team must appear in the selected series.');
  }
  const teamNames = new Map(league(teamRows).map(row => [row.team_id, { id: row.team_id, name: row.name }]));
  const catalog = new Map(league(champRows).map(row => [row.character_id, { id: row.character_id, name: row.name }]));
  const players = new Map(league(playerRows).map(row => [row.player_id, row]));
  const stages = Map.groupBy(league(tournamentRows), row => JSON.stringify([row.event, row.stage]));
  const { games, skipped, lookupMisses } = compiledGames(rawGames, league(rosterRows), selected, catalog, teamNames, players, stages);
  const groups = Map.groupBy(games, game => game.series);
  const streamPlan = selected.filter(row => groups.has(row.series_id)).sort(recentFirst);
  if (exact && streamPlan.length !== selected.length) {
    throw new Error(`Selected series without complete games: ${selected.filter(row => !groups.has(row.series_id)).map(row => row.series_id).join(', ')}.`);
  }
  const streamRows = exact ? streamPlan : withinBudget(streamPlan, homeSeries, feedLimit);
  let failures = 0;
  const audit = { envelopes: 0, events: 0, sequenceGaps: 0, missingSequenceNumbers: 0,
    unmappedBans: 0, untimedOrUnmappedObjectives: 0 };
  for (const row of streamRows) {
    const file = row.file;
    if (!/^\d+$/.test(row.series_id) || file !== `lol/events_${row.series_id}_grid.jsonl.zst`) {
      failures++;
      console.error(`Series ${row.series_id} has an unexpected path in the index.`);
      continue;
    }
    try {
      const collector = feedCollector(groups.get(row.series_id), catalog);
      await readZstdFeed(path.join(root, file), collector, row.series_id);
      for (const key of Object.keys(audit)) audit[key] += collector.stats[key];
      console.log(`Series ${row.series_id}: ${collector.stats.envelopes} envelopes, ${collector.stats.events} events.`);
    } catch (error) {
      failures++;
      console.error(`Series ${row.series_id} unavailable (${error.code || error.message}).`);
    }
  }
  console.log(`Completed streams: ${streamRows.length - failures}/${streamRows.length}. Audit: ${JSON.stringify({ ...audit, lookupMisses })}`);
  if (exact && failures) throw new Error('Exact slice incomplete. The previous extract was preserved.');
  deriveRoles(catalog, games);
  const namesUsed = new Set(games.flatMap(game => SIDES.map(side => game[side].team)));
  const data = verifyDataset({
    version: 1, source: 'grid', home,
    catalog: [...catalog.values()].filter(entry => entry.id && entry.name).sort((a, b) => a.name.localeCompare(b.name)),
    teams: [...namesUsed].map(id => teamNames.get(id)), games
  });
  const outputDir = path.join(project, '.grid-private');
  const output = path.join(outputDir, 'scouting.grid.json');
  const temporary = path.join(outputDir, `scouting-${process.pid}.grid.json`);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`Private import prepared: ${games.length} games, ${groups.size} series, ${skipped} incomplete games skipped.`);
  console.log(`Coverage: ${games.filter(game => game.blue.bans !== null).length} games with verified bans, ${games.filter(game => game.macro?.objectivesRead).length} with timed objectives, ${games.filter(game => game.macro?.routes.blue || game.macro?.routes.red).length} with route evidence. ${failures} feeds unavailable.`);
  console.log(`Records: ${games.flatMap(game => SIDES.flatMap(side => game[side].bans || [])).length} bans, ${games.reduce((n, game) => n + (game.macro?.objectives.length || 0), 0)} timed objectives.`);
  console.log('Open .grid-private/scouting.grid.json from the app using Import local data.');
} catch (error) {
  console.error(`GRID import failed: ${error.message}`);
  process.exitCode = 1;
}

import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compiledGames, deriveRoles, feedCollector, parseCsv, readZstdFeed } from './grid-reader.js';
import { SIDES, verifyDataset } from '../src/scout.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const { values: args } = parseArgs({ options: {
  root: { type: 'string' }, home: { type: 'string', default: 'Cloud9 Kia' },
  'series-limit': { type: 'string', default: '120' }, feeds: { type: 'string', default: '24' },
  help: { type: 'boolean', short: 'h' }
} });

if (args.help) {
  console.log('npm run grid -- --root ../stl-hackathon-2026-grid-starter [--home "Cloud9 Kia"] [--series-limit 120] [--feeds 24]');
  process.exit(0);
}

try {
  const seriesLimit = Number(args['series-limit']);
  const feedLimit = Number(args.feeds);
  if (!Number.isSafeInteger(seriesLimit) || seriesLimit < 1 || !Number.isSafeInteger(feedLimit) || feedLimit < 0) {
    throw new Error('--series-limit must be a positive integer and --feeds a nonnegative integer.');
  }
  const root = await realpath(args.root || process.env.STL_DATA_DIR || path.join(project, '../stl-hackathon-2026-grid-starter'));
  const relative = path.relative(await realpath(project), root);
  if (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error('Keep the GRID clone outside the project directory.');
  }
  const csv = async file => parseCsv(await readFile(path.join(root, file), 'utf8'));
  const [seriesIndex, teamRows, champRows, gameRows, rosterRows] = await Promise.all([
    csv('lol/series.csv'), csv('meta/teams.csv'), csv('meta/characters.csv'), csv('meta/games.csv'), csv('meta/rosters.csv')
  ]);
  const league = rows => rows.filter(row => row.title === 'lol');
  const rawGames = league(gameRows);
  const homeText = args.home.trim().toLowerCase();
  const homeMatches = league(teamRows).filter(team =>
    [team.team_id, team.name, ...(team.other_names || '').split('; ')].some(name => name?.toLowerCase() === homeText));
  if (homeMatches.length !== 1) throw new Error(`Expected one LoL team for --home "${args.home}". Use the team ID if names overlap.`);
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
  const reservedHome = recent.filter(row => homeSeries.has(row.series_id)).slice(0, Math.max(1, Math.ceil(seriesLimit / 4)));
  const selected = new Map(reservedHome.map(row => [row.series_id, row]));
  for (const row of recent) {
    if (selected.size === seriesLimit) break;
    selected.set(row.series_id, row);
  }
  const teamNames = new Map(league(teamRows).map(row => [row.team_id, { id: row.team_id, name: row.name }]));
  const catalog = new Map(league(champRows).map(row => [row.character_id, { id: row.character_id, name: row.name }]));
  const { games, skipped } = compiledGames(rawGames, league(rosterRows), [...selected.values()], catalog, teamNames);
  const groups = Map.groupBy(games, game => game.series);
  const streamPlan = [...selected.values()].filter(row => groups.has(row.series_id)).sort(recentFirst);
  const streamRows = new Map();
  for (const row of streamPlan.filter(row => homeSeries.has(row.series_id)).slice(0, Math.ceil(feedLimit / 4))) {
    streamRows.set(row.series_id, row);
  }
  for (const row of streamPlan) {
    if (streamRows.size >= feedLimit) break;
    streamRows.set(row.series_id, row);
  }
  let failures = 0;
  for (const [index, row] of [...streamRows.values()].entries()) {
    const file = row.file;
    if (!/^lol\/events_\d+_grid\.jsonl\.zst$/.test(file)) {
      failures++;
      console.error(`Feed ${index + 1} has an unexpected path in the index.`);
      continue;
    }
    try {
      await readZstdFeed(path.join(root, file), feedCollector(groups.get(row.series_id), catalog));
      console.log(`Feed ${index + 1}/${streamRows.size} streamed.`);
    } catch (error) {
      failures++;
      console.error(`Feed ${index + 1}/${streamRows.size} unavailable (${error.code || error.name}).`);
    }
  }
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
  console.log('Open .grid-private/scouting.grid.json from the app using Import local data.');
} catch (error) {
  console.error(`GRID import failed: ${error.message}`);
  process.exitCode = 1;
}

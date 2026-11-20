import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { zstdCompressSync } from 'node:zlib';
import { compiledGames, feedCollector, parseCsv, readZstdFeed } from '../scripts/grid-reader.js';

const catalog = new Map(Array.from({ length: 20 }, (_, i) => [`c${i}`, { id: `c${i}`, name: `Fictional ${i}` }]));
const teams = new Map([['one', { id: 'one', name: 'A' }], ['two', { id: 'two', name: 'B' }]]);
const makeRows = () => {
  const row = {
    game_id: '1', series_id: '3000', game_number: '1', patch: '1.1',
    team1_id: 'one', team2_id: 'two', team1_side: 'blue_side', team2_side: 'red',
    winner_team_id: 'two'
  };
  const series = [{ series_id: '3000', scheduled_start: '2026-04-01T18:00:00Z' }];
  const roster = Array.from({ length: 10 }, (_, i) => ({
    game_id: '1', team_id: i < 5 ? 'one' : 'two', player_id: `p${i}`,
    character_id: `c${i}`, player_name: `Player ${i}`
  }));
  return { row, series, roster };
};

test('CSV parses quoted commas, newlines, the BOM and escaped quotes', () => {
  const table = parseCsv('\uFEFFtitle,name\r\nlol,"Alpha, ""Beta"""\r\nval,"Two\nLines"\r\n');
  assert.deepEqual(table, [{ title: 'lol', name: 'Alpha, "Beta"' }, { title: 'val', name: 'Two\nLines' }]);
});

test('metadata keeps a supported blue/red result and skips a partial roster', () => {
  const { row, roster, series } = makeRows();
  const data = compiledGames([row], roster, series, catalog, teams);
  assert.equal(data.games.length, 1);
  assert.equal(data.games[0].winner, 'red');
  assert.equal(data.games[0].blue.bans, null);
  assert.equal(compiledGames([row], roster.slice(1), series, catalog, teams).skipped, 1);
});

test('streaming a synthetic zstd feed extracts verified bans, route and objectives', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'draft-ledger-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { row, roster, series } = makeRows();
  const { games } = compiledGames([row], roster, series, catalog, teams);
  const snapshot = (seconds, players = []) => ({ games: [{
    id: '1', clock: { currentSeconds: seconds }, teams: [{ id: 'one', players }]
  }] });
  const bans = Array.from({ length: 10 }, (_, i) => ({
    type: 'team-banned-character', actor: { type: 'team', id: i < 5 ? 'one' : 'two' },
    target: { type: 'character', id: `c${i + 10}` }, seriesState: snapshot(0)
  }));
  const positions = [160, 170, 180, 190].map(time => ({ type: 'player-updated-position',
    seriesState: snapshot(time, [{ id: 'p1', position: { x: 10100, y: 4200 }, role: 'jungle' }]) }));
  const drake = { type: 'player-completed-slayDragon', action: 'completed', actor: { type: 'player', id: 'p1' },
    target: { type: 'slayDragon' }, seriesState: snapshot(342) };
  const lines = [bans, positions, [drake]].map(events => JSON.stringify({ events })).join('\n');
  const file = path.join(dir, 'synthetic.jsonl.zst');
  await writeFile(file, zstdCompressSync(Buffer.from(lines)));
  assert.equal(await readZstdFeed(file, feedCollector(games, catalog)), 3);
  assert.deepEqual(games[0].blue.bans, ['c10', 'c11', 'c12', 'c13', 'c14']);
  assert.equal(games[0].red.bans.length, 5);
  assert.deepEqual(games[0].macro.routes, { blue: 'Bottom', red: null });
  assert.deepEqual(games[0].macro.objectives, [{ kind: 'Drake', side: 'blue', seconds: 342 }]);
});

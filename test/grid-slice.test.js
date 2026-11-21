import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { zstdCompressSync } from 'node:zlib';
import { feedCollector } from '../scripts/grid-reader.js';
import { verifyDataset } from '../src/scout.js';

const picks = side => Array.from({ length: 5 }, (_, i) => ({
  player: side + i, playerName: side + i, champion: side + i
}));
const game = id => ({ id, blue: { team: 'a', picks: picks('a'), bans: null },
  red: { team: 'b', picks: picks('b'), bans: null } });
const bans = Array.from({ length: 10 }, (_, i) => ({
  type: 'ban', drafter: { id: i < 5 ? 'a' : 'b' }, draftable: { id: 'ban' + i }
}));
const catalog = new Map(bans.map(item => [item.draftable.id, item.draftable]));

test('full draft state wins over corrected bans and delta IDs select the game', () => {
  const games = [game('left'), game('right')];
  const collector = feedCollector(games, catalog);
  const full = { includesFullState: true, seriesState: { games: games.map(({ id }) => ({ id, draftActions: bans })) } };
  const event = (action, target, time) => ({
    action, target: { type: target }, actor: { type: 'player', id: 'a1' },
    seriesStateDelta: { games: [{ id: 'left' }] },
    seriesState: { games: [{ id: 'left', clock: { currentSeconds: time } }, { id: 'right', clock: { currentSeconds: 0 } }] }
  });
  collector.ingest({ sequenceNumber: 1, events: [full] });
  collector.ingest({ sequenceNumber: 4, events: [
    event('completed', 'slayDragon', 330), event('completed', 'slayOceanDrake', 330),
    event('completed', 'slayRiftHerald', 900), event('!completed', 'slayRiftHerald', 901),
    event('completed', 'slayRiftHerald', 945)
  ] });
  collector.ingest({ sequenceNumber: 5, events: [{ ...full, seriesState: { games: [
    { id: 'right', draftActions: bans.slice(1) }
  ] } }] });
  collector.finish();
  assert.equal(games[1].red.bans, null);
  assert.equal(games[1].macro, undefined);
  assert.equal(games[0].red.bans.length, 5);
  assert.deepEqual(games[0].macro.objectives, [
    { kind: 'Drake', side: 'blue', seconds: 330 }, { kind: 'Herald', side: 'blue', seconds: 945 }
  ]);
  assert.deepEqual([collector.stats.events, collector.stats.sequenceGaps, collector.stats.missingSequenceNumbers], [7, 1, 2]);
  assert.throws(() => collector.ingest({ sequenceNumber: 5, events: [] }), /sequence/);
});

test('route votes use distinct buckets per identified player across sparse updates', () => {
  const item = game('x');
  const collect = feedCollector([item], catalog);
  const sample = (time, player) => ({ seriesState: { games: [
    { id: 'x', clock: { currentSeconds: time }, teams: [{ players: [player] }] }
  ] } });
  const pos = { x: 3100, y: 8800 };
  const samples = [sample(0, { id: 'a0', roles: [{ name: 'Jungle' }] })];
  for (const time of [160, 161, 170, 180]) {
    samples.push(sample(time, { id: 'a1', position: pos }), sample(time, { id: 'a0', position: pos }));
  }
  samples.push(sample(170, { id: 'b2', role: 'Jungle', position: pos }));
  collect.ingest({ events: samples });
  collect.finish();
  assert.deepEqual(item.macro.routes, { blue: 'Top', red: null });
  assert.equal(item.macro.objectivesRead, false);
});

test('exact LoL CLI slice joins six tables and preserves the extract on stream failure', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ledger-slice-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const project = path.join(dir, 'app');
  const root = path.join(dir, 'data');
  await mkdir(project);
  for (const name of ['scripts', 'src', 'package.json']) {
    await cp(new URL('../' + name, import.meta.url), path.join(project, name), { recursive: true });
  }
  for (const folder of ['lol', 'meta']) await mkdir(path.join(root, folder), { recursive: true });
  const put = (name, lines) => writeFile(path.join(root, name), lines.join('\n'));
  const run = (...args) => spawnSync(process.execPath,
    ['scripts/import-grid.js', '--root', root, ...args], { cwd: project, encoding: 'utf8' });
  const roster = [...picks('a'), ...picks('b')];
  await put('lol/series.csv', ['series_id,event,stage,scheduled_start,file',
    ...['21', '22'].map(id => `${id},Cup,Final,2026-01-02T12:00:00Z,lol/events_${id}_grid.jsonl.zst`)]);
  await put('meta/tournaments.csv', ['title,tournament_id,event,stage,first_scheduled,last_scheduled',
    'lol,stage1,Cup,Final,2026-01-01,2026-01-03', 'val,wrong,Cup,Final,2026-01-01,2026-01-03']);
  await put('meta/teams.csv', ['title,team_id,name', 'lol,a,Alpha', 'lol,b,Beta']);
  await put('meta/characters.csv', ['title,character_id,name', ...roster.map(p => `lol,${p.champion},Hero ${p.champion}`)]);
  await put('meta/players.csv', ['title,player_id,name', ...roster.map(p => `lol,${p.player},Callsign ${p.player}`), 'val,a0,Wrong']);
  await put('meta/games.csv', ['title,series_id,game_id,game_number,team1_id,team1_side,team2_id,team2_side,winner_team_id,finished',
    'lol,21,g1,1,a,blue,b,red,b,True', 'lol,22,g2,1,b,red,a,blue,a,True']);
  await put('meta/rosters.csv', ['title,series_id,game_id,team_id,player_id,character_id,participation_status',
    ...['21', '22'].flatMap((id, j) => roster.map(p => `lol,${id},g${j + 1},${p.player[0]},${p.player},${p.champion},active`)),
    'lol,21,g1,a,sub,unused,inactive']);
  const feed = path.join(root, 'lol/events_21_grid.jsonl.zst');
  const envelope = { seriesId: '21', sequenceNumber: 1, events: [{
    type: 'player-completed-slayDragon', actor: { id: 'b0', type: 'player' }, action: 'completed',
    target: { type: 'slayDragon' }, seriesState: { games: [{ id: 'g1', clock: { currentSeconds: 400 } }] }
  }] };
  await writeFile(feed, zstdCompressSync(Buffer.from(JSON.stringify(envelope))));
  const result = run('--series', '21');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"events":1/);
  const extract = path.join(project, '.grid-private/scouting.grid.json');
  const saved = await readFile(extract, 'utf8');
  const data = verifyDataset(JSON.parse(saved));
  assert.equal(data.games.length, 1);
  assert.equal(data.games[0].tournamentId, 'stage1');
  assert.equal(data.games[0].blue.picks[0].playerName, 'Callsign a0');
  assert.deepEqual(data.games[0].macro.objectives, [{ kind: 'Drake', side: 'red', seconds: 400 }]);
  for (const ids of ['21,22', '99', '21,../val']) {
    assert.notEqual(run('--series', ids).status, 0);
    assert.equal(await readFile(extract, 'utf8'), saved);
  }
  for (const content of [{ ...envelope, seriesId: '22' }, 'broken']) {
    await writeFile(feed, zstdCompressSync(Buffer.from(JSON.stringify(content))));
    assert.notEqual(run('--series', '21').status, 0);
    assert.equal(await readFile(extract, 'utf8'), saved);
  }
  await rm(path.join(root, 'meta/players.csv'));
  await rm(path.join(root, 'meta/tournaments.csv'));
  assert.notEqual(run('--series', '21').status, 0);
  const metadata = run('--home', 'Alpha', '--feeds', '0');
  assert.equal(metadata.status, 0, metadata.stderr);
  assert.match(metadata.stdout, /Completed streams: 0\/0/);
});

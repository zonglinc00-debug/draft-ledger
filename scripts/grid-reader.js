import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { createZstdDecompress } from 'node:zlib';
import { SIDES } from '../src/scout.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
    row = [];
    cell = '';
  };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && !cell) quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') endRow();
    else if (character !== '\r') cell += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  endRow();
  const headers = rows.shift();
  if (!headers) return [];
  headers[0] = headers[0].replace(/^\uFEFF/, '');
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const stringId = value => ['string', 'number'].includes(typeof value) ? String(value) : '';

export function gridSide(value) {
  const side = String(value ?? '').toLowerCase().replace(/[-_ ]/g, '').replace(/side$/, '');
  return SIDES.includes(side) ? side : null;
}

function gridRole(value) {
  const role = String(value ?? '').toLowerCase().replace(/[-_ ]/g, '');
  return ({ top: 'Top', toplane: 'Top', jungle: 'Jungle', jungler: 'Jungle', mid: 'Mid',
    middle: 'Mid', midlane: 'Mid', bottom: 'Bottom', bot: 'Bottom', adc: 'Bottom',
    carry: 'Bottom', botlane: 'Bottom', support: 'Support', utility: 'Support' })[role];
}

export function compiledGames(gameRows, rosterRows, seriesRows, catalog, teamNames) {
  const rosters = Map.groupBy(rosterRows, row => row.game_id);
  const series = new Map(seriesRows.map(row => [row.series_id, row]));
  const games = [];
  let skipped = 0;
  for (const row of gameRows) {
    const first = gridSide(row.team1_side);
    const second = gridSide(row.team2_side);
    const seriesRow = series.get(row.series_id);
    if (!seriesRow) continue;
    const date = [row.started_at, seriesRow.scheduled_start].find(value => Number.isFinite(Date.parse(value)));
    if (!row.game_id || !row.winner_team_id || !first || !second || first === second || !date
      || !row.team1_id || !row.team2_id || row.team1_id === row.team2_id
      || !Number.isInteger(Number(row.game_number)) || Number(row.game_number) < 1) {
      skipped++;
      continue;
    }
    const winner = row.winner_team_id === row.team1_id ? first : row.winner_team_id === row.team2_id ? second : null;
    const roster = rosters.get(row.game_id) || [];
    const sideData = (id, name) => {
      if (!teamNames.has(id)) teamNames.set(id, { id, name: name || `Team ${id}` });
      const byPlayer = new Map();
      for (const player of roster) {
        if (player.team_id !== id || !player.player_id || !player.character_id) continue;
        if (!catalog.has(player.character_id)) catalog.set(player.character_id, {
          id: player.character_id, name: player.character_name || `Champion ${player.character_id}`
        });
        byPlayer.set(player.player_id, { champion: player.character_id, player: player.player_id,
          playerName: player.player_name || `Player ${player.player_id}`, role: gridRole(player.role || player.position) });
      }
      return { team: id, picks: [...byPlayer.values()], bans: null };
    };
    const sides = { [first]: sideData(row.team1_id, row.team1_name), [second]: sideData(row.team2_id, row.team2_name) };
    const allPicks = [...sides.blue.picks, ...sides.red.picks];
    if (!winner || sides.blue.picks.length !== 5 || sides.red.picks.length !== 5
      || new Set(allPicks.map(pick => pick.champion)).size !== 10) {
      skipped++;
      continue;
    }
    games.push({ id: row.game_id, series: row.series_id, number: Number(row.game_number),
      date, patch: row.patch || 'Unknown', winner, ...sides });
  }
  return { games, skipped };
}

function secondsOf(snapshot) {
  const clock = snapshot?.clock;
  const seconds = clock?.elapsedSeconds ?? clock?.currentSeconds ?? clock?.gameTimeSeconds;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function objectiveType(event) {
  if (event.action !== 'completed' || event.actor?.type !== 'player') return null;
  const action = String(event.target?.type ?? event.type?.split('-').at(-1)).toLowerCase();
  if (!action.startsWith('slay')) return null;
  if (/dragon|drake/.test(action)) return 'Drake';
  if (action.includes('voidgrub')) return 'Grubs';
  if (action.includes('riftherald')) return 'Herald';
  return action.includes('baron') ? 'Baron' : null;
}

function jungleRole(player) {
  if (gridRole(player?.role ?? player?.position?.role) === 'Jungle') return true;
  const abilities = player?.abilities;
  if (!Array.isArray(abilities)) return false;
  return abilities.some(ability => /smite/i.test([ability?.id, ability?.name, ability?.abilityId,
    ability?.ability?.id, ability?.ability?.name].filter(Boolean).join(' ')));
}

function positionMarker(position) {
  const { x, y } = position || {};
  if (![x, y].every(value => Number.isFinite(value) && value >= 1000 && value <= 14500)) return '';
  if (Math.abs(y - x) < 1950) return '';
  return y > x ? 'Top' : 'Bottom';
}

export function feedCollector(games, catalog) {
  const slots = new Map(games.map(game => [game.id, {
    game, bans: { blue: new Set(), red: new Set() }, snapshotBans: null,
    players: new Map(SIDES.flatMap(side => game[side].picks.map(pick => [pick.player, { side, pick }]))),
    objectives: new Map(), routes: new Map(), jungle: new Set(), roles: new Map(), lastBucket: -1
  }]));

  function collectPosition(slot, snapshot, time) {
    if (time === null || time < 150 || time > 220) return;
    const bucket = Math.floor(time / 10);
    if (slot.lastBucket === bucket || !Array.isArray(snapshot.teams)) return;
    slot.lastBucket = bucket;
    for (const team of snapshot.teams) {
      if (!Array.isArray(team.players)) continue;
      for (const player of team.players) {
        const id = stringId(player.id);
        const info = slot.players.get(id);
        if (!info) continue;
        const role = gridRole(player.role ?? player.position?.role);
        if (role) slot.roles.set(id, role);
        if (jungleRole(player) || info.pick.role === 'Jungle') {
          slot.roles.set(id, 'Jungle');
          slot.jungle.add(id);
        }
        const region = positionMarker(player.position);
        if (region) {
          const marks = slot.routes.get(id) || [];
          marks.push(region);
          slot.routes.set(id, marks);
        }
      }
    }
  }

  function collectBans(slot, snapshot) {
    if (!Array.isArray(snapshot.draftActions) || snapshot.draftActions.length < 10) return;
    const draftBans = { blue: new Set(), red: new Set() };
    for (const action of snapshot.draftActions) {
      const keyword = String(action.type ?? action.action ?? action.actionType ?? '').toLowerCase();
      if (!['ban', 'banned', 'team-banned-character'].includes(keyword)) continue;
      const team = stringId(action.team?.id ?? action.teamId ?? action.actor?.id);
      const side = SIDES.find(key => slot.game[key].team === team);
      const champion = stringId(action.character?.id ?? action.characterId ?? action.target?.id);
      if (side && catalog.has(champion)) draftBans[side].add(champion);
    }
    if (SIDES.every(side => draftBans[side].size === 5)) slot.snapshotBans = draftBans;
  }

  function ingest(envelope) {
    if (!Array.isArray(envelope.events)) throw new Error('Expected one events array per GRID envelope.');
    for (const event of envelope.events) {
      const snapshots = event.seriesState?.games ?? event.seriesStateDelta?.games;
      if (!Array.isArray(snapshots) || !snapshots.length) continue;
      const snapshot = snapshots.at(-1);
      const slot = slots.get(stringId(snapshot.id));
      if (!slot) continue;
      const time = secondsOf(snapshot);
      const team = event.actor?.type === 'team' ? stringId(event.actor.id) : '';
      const actorSide = SIDES.find(side => slot.game[side].team === team);
      const target = stringId(event.target?.id);
      if (actorSide && catalog.has(target)) {
        if (event.type === 'team-banned-character') slot.bans[actorSide].add(target);
        if (event.type === 'team-!banned-character') slot.bans[actorSide].delete(target);
      }
      if (snapshot.draftActions?.length && !slot.snapshotBans) collectBans(slot, snapshot);
      const kind = objectiveType(event);
      const side = slot.players.get(stringId(event.actor?.id))?.side;
      if (kind && side && time !== null) {
        slot.objectives.set(`${kind}:${side}:${Math.floor(time)}`, { kind, side, seconds: time });
      }
      collectPosition(slot, snapshot, time);
    }
  }

  function finish() {
    for (const slot of slots.values()) {
      const { game, players } = slot;
      for (const [id, role] of slot.roles) players.get(id).pick.role = role;
      const banned = slot.snapshotBans || slot.bans;
      const allBans = SIDES.flatMap(side => [...banned[side]]);
      const picks = SIDES.flatMap(side => game[side].picks.map(pick => pick.champion));
      if (allBans.length === 10 && new Set(allBans).size === 10 && !allBans.some(id => picks.includes(id))) {
        for (const side of SIDES) game[side].bans = [...banned[side]];
      }
      const routes = { blue: null, red: null };
      for (const side of SIDES) {
        const ids = [...slot.jungle].filter(id => players.get(id).side === side);
        if (ids.length !== 1) continue;
        const marks = slot.routes.get(ids[0]) || [];
        if (marks.length < 3) continue;
        const top = marks.filter(region => region === 'Top').length;
        if (top / marks.length >= 0.7) routes[side] = 'Top';
        if ((marks.length - top) / marks.length >= 0.7) routes[side] = 'Bottom';
      }
      const objectives = [...slot.objectives.values()].sort((a, b) => a.seconds - b.seconds);
      if (objectives.length || routes.blue || routes.red) {
        game.macro = { routes, objectives, objectivesRead: objectives.length > 0 };
      }
    }
  }
  return { ingest, finish };
}

export async function readZstdFeed(file, collect) {
  const stream = createZstdDecompress();
  const decompression = pipeline(createReadStream(file), stream);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  decompression.catch(() => lines.close());
  let envelopes = 0;
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      collect.ingest(JSON.parse(line));
      envelopes++;
    }
    await decompression;
  } catch (error) {
    stream.destroy();
    await decompression.catch(() => {});
    throw error;
  }
  if (!envelopes) throw new Error('The feed is empty.');
  collect.finish();
  return envelopes;
}

export function deriveRoles(catalog, games) {
  const picks = games.flatMap(game => SIDES.flatMap(side => game[side].picks));
  for (const [id, examples] of Map.groupBy(picks.filter(pick => pick.role), pick => pick.champion)) {
    const roles = [...Map.groupBy(examples, pick => pick.role)].sort((a, b) => b[1].length - a[1].length);
    if (roles[0][1].length >= 3 && roles[0][1].length / examples.length >= 0.75) catalog.get(id).role = roles[0][0];
  }
}

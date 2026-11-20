import { ORDER, ROLES, randomFrom } from './draft.js';

const DEMO_TEAMS = [
  ['northstar', 'Northstar', 'NTH'], ['breakwater', 'Breakwater', 'BRK'],
  ['meridian', 'Meridian', 'MER'], ['glasshouse', 'Glasshouse', 'GLS'],
  ['palisade', 'Palisade', 'PAL'], ['daybreak', 'Daybreak', 'DAY'],
  ['limelight', 'Limelight', 'LIM'], ['highland', 'Highland', 'HLD']
];

const DEMO_NAMES = [
  ['Ironwake', 'Redoubt', 'Riftwarden', 'Stonecall', 'Palis', 'Cragmere', 'Shieldrun', 'Granite', 'Scoria', 'Bastion', 'Vellum', 'Tor', 'Flint', 'Rook', 'Tenon', 'Moraine'],
  ['Mirehorn', 'Wildstep', 'Bramble', 'Fenwick', 'Thornjaw', 'Quarry', 'Driftwood', 'Ashtrail', 'Duskstride', 'Mossbraid', 'Hollowroot', 'Fallow', 'Riverbend', 'Firebreak', 'Sift', 'Woodrush'],
  ['Glimmer', 'Hourglass', 'Beacon', 'Vesper', 'Wisp', 'Aster', 'Fable', 'Sable', 'Echo', 'Nacre', 'Skein', 'Mirage', 'Cinder', 'Aperture', 'Arc', 'Sundial'],
  ['Longshot', 'Pinion', 'Copperleaf', 'Larkspur', 'Tern', 'Highwire', 'Scuttle', 'Gilt', 'Hawkmoth', 'Wren', 'Windlass', 'Crosswind', 'Stringer', 'Sparrow', 'Carillon', 'Daystar'],
  ['Lantern', 'Harbor', 'Chime', 'Mallow', 'Starweft', 'Gossamer', 'Fennel', 'Coastline', 'Marlin', 'Wick', 'Cloudberry', 'Braided Reed', 'Spindle', 'Seam', 'Cairn', 'Belltower']
];

const DEMO_PLAYERS = ['Hale', 'Silt', 'Rill', 'Pike', 'Lumen'];

export function makeDemo() {
  const catalog = DEMO_NAMES.flatMap((names, role) => names.map((name, position) => ({
    id: `demo-${role}-${position}`, name, role: ROLES[role]
  })));
  const teams = DEMO_TEAMS.map(([id, name, short]) => ({ id, name, short }));
  const random = randomFrom(821731);
  const games = [];
  const pickOne = options => options[Math.floor(random() * options.length)];

  for (let series = 0; series < 96; series++) {
    const pair = series < 36
      ? [1, series % 4 === 0 ? 0 : 2 + (series % 6)]
      : [series % 8, (series + 1 + (series * 17 % 7)) % 8];
    const maxGames = series % 4 < 2 ? 5 : 3;
    const past = new Set();
    const seriesWins = [0, 0];
    for (let number = 1; number <= maxGames; number++) {
      const blueIndex = (series + number) % 2;
      const indexes = { blue: pair[blueIndex], red: pair[1 - blueIndex] };
      const sides = Object.fromEntries(Object.entries(indexes).map(([side, teamIndex]) => [
        side, { team: teams[teamIndex].id, picks: [], bans: [] }
      ]));
      const used = new Set(past);
      const priority = indexes.blue === 1 && number === 1 ? 'blue' : indexes.red === 1 && number === 1 ? 'red' : '';
      const priorityPick = priority && random() < 0.72;
      const roleOrder = [1, 2, 3, 4, 0];
      const roleOrders = Object.fromEntries(Object.keys(sides).map(side => [
        side, side === priority && priorityPick ? roleOrder : [...roleOrder.slice(1), 1]
      ]));
      for (const [side, kind] of ORDER) {
        const team = sides[side];
        if (kind === 'ban') {
          const position = team.bans.length;
          const role = [2, 3, 0, 4, 1][position];
          const options = catalog.filter(champ => champ.role === ROLES[role] && !used.has(champ.id)
            && !(priorityPick && champ.id === 'demo-1-0'));
          const champion = options[Math.min(options.length - 1, Math.floor(random() ** 2 * options.length))];
          used.add(champion.id);
          team.bans.push(champion.id);
          continue;
        }
        const role = roleOrders[side][team.picks.length];
        const options = catalog.filter(champ => champ.role === ROLES[role] && !used.has(champ.id)
          && !(priorityPick && champ.id === 'demo-1-0' && side !== priority));
        const champion = side === priority && priorityPick && role === 1
          ? options.find(champ => champ.id === 'demo-1-0')
          : options[Math.floor(random() ** 2 * options.length)];
        used.add(champion.id);
        past.add(champion.id);
        team.picks.push({ champion: champion.id, role: ROLES[role],
          player: `${team.team}:${role}`,
          playerName: indexes[side] === 1 ? DEMO_PLAYERS[role] : `${teams[indexes[side]].short} ${DEMO_PLAYERS[role]}` });
      }
      const hasMirehorn = side => sides[side].picks.some(pick => pick.champion === 'demo-1-0');
      const blueStrength = 0.51 + (indexes.blue === 0 ? 0.045 : 0) - (indexes.red === 0 ? 0.045 : 0)
        + (hasMirehorn('blue') ? 0.18 : 0) - (hasMirehorn('red') ? 0.18 : 0);
      const winner = random() < blueStrength ? 'blue' : 'red';
      seriesWins[winner === 'blue' ? blueIndex : 1 - blueIndex]++;
      const route = side => random() < (hasMirehorn(side) ? 0.8 : 0.54) ? 'Bottom' : 'Top';
      const routeBlue = route('blue');
      const routeRed = route('red');
      const firstDrake = random() < (routeBlue === 'Bottom' ? 0.68 : routeRed === 'Bottom' ? 0.37 : 0.5) ? 'blue' : 'red';
      games.push({
        id: `demo-${series + 1}-${number}`, series: `demo-${series + 1}`, number,
        date: new Date(Date.UTC(2026, 6, 1 + series, 18, number)).toISOString(),
        patch: series > 71 ? '26.19' : series > 39 ? '26.18' : '26.17',
        winner, ...sides,
        macro: { routes: { blue: routeBlue, red: routeRed }, objectivesRead: true, objectives: [
          { kind: 'Drake', side: firstDrake, seconds: 340 + Math.floor(random() * 145) },
          { kind: 'Grubs', side: pickOne(['blue', 'red']), seconds: 500 + Math.floor(random() * 88) },
          { kind: 'Herald', side: pickOne(['blue', 'red']), seconds: 910 + Math.floor(random() * 94) }
        ].sort((a, b) => a.seconds - b.seconds) }
      });
      if (seriesWins.includes(Math.ceil(maxGames / 2))) break;
    }
  }
  return { version: 1, source: 'demo', catalog, teams, games, home: 'northstar' };
}

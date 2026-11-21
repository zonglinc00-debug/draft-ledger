import { makeDemo } from './demo.js';
import { followupResults, seriesTimeline, startRehearsal } from './coaching.js';
import { ORDER, ROLES, addAction, availability, lockedBefore, newDraft, nextGame, phase, restoreDraft, setHomeSide, undoAction } from './draft.js';
import { compareForecast, draftEstimator, preferences, trainForecast } from './forecast.js';
import { SIDES, checkSeries, fearlessStages, macroSummary, otherSide, scoutCohort, scoutInsight, teamSide, tendencies, verifyDataset } from './scout.js';

const main = document.querySelector('#workspace');
const notice = document.querySelector('#notice');
const fileInput = document.querySelector('#data-file');
const views = { scout: 'Scouting', draft: 'Draft room', method: 'Method & data', coach: 'Coach rehearsal' };
const storageKey = 'draft-ledger:demo:v1';
const publishedDemo = makeDemo();
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
const sortName = (a, b) => a.name.localeCompare(b.name);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const percent = (count, n) => n ? `${Math.round(100 * count / n)}%` : '—';
const pair = (count, n) => n ? `${count}/${n}` : '—';
const signed = value => `${value >= 0 ? '+' : '−'}${(Math.abs(value) * 100).toFixed(1)} pp`;
const capital = text => text[0].toUpperCase() + text.slice(1);

let state;
let workspaceState;
let rehearsal;
let forecastCache;

function makeState(data, restore = true) {
  verifyDataset(data);
  const catalog = new Map(data.catalog.map(champ => [champ.id, champ]));
  const names = new Map(data.teams.map(team => [team.id, team]));
  const home = data.home;
  const nearby = new Map();
  for (const game of data.games) {
    const side = teamSide(game, home);
    if (side) {
      const team = game[otherSide(side)].team;
      nearby.set(team, (nearby.get(team) || 0) + 1);
    }
  }
  const team = data.source === 'demo' ? 'breakwater'
    : [...nearby].sort((a, b) => b[1] - a[1])[0]?.[0] || data.teams.find(item => item.id !== home).id;
  let draft = newDraft();
  if (restore && data.source === 'demo') {
    try { draft = restoreDraft(JSON.parse(localStorage.getItem(storageKey)), catalog); } catch {}
  }
  return {
    data, catalog, names, home, team, patch: '', player: '', focus: '', recent: 0,
    evidence: checkSeries(data.games), model: trainForecast(data.games),
    draft, game: draft.games.length - 1,
    choice: '', search: '', poolRole: '', poolStatus: 'available'
  };
}

function install(data) {
  workspaceState = makeState(data);
  rehearsal = null;
  forecastCache = null;
}

const champName = id => state.catalog.get(id)?.name ?? '';
const teamName = id => state.names.get(id)?.name ?? '';
const viewName = () => Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'scout';

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = !message;
}

function saveDraft() {
  if (state.data.source !== 'demo' || state === rehearsal) return;
  try { localStorage.setItem(storageKey, JSON.stringify(state.draft)); } catch {}
}

function select(id, label, options, active) {
  return `<label for="${id}"><span>${label}</span><select id="${id}" aria-label="${label}">
    ${options.map(([value, text]) => `<option value="${escapeHtml(value)}"${String(active) === String(value) ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')}
  </select></label>`;
}

function bar(label, hits, n, variant = '') {
  return `<div class="bar-row"><span class="bar-name">${escapeHtml(label)}</span>
    <div class="bar-track ${variant}" aria-hidden="true"><span style="width:${n ? 100 * hits / n : 0}%"></span></div>
    <span class="bar-values">${percent(hits, n)} <small>${pair(hits, n)}</small></span></div>`;
}

function heading(title, description) {
  return `<div class="panel-heading"><div><h2>${title}</h2><p class="description">${description}</p></div></div>`;
}

function metric(label, value, context = '') {
  return `<div class="stat"><dt>${label}</dt><dd>${value}${context ? `<span class="qualify">${context}</span>` : ''}</dd></div>`;
}

function percentInterval(ci) {
  return ci ? `${Math.round(100 * ci[0])}–${Math.round(100 * ci[1])}%` : 'unavailable';
}

function insightCard(insight, homeOpeners, showDraftLink = true) {
  if (!insight) {
    return `<article class="panel insight span"><h2>How to win</h2>
      <p class="description">Choose a cohort with Game 1 evidence to identify an opening priority.</p></article>`;
  }
  const { champion, count, n, ci, gamesWith, winsWith, gamesWithout, winsWithout,
    laterGames, backup, backupN, macro, actionable } = insight;
  const name = escapeHtml(champName(champion));
  const opponent = escapeHtml(teamName(state.team));
  const bottom = macro.bottom >= macro.top;
  const routeHits = bottom ? macro.bottom : macro.top;
  const route = bottom ? 'bottom' : 'top';
  const homePicks = homeOpeners.filter(game => game[teamSide(game, state.home)].picks.some(pick => pick.champion === champion)).length;
  return `<article class="panel insight span">
    <div class="panel-heading">
      <div><p class="eyebrow">How to win</p><h2>${actionable ? `Test a Game 1 ban on ${name}` : `Review ${name} in the opener`}</h2></div>
      ${actionable && showDraftLink ? `<button type="button" class="button primary" data-action="test-insight" data-champion="${escapeHtml(champion)}">Test in draft room</button>` : ''}
    </div>
    <p class="description">${opponent} picked <strong>${name}</strong> in <strong>${count} of ${n} Game 1s</strong>${n ? ` (${percent(count, n)}, 95% Wilson interval ${percentInterval(ci)})` : ''}.
      ${actionable ? 'Compare the first-ban scenario with your current board.' : 'The current sample does not meet the threshold for a ban suggestion.'}
      ${macro.routeGames >= 5 && routeHits / macro.routeGames >= 0.65 ? `If the pick stays open, check ${route}-side vision before the first objective.` : ''}
    </p>
    ${homeOpeners.length ? `<p class="meta">${escapeHtml(teamName(state.home))} used this pick in ${homePicks}/${homeOpeners.length} openers in the same patch and recency window.</p>` : ''}
    <div class="insight-points">
      <div class="insight-point"><strong>${gamesWith && gamesWithout ? `${percent(winsWith, gamesWith)} / ${percent(winsWithout, gamesWithout)}` : '—'}</strong><span>Observed wins with / without the pick · ${pair(winsWith, gamesWith)} vs ${pair(winsWithout, gamesWithout)}</span></div>
      <div class="insight-point"><strong>${backup ? escapeHtml(champName(backup[0])) : '—'}</strong><span>${backup ? `Most-used same-role fallback · ${backup[1]}/${backupN} role observations` : `${laterGames} later games with the champion already locked · no supported role comparison`}</span></div>
      <div class="insight-point"><strong>${macro.routeGames ? `${percent(routeHits, macro.routeGames)} ${capital(route)}` : '—'}</strong><span>Jungle position with this pick · ${routeHits}/${macro.routeGames} classified games</span></div>
    </div>
  </article>`;
}

function stageCard(stages, focus) {
  const name = escapeHtml(champName(focus));
  return `<article class="panel span">${heading('Fearless shifts',
    'Compare observed pools by game number in series with a complete, repeat-free draft history.')}
    <div class="stage-grid">
      ${stages.map(stage => `<div class="stage-tile"><h3>Game ${stage.number}</h3>
        <p class="muted">${stage.games} ${stage.games === 1 ? 'game' : 'games'} · ${stage.diversity} unique picks</p>
        <strong>${stage.leader ? escapeHtml(champName(stage.leader)) : 'No eligible games'}</strong>
        ${stage.leader ? `<p class="meta">Most picked · ${stage.leaderHits}/${stage.games}</p>` : ''}
        ${focus && stage.games ? `<div class="bar-track" aria-hidden="true"><span style="width:${100 * stage.eligible / stage.games}%"></span></div>
          <span class="available">${name} picked ${stage.hits}/${stage.eligible} eligible</span>
          <p class="meta">${stage.games - stage.eligible} already locked</p>` : ''}
      </div>`).join('')}
    </div>
    <p class="meta stage-note">Eligibility is checked at the start of the draft, before current bans. Later games come from series that lasted that long.</p>
  </article>`;
}

function macroCard(macro, focus) {
  const qualifier = focus ? ` · with ${escapeHtml(champName(focus))}` : '';
  return `<article class="panel span">${heading('Opening macro',
    `${macro.games} games in scope${qualifier} · ${macro.routeGames} with route evidence · ${macro.objectiveGames} with timed objectives.`)}
    <div class="dashboard">
      <section><h3>Jungle position around 3:00</h3>
        ${bar('Top side', macro.top, macro.routeGames)}
        ${bar('Bottom side', macro.bottom, macro.routeGames)}
        ${!macro.routeGames ? '<p class="meta stage-note">Route samples are unavailable for this cohort.</p>' : ''}
      </section>
      <section><h3>Objective control</h3>
        ${bar('First drake', macro.firstDrake, macro.dragonGames, 'coral')}
        ${bar('Drake by 14:00', macro.drakeEarly, macro.objectiveGames, 'coral')}
        ${bar('Grubs by 14:00', macro.grubsEarly, macro.objectiveGames, 'coral')}
      </section>
      <section><h3>First recorded objective</h3>
        ${Object.entries(macro.timings).map(([kind, row]) => `<p class="finding"><strong>${kind}</strong> · ${row.n
          ? `median ${clockTime(row.median)} (range ${clockTime(row.earliest)}–${clockTime(row.latest)}). ${row.n}/${macro.games} games timed. ${escapeHtml(teamName(state.team))} took ${row.taken}/${row.n}.`
          : `No timed ${kind.toLowerCase()} in ${macro.games} games.`}</p>`).join('')}
      </section>
      <section><h3>Opponent wins by side</h3>
        ${SIDES.map(side => bar(capital(side), macro.sides[side].wins, macro.sides[side].n)).join('')}
        <p class="meta stage-note">${macro.sideGap === null ? 'Both sides need a result to compare win rates.' : `Blue minus red is ${signed(macro.sideGap)} in this cohort.`}</p>
      </section>
    </div></article>`;
}

function clockTime(seconds) {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function counterplan(cohort, ranks, stages, focus) {
  const pick = ranks.picks[0], ban = ranks.bans[0];
  const name = id => escapeHtml(champName(id));
  const followup = focus && followupResults(cohort, state.evidence, state.team, focus);
  const { banned, open } = followup || {};
  return `<article class="panel span">
    ${heading('Counter-draft plan', `${escapeHtml(teamName(state.team))} · ${cohort.length} filtered games across ${new Set(cohort.map(g => g.series)).size} series.`)}
    <div class="dashboard">
      <section><h3>What should we rehearse?</h3>
        <p class="finding">${pick?.hits ? `Prepare a matchup into <strong>${name(pick.id)}</strong>. The opponent fielded it in ${pick.hits}/${pick.n} games (${percent(pick.hits, pick.n)}).` : 'No matching pick in this sample.'}</p>
        <p class="finding">${ban?.hits ? `Prepare a second option if our plan needs <strong>${name(ban.id)}</strong>. The opponent banned it in ${ban.hits}/${ban.n} verified drafts (${percent(ban.hits, ban.n)}).` : `No matching ban across ${ranks.banGames} verified drafts.`}</p>
        ${focus ? `<p class="finding"><strong>Game 2 after a Game 1 ban on ${name(focus)}</strong><br>
          The opponent won ${banned.wins}/${banned.n} after the other side banned it and ${open.wins}/${open.n} when neither side banned it.
          ${banned.n && open.n ? `Observed difference ${signed(banned.wins / banned.n - open.wins / open.n)}. ${Math.min(banned.n, open.n) < 6 ? 'Fewer than six series in one group.' : 'Opponents, sides and lineups can differ.'}` : 'The paired series sample is too sparse for a win-rate difference.'}</p>` : ''}
      </section>
      <section><h3>What changes in Games 3–5?</h3>
        ${stages.slice(2).map(s => `<p class="finding"><strong>Game ${s.number}</strong> · ${s.games
          ? `Rehearse against ${name(s.leader)}, the most frequent pick (${s.leaderHits}/${s.games}, ${percent(s.leaderHits, s.games)}). ${focus ? `${name(focus)} was already locked in ${s.games - s.eligible}/${s.games} drafts.` : ''}`
          : 'No compatible games in scope.'}</p>`).join('')}
      </section>
    </div></article>`;
}

function timelineCard(cohort, fixedSeries = '') {
  const { data, team, evidence } = state;
  const series = [...new Set(cohort.filter(g => evidence.get(g.id).compatible).map(g => g.series))];
  const active = fixedSeries || (series.includes(state.series) ? state.series : series[0]);
  const rows = seriesTimeline(data.games, evidence, active, team);
  const name = id => escapeHtml(champName(id));
  const options = fixedSeries ? [] : series.map(id => {
    const first = data.games.find(g => g.series === id && g.number === 1);
    return [id, `${dateFormat.format(new Date(first.date))} · vs ${teamName(first[otherSide(teamSide(first, team))].team)} · ${id}`];
  });
  return `<article class="panel span">${heading('Series timeline', fixedSeries
    ? `Recorded drafts from series ${escapeHtml(fixedSeries)}. Scores are from ${escapeHtml(teamName(team))}’s side.`
    : 'Select a series from the filtered games to see its complete history. Scores are from the scouted team’s side.')}
    ${!fixedSeries && options.length ? select('series-history', 'Recorded series', options, active) : ''}
    ${rows.length ? `<ol class="timeline">${rows.map(({ game, side, wins, losses, locks, pair, previousPair, released }) => {
      const pairNames = pair.ids.map(name).join(' + ');
      const pairLabel = pair.lane ? 'Bottom / support' : 'Roster pair';
      const result = side === game.winner ? 'Win' : 'Loss';
      const taken = released?.find(p => p.takenBy === side) || released?.find(p => p.takenBy);
      const pivot = taken ? `${name(taken.id)} goes from a ban to a pick for ${escapeHtml(teamName(game[taken.takenBy].team))}`
        : `${previousPair ? 'Switch to' : 'Open with'} ${pairNames}`;
      return `<li><div><h3>Game ${game.number}</h3><small>${capital(side)} · ${result}<br>Series ${wins}–${losses}</small></div>
        <div><h3 class="pivot">${pivot}</h3><p><strong>${locks} prior picks locked</strong> · ${pairLabel}${taken ? `: ${pairNames}` : ''}</p>
        <p class="meta">${previousPair ? `The previous pair (${previousPair.ids.map(name).join(' + ')}) is locked.` : 'Opening draft. Both teams have the full pool.'}</p>
        ${game.number > 1 ? `<p>${released === null ? 'Ban comparison unavailable.' : released.length
          ? `Previous opponent bans now open · ${released.map(p => name(p.id) + (p.takenBy ? ` (picked by ${escapeHtml(teamName(game[p.takenBy].team))})` : ' (unpicked)')).join(', ')}.`
          : 'No previous opponent ban was available and unbanned by both sides.'}</p>` : ''}
        <details><summary>Five picks</summary>${game[side].picks.map(p => name(p.champion)).join(', ')}</details></div></li>`;
    }).join('')}</ol>` : '<p class="muted">No consecutive, repeat-free series in this cohort.</p>'}
  </article>`;
}

function evidenceTable(cohort) {
  return `<article class="panel span"><details><summary>Inspect latest ${Math.min(12, cohort.length)} game records</summary>
    <div class="table-wrap"><table><thead><tr><th>Date (UTC)</th><th>Patch</th><th>Game</th><th>Other team</th>
    <th>Result</th><th>Picks</th><th>Bans</th><th>Jungle</th></tr></thead><tbody>
    ${cohort.slice(0, 12).map(game => {
      const side = teamSide(game, state.team);
      const team = game[side];
      return `<tr><td>${dateFormat.format(new Date(game.date))}</td><td>${escapeHtml(game.patch)}</td>
        <td>${game.number}</td><td>${escapeHtml(teamName(game[otherSide(side)].team))}</td>
        <td>${game.winner === side ? 'Win' : 'Loss'}</td>
        <td>${team.picks.map(pick => escapeHtml(champName(pick.champion))).join(', ')}</td>
        <td>${team.bans?.map(id => escapeHtml(champName(id))).join(', ') ?? 'Unavailable'}</td>
        <td>${game.macro?.routes[side] ?? 'Unavailable'}</td></tr>`;
    }).join('')}</tbody></table></div></details></article>`;
}

function renderScout() {
  const { data, team, home, patch, player, focus, recent, catalog, evidence } = state;
  const cohort = scoutCohort(data.games, { team, patch, player, recent });
  const playerGames = scoutCohort(data.games, { team, patch, recent: 0 });
  const players = new Map(playerGames.flatMap(game => game[teamSide(game, team)].picks.map(pick => [pick.player, pick.playerName])));
  const chosenTendencies = tendencies(cohort, team, player, focus);
  const insight = scoutInsight(cohort, evidence, team, player, focus, catalog);
  const stages = fearlessStages(cohort, evidence, team, player, focus || insight?.champion);
  const homeOpeners = scoutCohort(data.games, { team: home, patch, recent }).filter(game => game.number === 1);
  const macro = macroSummary(cohort, team, player, focus);
  const seriesCount = new Set(cohort.map(game => game.series)).size;
  const rankedRows = (rows, variant) => rows.slice(0, 6).map(row => bar(champName(row.id), row.hits, row.n, variant)).join('');
  const teamOptions = [...data.teams].sort(sortName).map(item => [item.id, item.name]);
  return `<section class="hero">
    <div><p class="eyebrow">Opponent scouting</p><h1>Prepare for ${escapeHtml(teamName(team))}</h1>
      <p>Read the opening draft, track later-series pivots, and test your answer on the board.</p></div>
    <div class="action-row"><a class="button primary" href="#coach">Start coach rehearsal</a><a class="button" href="#draft">Open draft room</a></div>
  </section>
  <section class="filter-bar" aria-label="Scouting filters">
    ${select('scout-home', 'Your team', teamOptions.filter(([id]) => id !== team), home)}
    ${select('scout-team', 'Opponent', teamOptions.filter(([id]) => id !== home), team)}
    ${select('scout-patch', 'Patch', [['', 'All patches'], ...[...new Set(data.games.map(game => game.patch))]
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map(item => [item, item])], patch)}
    ${select('scout-player', 'Player', [['', 'All players'], ...[...players].sort((a, b) => a[1].localeCompare(b[1]))], player)}
    ${select('scout-champion', 'Champion', [['', 'All champions'], ...[...data.catalog].sort(sortName).map(champ => [champ.id, champ.name])], focus)}
    ${select('scout-window', 'Recency', [[0, 'All games'], [10, 'Last 10 games'], [25, 'Last 25 games'], [50, 'Last 50 games']], recent)}
  </section>
  <dl class="summary-grid">
    ${metric('Games in scope', cohort.length)}${metric('Series represented', seriesCount)}
    ${metric('Complete ban records', chosenTendencies.banGames, `/ ${cohort.length}`)}
    ${metric('Fearless-compatible games', stages.reduce((sum, stage) => sum + stage.games, 0), `/ ${cohort.length}`)}
  </dl>
  <div class="dashboard">
    ${insightCard(insight, homeOpeners)}
    ${counterplan(cohort, chosenTendencies, stages, focus || insight?.champion)}
    <article class="panel">${heading('Repeat picks', `${cohort.length} team-game opportunities${player ? ' with the player on the roster' : ''}.`)}
      ${rankedRows(chosenTendencies.picks) || '<p class="muted">No picks in this cohort.</p>'}
    </article>
    <article class="panel">${heading('Repeat bans', `${chosenTendencies.banGames} games with a complete ban record.`)}
      ${rankedRows(chosenTendencies.bans, 'coral') || '<p class="muted">No complete ban records for this cohort.</p>'}
    </article>
    ${stageCard(stages, focus || insight?.champion)}
    ${timelineCard(cohort)}
    ${macroCard(macro, focus)}
    ${cohort.length ? evidenceTable(cohort) : ''}
  </div>`;
}

function boardSide(side, moves, teams) {
  const bans = moves.filter(move => move.side === side && move.kind === 'ban');
  const picks = moves.filter(move => move.side === side && move.kind === 'pick');
  return `<section class="board-side ${side}">
    <h3>${escapeHtml(teamName(teams[side]))}<small>${capital(side)} side</small></h3>
    <p class="meta ban-label">Bans</p><div class="ban-list" aria-label="${capital(side)} bans">${Array.from({ length: 5 }, (_, index) => {
      const id = bans[index]?.champion;
      return `<span class="ban-slot ${id ? 'filled' : ''}"${id ? ` title="${escapeHtml(champName(id))}" aria-label="Banned ${escapeHtml(champName(id))}"` : ''}>${id ? escapeHtml(champName(id)) : '·'}</span>`;
    }).join('')}</div>
    <ol class="pick-list" aria-label="${capital(side)} picks">${Array.from({ length: 5 }, (_, index) => {
      const id = picks[index]?.champion;
      return `<li><span class="seat">${index + 1}</span><span class="${id ? 'filled' : 'empty'}">${id ? escapeHtml(champName(id)) : 'Open pick'}</span></li>`;
    }).join('')}</ol>
  </section>`;
}

function boardContext() {
  const { draft, game, home, team } = state;
  const homeSide = draft.homeSides[game];
  const teams = { [homeSide]: home, [otherSide(homeSide)]: team };
  const moves = draft.games[game];
  const locked = lockedBefore(draft, game);
  const active = game === draft.games.length - 1;
  return { teams, homeSide, moves, locked, active, turn: ORDER[moves.length] };
}

function estimateFor(ctx) {
  const { data, model, patch, game } = state;
  const key = JSON.stringify([ctx.teams, [...ctx.locked], patch, game, ctx.moves]);
  if (forecastCache?.key === key) return forecastCache;
  const weightMaps = preferences(data, { ...ctx.teams, patch, gameNumber: game + 1 });
  const compute = draftEstimator(data, model, ctx.teams, ctx.locked, weightMaps);
  forecastCache = { key, data, compute, base: compute(ctx.moves) };
  return forecastCache;
}

function forecastReadout(ctx) {
  const { game, catalog, choice, home, model } = state;
  const { homeSide } = ctx;
  const sample = estimateFor(ctx);
  const base = sample.base;
  const homeProbability = estimate => homeSide === 'blue' ? estimate.blue : 1 - estimate.blue;
  const selected = choice && ctx.active && ctx.turn && catalog.get(choice) && !availability(choice, ctx.moves, ctx.locked);
  const other = selected ? sample.compute([...ctx.moves, { champion: choice, side: ctx.turn[0], kind: ctx.turn[1] }]) : null;
  const comparison = compareForecast(base, other, homeSide);
  return `<h2>Draft win estimate</h2>
    <p class="description">${escapeHtml(teamName(home))} · Game ${game + 1}</p>
    ${base ? `<span class="forecast-number">${(100 * homeProbability(base)).toFixed(1)}%</span>
      <div class="forecast-track" aria-hidden="true"><span style="width:${100 * base.blue}%"></span><span></span></div>
      <div class="action-row spread meta"><span>Blue ${percent(base.blue, 1)}</span><span>Red ${percent(1 - base.blue, 1)}</span></div>`
      : '<p class="description">Estimate unavailable. The model needs 20 complete games, examples of both teams, and enough legal champions.</p>'}
    <dl class="kv"><dt>Training games</dt><dd>${model?.games ?? 0}</dd>
      <dt>Draft completions</dt><dd>${base?.draws ?? '—'}</dd>${model?.validation ? `<dt>Holdout Brier</dt><dd>${model.validation.model.toFixed(3)}</dd>` : ''}</dl>
    <div class="readout">
      <h3>${selected ? `${capital(ctx.turn[1])} ${escapeHtml(champName(choice))}` : 'Compare the next action'}</h3>
      ${comparison ? `<p class="description"><strong>${(100 * homeProbability(other)).toFixed(1)}%</strong> · ${signed(comparison.delta)} from current estimate</p>
        <p class="meta">Monte Carlo standard error ${(100 * comparison.simulationNoise).toFixed(1)} pp. Scenario delta under the model.</p>`
        : `<p class="description">${selected ? 'This move is legal. The forecast needs more evidence.' : ctx.turn && ctx.active
          ? 'Select an available champion to preview a pick or ban.' : 'This board has no pending action.'}</p>`}
      ${selected ? (state === rehearsal
        ? '<button class="button primary" type="button" data-action="coach-confirm">Confirm ban and review insights</button>'
        : `<button class="button primary" type="button" data-action="apply">Confirm ${ctx.turn[1]}</button>`) : ''}
    </div>`;
}

function choiceRows(ctx) {
  const search = state.search.trim().toLowerCase();
  const available = [...state.data.catalog].sort(sortName).filter(champ =>
    (!search || champ.name.toLowerCase().includes(search)) && (!state.poolRole || state.poolRole === champ.role));
  const rows = available.flatMap(champ => {
    const reason = availability(champ.id, ctx.moves, ctx.locked);
    if (state.poolStatus === 'available' && reason || state.poolStatus === 'blocked' && !reason) return [];
    const selected = state.choice === champ.id;
    return [`<button type="button" class="champion${selected ? ' selected' : ''}" data-action="preview" data-champion="${escapeHtml(champ.id)}"
      aria-pressed="${selected}"${reason ? ' disabled' : ''}>${escapeHtml(champ.name)}<small>${escapeHtml(reason || champ.role || 'Role unclassified')}</small></button>`];
  });
  return rows.join('') || '<p class="meta empty-pool">No champions match these filters.</p>';
}

function renderDraft() {
  const { draft, game, data, search, poolRole, poolStatus } = state;
  const ctx = boardContext();
  const { teams, homeSide, moves, turn, active, locked } = ctx;
  return `<section class="hero-small">
    <div><p class="eyebrow">Series planning</p><h1>Fearless draft room</h1>
    <p>Build a best-of-series draft and compare the next move before committing.</p></div>
    ${data.source === 'demo' ? '<button type="button" class="button" data-action="practice">Load Game 5 scenario</button>' : ''}
  </section>
  <div class="draft-controls">
    ${select('draft-format', 'Series format', [[3, 'Best of 3'], [5, 'Best of 5']].filter(([n]) => n >= draft.games.length), draft.bestOf)}
    ${active ? select('draft-side', 'Your side', [['blue', 'Blue'], ['red', 'Red']], homeSide)
      : `<span class="meta">Your side · ${capital(homeSide)}</span>`}
    <button type="button" class="button" data-action="reset">Reset series</button>
    <a class="button" href="#scout">Scouting filters</a>
  </div>
  <div class="game-tabs" role="group" aria-label="Series game">
    ${draft.games.map((_, index) => `<button type="button" class="button ${game === index ? 'active' : ''}" aria-pressed="${game === index}"
      data-action="view-game" data-game="${index}">Game ${index + 1}</button>`).join('')}
    ${active && !turn && draft.games.length < draft.bestOf ? '<button type="button" class="button primary" data-action="next">Start next game</button>' : ''}
  </div>
  <div class="draft-layout">
    <div class="draft-main">
      <article class="panel">
        <div class="panel-heading"><div><h2>Game ${game + 1} board</h2>
          <p class="turn">${turn ? `${escapeHtml(teamName(teams[turn[0]]))} to ${turn[1]} · ${phase(moves.length)}` : 'Draft complete'}</p>
          </div>${active ? `<button type="button" class="button" data-action="undo"${moves.length ? '' : ' disabled'}>Undo last</button>` : '<span class="meta">Completed board</span>'}
        </div>
        <div class="board-sides">${SIDES.map(side => boardSide(side, moves, teams)).join('')}</div>
        <div class="progress" aria-label="${moves.length} of 20 actions complete">${ORDER.map((_, index) =>
          `<span class="${index < moves.length ? 'done' : index === moves.length ? 'current' : ''}"></span>`).join('')}</div>
      </article>
      ${turn && active ? `<article class="panel">
        <h2>Champion pool</h2>
        <div class="pool-filters">
          <label for="pool-search"><span>Search</span><input type="search" id="pool-search" placeholder="Champion name" value="${escapeHtml(search)}"></label>
          ${select('pool-role', 'Role', [['', 'All roles'], ...ROLES.map(role => [role, role])], poolRole)}
          ${select('pool-status', 'Status', [['available', 'Available'], ['all', 'All champions'], ['blocked', 'Unavailable']], poolStatus)}
        </div>
        <div id="pool-choices" class="pool-choices">${choiceRows(ctx)}</div>
      </article>` : ''}
    </div>
    <div class="draft-side">
      <article class="panel forecast-panel" id="forecast" aria-live="polite">${forecastReadout(ctx)}</article>
      <article class="panel"><h2>Series lockout</h2>
        <p class="description"><strong>${locked.size}</strong> prior picks locked · <strong>${data.catalog.length - locked.size}</strong> start-of-game options</p>
        <p class="meta">Picks from both sides carry over. Current bans expire after this game.</p>
        ${locked.size ? `<details class="section-gap"><summary>Show locked champions</summary>
          <div class="lock-list">${[...locked].map(champName).sort().map(name => `<span class="chip">${escapeHtml(name)}</span>`).join('')}</div>
          </details>` : ''}
      </article>
    </div>
  </div>`;
}

function methodPage() {
  const { model, data } = state;
  const v = model?.validation;
  return `<div class="text-page">
    <header class="hero-small"><div><p class="eyebrow">Evidence</p><h1>Method &amp; data</h1></div></header>
    <article class="panel"><h2>Data source</h2>
      <p>${data.source === 'demo' ? 'The demo uses deterministic, fictional teams, champions, events and outcomes. It illustrates the workflow.' : 'This dataset was loaded from a local GRID extract. The app reads the selected file in this tab. Refreshing returns to the built-in demo.'}</p>
      <p>Use <strong>Import local data</strong> to open a scouting.grid.json created by the optional command-line importer. See the repository for installation and data terms.</p>
    </article>
    <article class="panel"><h2>Pick, ban and macro evidence</h2>
      <p>Pick rates use filtered team games. Ban rates use games with complete ban records. Champion filtering narrows rows and conditions macro on that pick. Missing telemetry reduces the denominator.</p>
      <p>Fearless comparisons use complete, consecutive series without repeat picks on either side. This is compatibility inferred from the recorded drafts. Prior picks remove champions from later eligibility denominators.</p>
      <p>The route marker describes a classified top or bottom jungle position from 2:30 to 3:40. The first-drake denominator is games with a timed drake. The 14-minute metrics use games with any recognized timed objective.</p>
      <p>First drake and Herald timings use the earliest recorded take per game by either side. Side splits use all scoped results. The Game 2 comparison pairs consecutive games in the same series with verified Game 1 bans. Differences between those groups can reflect the teams they faced.</p>
    </article>
    <article class="panel"><h2>Probability and validation</h2>
      <p>A regularized logistic model scores blue side from team and champion coefficients. The simulator completes the legal board using recent pick and ban histories weighted by team, patch and game stage. Unseen candidates have prior weight. Draft scenarios use the same random seeds.</p>
      ${v ? `<dl class="kv"><dt>Earlier training sample</dt><dd>${v.trainGames} games · ${v.trainSeries} series</dd>
        <dt>Later holdout from ${v.from}</dt><dd>${v.testGames} games · ${v.testSeries} series</dd>
        <dt>Draft model Brier score</dt><dd>${v.model.toFixed(3)}</dd><dt>Side + team baseline Brier</dt><dd>${v.baseline.toFixed(3)}</dd></dl>
      <p>Lower Brier scores are better. This check evaluates completed historical drafts. Data supplied to this app is then refit for live estimates.</p>`
      : '<p>A chronological holdout requires at least five complete series.</p>'}
      <p>Historical win splits describe associations. Predicted scenario differences depend on the model and the completion distribution.</p>
    </article>
  </div>`;
}

const steps = ['Scouting', 'Draft', 'Forecast', 'Insights'];

function renderCoach() {
  const { data, team, home, catalog, series, step, evidence } = state;
  const cohort = scoutCohort(data.games, { team });
  const ctx = boardContext();
  const opener = data.games.find(game => game.series === series && game.number === 1);
  const labels = ['Rehearse the opening draft', 'Compare this ban'];
  const target = step === 3 ? state.draft.games[0][0].champion : state.choice;
  let content;
  if (step === 0) {
    const insight = scoutInsight(cohort, evidence, team, '', '', catalog);
    content = insightCard(insight, data.games.filter(g => g.number === 1 && teamSide(g, home)), false);
  } else if (step === 1) {
    content = `<article class="panel"><h2>Choose the first blue-side ban</h2>
      <p class="description">Mirehorn is the opening recommendation. Choose a different champion to compare another plan.</p>
      <div class="section-gap">${select('coach-choice', 'Proposed ban', [...catalog.values()].sort(sortName).map(c => [c.id, c.name]), state.choice)}</div>
      <div class="board-sides section-gap">${SIDES.map(side => boardSide(side, ctx.moves, ctx.teams)).join('')}</div></article>`;
  } else if (step === 2) {
    content = `<article class="panel forecast-panel">${forecastReadout(ctx)}</article>`;
  } else {
    content = `<div class="dashboard">${counterplan(cohort, tendencies(cohort, team, '', ''),
      fearlessStages(cohort, evidence, team, '', target), target)}${timelineCard(cohort, series)}</div>`;
  }
  const notes = [
    'Review Breakwater’s opening pick and route across the full fictional history, including this series. Decide which ban to test.',
    'Rehearse Game 1 as Northstar. The board starts before the first ban.',
    'Compare the current board with the proposed ban. Both estimates use the same 120 legal completion draws.',
    `You banned ${escapeHtml(champName(target))} in the rehearsal. Compare that decision with the historical cohort, then follow the recorded series through Game 5.`
  ];
  return `<div class="coach-flow"><header class="hero-small"><div><h1>Coach rehearsal</h1>
    <p>Northstar vs Breakwater · ${dateFormat.format(new Date(opener.date))} · original five-game series</p></div>
    <a class="button" href="#scout">Exit rehearsal</a></header>
    <ol class="coach-steps" aria-label="Rehearsal progress">${steps.map((name, i) =>
      `<li${i === step ? ' aria-current="step"' : ''}>${i + 1}. ${name}</li>`).join('')}</ol>
    <section aria-labelledby="coach-heading"><h2 tabindex="-1" id="coach-heading">${steps[step]}</h2><p class="muted">${notes[step]}</p></section>
    ${content}<div class="action-row">${step ? '<button class="button" data-action="coach-back">Previous step</button>' : ''}
    ${step < 2 ? `<button class="button primary" data-action="coach-next">${labels[step]}</button>` : ''}
    ${step === 3 ? '<a class="button primary" href="#scout">Finish rehearsal</a>' : ''}</div></div>`;
}

function refresh(focusId = '') {
  const view = viewName();
  if (view === 'coach') {
    if (!rehearsal) showNotice('');
    rehearsal ??= Object.assign(makeState(publishedDemo, false), startRehearsal(publishedDemo));
    state = rehearsal;
  } else {
    state = workspaceState;
    rehearsal = null;
  }
  // A private import and the original demo may use overlapping IDs.
  if (forecastCache && forecastCache.data !== state.data) forecastCache = null;
  document.querySelector('#view-label').textContent = views[view];
  document.querySelector('#header-match').textContent = `${teamName(state.home)} vs ${teamName(state.team)}`;
  document.querySelector('#source-label').textContent = state.data.source === 'demo' ? 'Original demo data' : 'Local GRID import';
  document.querySelector('#demo-trigger').hidden = state.data.source === 'demo';
  for (const link of document.querySelectorAll('[data-view]')) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  main.innerHTML = view === 'coach' ? renderCoach() : view === 'draft' ? renderDraft() : view === 'method' ? methodPage() : renderScout();
  if (focusId) document.getElementById(focusId)?.focus();
}

function updatePool() {
  const pool = document.querySelector('#pool-choices');
  if (pool) pool.innerHTML = choiceRows(boardContext());
}

function testInsight(champion) {
  const ctx = boardContext();
  const canTest = state.game === 0 && ctx.active && ctx.turn?.[1] === 'ban' &&
    ctx.turn[0] === ctx.homeSide && !availability(champion, ctx.moves, ctx.locked);
  state.choice = canTest ? champion : '';
  state.search = canTest ? champName(champion) : '';
  state.poolRole = '';
  state.poolStatus = 'available';
  showNotice(canTest ? 'The proposed Game 1 ban is ready to compare.'
    : 'This board is past the suggested Game 1 ban window. Reset the series to try the opener.');
  if (viewName() === 'draft') refresh();
  else location.hash = 'draft';
}

function practice() {
  let draft = newDraft(5);
  const ids = state.data.catalog.map(champ => champ.id);
  for (let index = 0; index < 4; index++) {
    for (let step = 0; step < ORDER.length; step++) {
      const [side, kind] = ORDER[step];
      const locked = lockedBefore(draft, index);
      const moves = draft.games[index];
      const reserved = !index && step <= 6;
      const champion = !index && step === 6 ? 'demo-1-0' : ids.find((id, position) =>
        (position + index + step + (side === 'blue' ? 1 : 0) + (kind === 'ban' ? 3 : 0)) % 4 !== 0
        && (!reserved || id !== 'demo-1-0') && !availability(id, moves, locked));
      draft = addAction(draft, champion, state.catalog);
    }
    draft = nextGame(draft);
  }
  return draft;
}

main.addEventListener('input', event => {
  if (event.target.id !== 'pool-search') return;
  state.search = event.target.value;
  updatePool();
});

main.addEventListener('change', event => {
  const { id, value } = event.target;
  const fields = {
    'scout-home': 'home', 'scout-team': 'team', 'scout-patch': 'patch', 'scout-player': 'player',
    'scout-champion': 'focus', 'scout-window': 'recent',
    'pool-role': 'poolRole', 'pool-status': 'poolStatus', 'series-history': 'series', 'coach-choice': 'choice'
  };
  if (fields[id]) {
    state[fields[id]] = id === 'scout-window' ? Number(value) : value;
    if (id === 'scout-team' || id === 'scout-patch') state.player = '';
    if (id === 'pool-role' || id === 'pool-status') updatePool();
    else refresh(id);
  } else if (id === 'draft-format' || id === 'draft-side') {
    state.draft = id === 'draft-side' ? setHomeSide(state.draft, value) : { ...state.draft, bestOf: Number(value) };
    saveDraft();
    refresh(id);
  }
});

main.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, champion, game } = button.dataset;
  try {
    if (state === rehearsal && action.startsWith('coach-')) {
      if (action === 'coach-confirm' && state.step === 2) {
        state.draft = addAction(state.draft, state.choice, state.catalog);
        state.step++;
      } else if (action === 'coach-back' && state.step > 0) {
        if (state.step === 3) state.draft = undoAction(state.draft);
        state.step--;
      } else if (action === 'coach-next' && state.step < 2) state.step++;
      refresh('coach-heading');
      return;
    }
    if (action === 'test-insight') return testInsight(champion);
    if (action === 'preview') {
      state.choice = champion;
      const ctx = boardContext();
      for (const item of document.querySelectorAll('.champion.selected')) {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      }
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
      document.querySelector('#forecast').innerHTML = forecastReadout(ctx);
      return;
    }
    if (action === 'view-game') state.game = Number(game);
    else if (action === 'undo') state.draft = undoAction(state.draft);
    else if (action === 'apply') {
      state.draft = addAction(state.draft, state.choice, state.catalog);
      state.search = '';
    } else if (action === 'next') {
      state.draft = nextGame(state.draft);
      state.game++;
      state.search = '';
    } else if (action === 'practice' || action === 'reset') {
      if ((state.draft.games.length > 1 || state.draft.games[0].length) &&
        !window.confirm(action === 'practice' ? 'Replace this series with the Game 5 scenario?' : 'Reset all games in this series?')) return;
      state.draft = action === 'practice' ? practice() : newDraft(state.draft.bestOf);
      state.game = state.draft.games.length - 1;
      state.search = '';
      state.poolRole = '';
      state.poolStatus = 'available';
    }
    state.choice = '';
    saveDraft();
    showNotice('');
    refresh();
    const target = action === 'apply' || action === 'next' ? '#pool-search' : `[data-action="${action}"]${game ? `[data-game="${game}"]` : ''}`;
    (main.querySelector(target) || main.querySelector('.game-tabs .active'))?.focus();
  } catch (error) {
    showNotice(error.message);
  }
});

document.querySelector('#import-trigger').addEventListener('click', () => fileInput.click());
document.querySelector('#demo-trigger').addEventListener('click', () => {
  install(publishedDemo);
  showNotice('Original demo data loaded.');
  refresh();
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    if (file.size > 50 * 1024 ** 2) throw new Error('Choose a local extract smaller than 50 MB.');
    const data = JSON.parse(await file.text());
    if (data?.source !== 'grid') throw new Error('Choose the private scouting.grid.json generated by the importer.');
    install(data);
    showNotice(`Local data loaded · ${data.games.length} games. The file stays in this tab.`);
    if (viewName() === 'coach') location.hash = 'scout';
    refresh();
  } catch (error) {
    showNotice(`Could not load local data. ${error.message}`);
  }
});
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});

addEventListener('hashchange', () => {
  refresh();
  window.scrollTo(0, 0);
  if (location.hash) main.focus({ preventScroll: true });
});

install(publishedDemo);
refresh();

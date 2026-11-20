export const ORDER = [
  ['blue', 'ban'], ['red', 'ban'], ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'pick'], ['red', 'pick'], ['red', 'pick'], ['blue', 'pick'],
  ['blue', 'pick'], ['red', 'pick'],
  ['red', 'ban'], ['blue', 'ban'], ['red', 'ban'], ['blue', 'ban'],
  ['red', 'pick'], ['blue', 'pick'], ['blue', 'pick'], ['red', 'pick']
];

export const ROLES = ['Top', 'Jungle', 'Mid', 'Bottom', 'Support'];

export function newDraft(bestOf = 5) {
  if (![3, 5].includes(bestOf)) throw new Error('Choose a best of three or five.');
  return { bestOf, games: [[]], homeSides: ['blue'] };
}

export function lockedBefore(draft, index) {
  return new Set(draft.games.slice(0, index).flatMap(game =>
    game.filter(action => action.kind === 'pick').map(action => action.champion)));
}

export function availability(champion, moves, locked) {
  if (locked.has(champion)) return 'Fearless lock';
  const action = moves.find(move => move.champion === champion);
  return action ? (action.kind === 'pick' ? 'Picked' : 'Banned') : '';
}

export function addAction(draft, champion, catalog) {
  const index = draft.games.length - 1;
  const moves = draft.games[index];
  const turn = ORDER[moves.length];
  if (!turn) throw new Error('This draft is complete.');
  if (!catalog.has(champion)) throw new Error('Choose a champion from the pool.');
  const reason = availability(champion, moves, lockedBefore(draft, index));
  if (reason) throw new Error(reason);
  const [side, kind] = turn;
  return { ...draft, games: [...draft.games.slice(0, index), [...moves, { side, kind, champion }]] };
}

export function undoAction(draft) {
  return { ...draft, games: [...draft.games.slice(0, -1), draft.games.at(-1).slice(0, -1)] };
}

export function setHomeSide(draft, side) {
  if (!['blue', 'red'].includes(side)) throw new Error('Choose blue or red side.');
  return { ...draft, homeSides: [...draft.homeSides.slice(0, -1), side] };
}

export function nextGame(draft) {
  if (draft.games.at(-1).length !== ORDER.length) throw new Error('Complete the current draft first.');
  if (draft.games.length >= draft.bestOf) throw new Error('This is the last scheduled game.');
  return { ...draft, games: [...draft.games, []], homeSides: [...draft.homeSides, draft.homeSides.at(-1)] };
}

export function restoreDraft(raw, catalog) {
  if (!Array.isArray(raw?.games) || !raw.games.length) return newDraft();
  let draft = newDraft(raw.bestOf);
  for (const [index, moves] of raw.games.entries()) {
    if (index) draft = nextGame(draft);
    if (raw.homeSides?.[index]) draft = setHomeSide(draft, raw.homeSides[index]);
    for (const move of moves) {
      draft = addAction(draft, move.champion, catalog);
    }
  }
  return draft;
}

export function phase(index) {
  if (index < 6) return 'First bans';
  if (index < 12) return 'First picks';
  if (index < 16) return 'Second bans';
  if (index < 20) return 'Final picks';
  return 'Draft complete';
}

export function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

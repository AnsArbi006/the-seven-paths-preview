export const MAX_TP = 7;
export const MAX_HP = 100;
export const BASE_CASTLE_HITS = 3;

// Coordinates are percentages of the illustrated map. The graph, not pixel proximity,
// determines travel cost and enemy movement.
export const FIELDS = [
  { id: 'castle', name: 'Königsburg', x: 31, y: 21, type: 'castle', neighbors: ['meadow'] },
  { id: 'meadow', name: 'Wiesenweg', x: 28, y: 40, type: 'meadow', neighbors: ['castle', 'crossroads'] },
  { id: 'crossroads', name: 'Wegkreuz', x: 45, y: 47, type: 'crossroads', neighbors: ['meadow', 'forest', 'quarry'] },
  { id: 'forest', name: 'Nebelwald', x: 57, y: 35, type: 'forest', neighbors: ['crossroads', 'marsh', 'river'] },
  { id: 'marsh', name: 'Altmarsch', x: 78, y: 39, type: 'marsh', neighbors: ['forest', 'watchtower', 'river'] },
  { id: 'quarry', name: 'Steinbruch', x: 45, y: 68, type: 'quarry', neighbors: ['crossroads', 'river'] },
  { id: 'river', name: 'Flussufer', x: 63, y: 65, type: 'river', neighbors: ['quarry', 'forest', 'marsh'] },
  { id: 'watchtower', name: 'Verfallener Wachturm', x: 93, y: 17, type: 'watchtower', neighbors: ['marsh'] }
];

export const FIELD_BY_ID = Object.fromEntries(FIELDS.map(field => [field.id, field]));
export const HORDE_ROUTE = ['watchtower', 'marsh', 'forest', 'crossroads', 'meadow', 'castle'];

export function initialState() {
  return {
    phase: 'explore', day: 1, field: 'castle', tp: MAX_TP, hp: MAX_HP,
    arrows: 12, gold: 4, shields: 0, castleHits: 0, hordeIndex: 0,
    questItem: false, questItemOnGround: true, questItemField: 'river', forestEnemyAlive: true,
    bossAlive: true, lastCombat: null, result: null, message: '',
    claimed: {}, marker: { x: FIELD_BY_ID.castle.x, y: FIELD_BY_ID.castle.y }
  };
}

export function travel(state, destination) {
  if (state.phase !== 'explore') return { ok: false, reason: 'Die Welt wartet auf das Kampfende.' };
  if (!FIELD_BY_ID[destination]) return { ok: false, reason: 'Unbekanntes Feld.' };
  if (!FIELD_BY_ID[state.field].neighbors.includes(destination)) return { ok: false, reason: 'Nur benachbarte Felder sind erreichbar.' };
  if (state.tp < 1) return { ok: false, reason: 'Keine Reisepunkte mehr. Schlafe in einem gegnerfreien Feld.' };
  state.field = destination;
  state.tp -= 1;
  state.marker = { x: FIELD_BY_ID[destination].x, y: FIELD_BY_ID[destination].y };
  return { ok: true };
}

export function canSleep(state) {
  if (state.phase !== 'explore') return 'Jetzt ist kein Tageswechsel möglich.';
  if (state.field === 'forest' && state.forestEnemyAlive) return 'Im Nebelwald lauert noch ein Gegner.';
  if (state.field === 'watchtower' && state.bossAlive) return 'Am Wachturm lauert noch der Wächter.';
  if (HORDE_ROUTE[state.hordeIndex] === state.field && state.hordeIndex > 0) return 'Die Horde besetzt dieses Feld.';
  return null;
}

export function sleep(state) {
  const reason = canSleep(state);
  if (reason) return { ok: false, reason };
  const sleepingField = state.field;
  const nextHordeIndex = Math.min(state.hordeIndex + 1, HORDE_ROUTE.length - 1);
  state.hordeIndex = nextHordeIndex;
  let morningDamage = 0;
  if (HORDE_ROUTE[nextHordeIndex] === 'castle') {
    state.castleHits += 1;
    state.hordeIndex = 0;
  } else if (HORDE_ROUTE[nextHordeIndex] === sleepingField) {
    morningDamage = nextHordeIndex < 2 ? 18 : 12;
    state.hp = Math.max(0, state.hp - morningDamage);
  }
  if (state.hp === 0) {
    dropOnDeath(state);
    state.field = 'castle';
    state.marker = { x: FIELD_BY_ID.castle.x, y: FIELD_BY_ID.castle.y };
    state.hp = MAX_HP;
  }
  state.day += 1;
  state.tp = MAX_TP;
  state.claimed = {};
  if (state.castleHits >= BASE_CASTLE_HITS + state.shields) {
    state.phase = 'loss';
    state.result = 'Die Königsburg ist gefallen.';
  }
  return { ok: true, morningDamage };
}

export function dropOnDeath(state) {
  if (state.questItem) {
    state.questItem = false;
    state.questItemOnGround = true;
    state.questItemField = state.field;
  }
}

export function buy(state, kind) {
  if (state.phase !== 'explore' || state.field !== 'castle') return { ok: false, reason: 'Der Laden ist nur in der Burg erreichbar.' };
  const price = kind === 'shield' ? 3 : kind === 'arrows' ? 2 : Infinity;
  if (state.gold < price) return { ok: false, reason: 'Dafür fehlt Gold.' };
  state.gold -= price;
  if (kind === 'shield') state.shields += 1;
  if (kind === 'arrows') state.arrows += 8;
  return { ok: true };
}

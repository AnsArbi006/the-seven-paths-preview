import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, travel, canSleep, sleep, buy, HORDE_ROUTE, BASE_CASTLE_HITS } from './rules.js';

test('travel spends exactly one TP only across graph edges', () => {
  const s = initialState();
  assert.equal(travel(s, 'forest').ok, false);
  assert.equal(travel(s, 'meadow').ok, true);
  assert.equal(s.tp, 6);
  assert.equal(travel(s, 'castle').ok, true);
  assert.equal(s.tp, 5);
  s.tp = 0;
  assert.equal(travel(s, 'meadow').ok, false);
});

test('night advances horde, resets TP and applies morning damage in sleeping field', () => {
  const s = initialState();
  s.field = 'marsh'; s.hordeIndex = 0; s.tp = 2;
  assert.equal(sleep(s).morningDamage, 18);
  assert.equal(s.day, 2); assert.equal(s.tp, 7); assert.equal(s.hp, 82);
  assert.equal(HORDE_ROUTE[s.hordeIndex], 'marsh');
  assert.ok(canSleep(s));
});

test('castle damage persists and purchased shields raise loss threshold', () => {
  const s = initialState();
  assert.equal(buy(s, 'shield').ok, true);
  assert.equal(s.gold, 1);
  assert.equal(s.shields, 1);
  for (let i = 0; i < BASE_CASTLE_HITS + 1; i++) {
    s.hordeIndex = HORDE_ROUTE.length - 2;
    sleep(s);
  }
  assert.equal(s.castleHits, 4);
  assert.equal(s.phase, 'loss');
});

test('enemy-occupied forest cannot be used for sleep', () => {
  const s = initialState(); s.field = 'forest';
  assert.ok(canSleep(s));
  s.forestEnemyAlive = false;
  assert.equal(canSleep(s), null);
});

test('story item stays at the field of death and boss prevents sleep', async () => {
  const { dropOnDeath } = await import('./rules.js');
  const s = initialState(); s.field = 'watchtower'; s.questItem = true;
  assert.ok(canSleep(s));
  dropOnDeath(s);
  assert.equal(s.questItemField, 'watchtower');
  assert.equal(s.questItemOnGround, true);
});

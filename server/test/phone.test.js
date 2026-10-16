import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePhone } from '../src/phone.js';
import { createGameEngine, audienceState } from '../src/game-engine.js';
import { createHub } from '../src/hub.js';
import { createContactStore } from '../src/contact-store.js';

test('Nigerian numbers in every common style become one standard form', () => {
  for (const input of ['08031234567', '0803 123 4567', '0803-123-4567', '+234 803 123 4567', '+2348031234567', '2348031234567', '8031234567', '(0803) 123 4567', '+234 0803 123 4567', '00234 803 123 4567']) {
    assert.deepEqual(normalizePhone(input), { ok: true, phone: '+2348031234567' }, input);
  }
  assert.equal(normalizePhone('0701 234 5678').phone, '+2347012345678');
  assert.equal(normalizePhone('0901 234 5678').phone, '+2349012345678');
});

test('other countries work in international form', () => {
  assert.equal(normalizePhone('+44 7911 123456').phone, '+447911123456');
  assert.equal(normalizePhone('+1 (415) 555-2671').phone, '+14155552671');
});

test('rejects things that are not phone numbers', () => {
  for (const input of ['abc', '12345', '0803 123', '08031234567890', '+234 803 123', '0603 123 4567', '+0 123456789', '080-3123-4567 ext 5', '<script>', '+', '++2348031234567']) {
    const r = normalizePhone(input);
    assert.equal(r.ok, false, input);
    assert.match(r.error, /valid mobile number/);
  }
  assert.equal(normalizePhone('   ').empty, true);
  assert.equal(normalizePhone(null).empty, true);
});

function game(phoneMode) {
  const engine = createGameEngine({ phoneMode });
  const c = engine.createSession();
  return { engine, c, join: (nickname, phone, id = nickname) => engine.joinSession({ pin: c.pin, nickname, phone, socketId: id }) };
}

test('required: a number is needed, bad ones are refused, and one phone cannot join twice', () => {
  const g = game('required');
  assert.match(g.join('Ada', '').error, /Enter your phone number/);
  assert.match(g.join('Ada', '123').error, /valid mobile number/);
  assert.equal(g.join('Ada', '0803 123 4567').ok, true);
  assert.match(g.join('Bola', '+234 803 123 4567').error, /already joined this game/);
  assert.equal(g.join('Bola', '0805 123 4567').ok, true);
});

test('optional: can be left blank, but a number that is given must be valid', () => {
  const g = game('optional');
  assert.equal(g.join('Ada', '').ok, true);
  assert.equal(g.join('Bola', 'nope').ok, false);
  assert.equal(g.join('Chi', '08051234567').ok, true);
});

test('off: nothing is asked or stored, even if a client sends one', () => {
  const g = game('off');
  const r = g.join('Ada', '08031234567');
  assert.equal(r.ok, true);
  assert.equal(r.contact, null);
});

test('phone numbers never appear in any state sent to players, screens or the host list', () => {
  const g = game('required');
  const joined = g.join('Ada', '08031234567');
  g.join('Bola', '08051234567');
  g.engine.startGame({ pin: g.c.pin, hostToken: g.c.hostToken });
  const full = g.engine.getPublicState(g.c.pin);
  for (const who of ['host', 'screen', 'player']) {
    const text = JSON.stringify(audienceState(full, who));
    assert.equal(/803|805|2348/.test(text), false, `${who} state contains a phone number`);
  }
  assert.equal(full.contactCount, 2);
  assert.equal(JSON.stringify(joined.player).includes('803'), false, 'the join reply to the player has no number');
  assert.equal(JSON.stringify(g.engine.getPlayerMe(g.c.pin, joined.player.id)).includes('803'), false);
});

test('only the host token can export contacts, with scores and ranks', () => {
  const g = game('required');
  const a = g.join('Ada', '08031234567'); g.join('Bola', '08051234567');
  g.engine.startGame({ pin: g.c.pin, hostToken: g.c.hostToken });
  g.engine.submitAnswer({ pin: g.c.pin, playerId: a.player.id, socketId: 'Ada', answerIndex: 1 });
  g.engine.revealAnswer({ pin: g.c.pin, hostToken: g.c.hostToken });
  assert.equal(g.engine.exportContacts({ pin: g.c.pin, hostToken: 'wrong' }).ok, false);
  const out = g.engine.exportContacts({ pin: g.c.pin, hostToken: g.c.hostToken });
  assert.deepEqual(out.rows.map((r) => [r.nickname, r.phone, r.rank]), [['Ada', '+2348031234567', 1], ['Bola', '+2348051234567', 2]]);
  assert.ok(out.rows[0].score > 0);
});

function hubEnv(store) {
  const log = [];
  const socket = (id) => ({ id, join() {}, emit: (ev, d) => log.push([id, ev, d]) });
  const hub = createHub({ engine: createGameEngine({ phoneMode: 'required' }), broadcast() {}, sendTo() {}, contactStore: store, stateIntervalMs: 0 });
  return { hub, socket, log, last: (id, ev) => [...log].reverse().find(([i, e]) => i === id && e === ev)?.[2] };
}

test('a number is saved the moment the player joins, and the storage log never contains it', async () => {
  const saved = [];
  const e = hubEnv({ save: async (c) => saved.push(c) });
  const host = e.socket('h'); e.hub.handle(host, 'host:create', {});
  const created = e.last('h', 'host:created');
  const p = e.socket('p'); e.hub.handle(p, 'player:join', { pin: created.pin, nickname: 'Ada', phone: '0803 123 4567' });
  await new Promise((r) => setImmediate(r));
  assert.equal(saved.length, 1);
  assert.deepEqual([saved[0].nickname, saved[0].phone, saved[0].pin], ['Ada', '+2348031234567', created.pin]);
  assert.equal(JSON.stringify(e.log.filter(([id]) => id === 'p')).includes('803'), false, 'nothing sent to the player contains the number');
});

test('a storage failure never blocks joining and does not leak the number into logs', async () => {
  const errors = [];
  const original = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    const e = hubEnv({ save: async () => { const err = new Error('disk full: +2348031234567'); err.code = 'ENOSPC'; throw err; } });
    const host = e.socket('h'); e.hub.handle(host, 'host:create', {});
    const created = e.last('h', 'host:created');
    const p = e.socket('p'); e.hub.handle(p, 'player:join', { pin: created.pin, nickname: 'Ada', phone: '0803 123 4567' });
    await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    assert.ok(e.last('p', 'player:joined'), 'the player still joined');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].includes('803'), false);
  } finally { console.error = original; }
});

test('host:contacts needs the host token and returns a CSV', () => {
  const e = hubEnv(null);
  const host = e.socket('h'); e.hub.handle(host, 'host:create', {});
  const created = e.last('h', 'host:created');
  const p = e.socket('p'); e.hub.handle(p, 'player:join', { pin: created.pin, nickname: 'Ada', phone: '08031234567' });
  e.hub.handle(p, 'host:contacts', { pin: created.pin, hostToken: 'guess' });
  assert.equal(e.last('p', 'app:error').message, 'Host authorization failed.');
  assert.equal(e.last('p', 'host:contacts'), undefined);
  e.hub.handle(host, 'host:contacts', { pin: created.pin, hostToken: created.hostToken });
  const out = e.last('h', 'host:contacts');
  assert.equal(out.count, 1);
  assert.match(out.csv, /nickname,phone,score,rank,joined_at\r\nAda,\+2348031234567,0,1,/);
  assert.match(out.filename, /^contacts-.*-\d{6}\.csv$/);
});

test('the contact file is private, appends one line per contact, and survives a bad line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contacts-'));
  const store = createContactStore({ dir: path.join(dir, 'nested') });
  assert.deepEqual(await store.list(), [], 'no file yet is fine');
  await store.save({ pin: '111111', nickname: 'Ada', phone: '+2348031234567' });
  await store.save({ pin: '111111', nickname: 'Bola', phone: '+2348051234567' });
  fs.appendFileSync(store.file, '{this line is damaged\n');
  await store.save({ pin: '222222', nickname: 'Chi', phone: '+2347011234567' });
  const all = await store.list();
  assert.deepEqual(all.map((c) => c.nickname), ['Ada', 'Bola', 'Chi']);
  if (process.platform !== 'win32') assert.equal((fs.statSync(store.file).mode & 0o777).toString(8), '600');
  fs.rmSync(dir, { recursive: true });
});

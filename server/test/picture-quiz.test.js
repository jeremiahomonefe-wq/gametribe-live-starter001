import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateQuiz, isValidImage } from '../src/quiz-rules.js';
import { buildPictureRound, pictureCategories, PICTURE_TITLE } from '../src/picture-quiz.js';
import { PICTURE_POOL } from '../src/picture-pool.js';
import { createGameEngine, audienceState } from '../src/game-engine.js';
import { parseQuizCsv, quizToCsv } from '../src/quiz-csv.js';

const publicDir = new URL('../../client/public', import.meta.url);
const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const sample = (extra = {}) => ({ title: 'Pics', mode: 'picture', questions: [{ prompt: 'Which flag?', options: ['A', 'B', 'C', 'D'], correctIndex: 2, durationSeconds: 10, image: '/pictures/flags/x.svg', category: 'Flags', ...extra }] });

test('the pool has flags and logos, one picture per answer, and every file exists', () => {
  assert.deepEqual(pictureCategories(), ['Flags', 'Logos']);
  assert.ok(PICTURE_POOL.length >= 80);
  assert.equal(new Set(PICTURE_POOL.map((p) => `${p.category}:${p.answer}`)).size, PICTURE_POOL.length);
  for (const p of PICTURE_POOL) {
    assert.equal(isValidImage(p.image), true, p.image);
    assert.ok(fs.existsSync(new URL(`.${p.image}`, `${publicDir}/`)), `missing file for ${p.answer}`);
  }
});

test('a picture never gives its answer away in its address or its file', () => {
  for (const p of PICTURE_POOL) {
    const words = p.answer.toLowerCase().replace(/[^a-z0-9]+/g, '');
    assert.ok(!p.image.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(words), `${p.image} names ${p.answer}`);
    const svg = fs.readFileSync(new URL(`.${p.image}`, `${publicDir}/`), 'utf8').toLowerCase();
    assert.ok(!svg.includes('<title'), `${p.image} has a title`);
    assert.ok(!/flag-icons|simple-icons/.test(svg));
    if (p.category === 'Flags') assert.ok(!/\b[a-z]{2}-[a-z0-9]+/.test(svg.replace(/xlink:href|stroke-|fill-|clip-|font-/g, '')), `${p.image} still has a country-coded id`);
  }
});

test('every internal reference inside a picture points at an id that exists', () => {
  for (const p of PICTURE_POOL) {
    const svg = fs.readFileSync(new URL(`.${p.image}`, `${publicDir}/`), 'utf8');
    const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of svg.matchAll(/(?:href="#|url\(#)([^")]+)/g)) assert.ok(ids.has(m[1]), `${p.image}: ${m[1]}`);
  }
});

test('a picture round is a valid picture quiz with four different answers from the same category', () => {
  const round = buildPictureRound({ random: seeded() });
  assert.equal(round.title, PICTURE_TITLE);
  assert.equal(round.mode, 'picture');
  assert.equal(round.questions.length, 20);
  assert.equal(validateQuiz(round).ok, true);
  for (const q of round.questions) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    const item = PICTURE_POOL.find((p) => p.image === q.image);
    assert.equal(q.options[q.correctIndex], item.answer);
    const sameCategory = new Set(PICTURE_POOL.filter((p) => p.category === item.category).map((p) => p.answer));
    assert.ok(q.options.every((o) => sameCategory.has(o)), 'wrong answers must come from the same category');
  }
  assert.equal(new Set(round.questions.map((q) => q.image)).size, 20, 'no picture twice in one round');
});

test('rounds differ each time, can be limited to a category, and the right answer moves around', () => {
  const a = buildPictureRound({ random: seeded(1) });
  const b = buildPictureRound({ random: seeded(2) });
  assert.notDeepEqual(a.questions.map((q) => q.image), b.questions.map((q) => q.image));
  const flags = buildPictureRound({ categories: ['Flags'], count: 10, random: seeded(3) });
  assert.ok(flags.questions.every((q) => q.category === 'Flags'));
  const positions = new Set(buildPictureRound({ count: 40, random: seeded(4) }).questions.map((q) => q.correctIndex));
  assert.ok(positions.size >= 3, 'the correct answer should not always sit in the same place');
});

test('picture rules: every question needs a safe picture and exactly four answers', () => {
  assert.equal(validateQuiz(sample()).ok, true);
  assert.match(validateQuiz(sample({ image: undefined })).error, /add a picture/);
  assert.match(validateQuiz(sample({ image: 'javascript:alert(1)' })).error, /picture must be/);
  assert.match(validateQuiz(sample({ image: 'http://example.com/a.png' })).error, /picture must be/);
  assert.match(validateQuiz(sample({ image: '/pictures/../secret' })).error, /picture must be/);
  assert.match(validateQuiz(sample({ options: ['A', 'B', 'C'], correctIndex: 0 })).error, /exactly 4/);
  assert.equal(validateQuiz({ ...sample(), mode: 'nonsense' }).ok, false);
  assert.equal(validateQuiz(sample({ image: 'https://example.com/pic.png' })).ok, true);
});

test('text quizzes are unchanged: no mode, image or category appear in them', () => {
  const checked = validateQuiz({ title: 'T', questions: [{ prompt: 'p', options: ['a', 'b'], correctIndex: 0 }] });
  assert.deepEqual(checked.quiz, { title: 'T', questions: [{ prompt: 'p', options: ['a', 'b'], correctIndex: 0, durationSeconds: 15 }] });
});

test('the picture, its category and the next picture reach every screen; text games stay text', () => {
  const engine = createGameEngine();
  const round = buildPictureRound({ count: 3, random: seeded(5) });
  const created = engine.createSession({ quiz: round });
  engine.joinSession({ pin: created.pin, nickname: 'Ada', socketId: 's1' });
  assert.equal(created.state.mode, 'picture');
  assert.equal(created.state.preload, round.questions[0].image, 'the lobby already knows the first picture to preload');

  const started = engine.startGame({ pin: created.pin, hostToken: created.hostToken }).state;
  assert.equal(started.question.image, round.questions[0].image);
  assert.equal(started.question.category, round.questions[0].category);
  assert.equal(started.preload, round.questions[1].image);
  assert.equal('correctIndex' in started.question, false, 'the answer is never sent while a question is open');
  for (const audience of ['host', 'screen', 'player']) assert.equal(audienceState(started, audience).question.image, round.questions[0].image);

  const revealed = engine.revealAnswer({ pin: created.pin, hostToken: created.hostToken }).state;
  assert.equal(revealed.question.image, round.questions[0].image);
  assert.equal(revealed.question.correctIndex, round.questions[0].correctIndex);

  const text = createGameEngine().createSession();
  assert.equal(text.state.mode, 'quiz');
  assert.equal(text.state.preload, null);
});

test('the last question has nothing left to preload', () => {
  const engine = createGameEngine();
  const created = engine.createSession({ quiz: buildPictureRound({ count: 1, random: seeded(6) }) });
  engine.joinSession({ pin: created.pin, nickname: 'Ada', socketId: 's1' });
  assert.equal(engine.startGame({ pin: created.pin, hostToken: created.hostToken }).state.preload, null);
});

test('a picture quiz survives a CSV export and import', () => {
  const round = buildPictureRound({ count: 5, random: seeded(8) });
  const csv = quizToCsv(round);
  assert.match(csv.split('\r\n')[0], /image,category$/);
  const parsed = parseQuizCsv(csv, { title: round.title });
  assert.equal(parsed.problems.length, 0);
  assert.equal(parsed.quiz.mode, 'picture');
  assert.deepEqual(parsed.quiz.questions, round.questions);
  assert.equal(validateQuiz(parsed.quiz).ok, true);
});

test('text CSVs keep their old shape and a plain quiz export has no picture columns', () => {
  const csv = quizToCsv({ title: 'T', questions: [{ prompt: 'p', options: ['a', 'b'], correctIndex: 0, durationSeconds: 15 }] });
  assert.equal(csv.split('\r\n')[0], 'question,option_a,option_b,option_c,option_d,correct,seconds');
  assert.equal(parseQuizCsv(csv).quiz.mode, undefined);
});

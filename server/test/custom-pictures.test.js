import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parsePictureRows, prepareCustom } from '../src/picture-import.js';
import { buildPictureRound } from '../src/picture-quiz.js';
import { validateQuiz } from '../src/quiz-rules.js';

const script = new URL('../../scripts/add-pictures.mjs', import.meta.url).pathname;
const HEADER = 'file,category,answer,wrong_1,wrong_2,wrong_3,question\r\n';
const makeName = (c, a, ext) => `${c}-${a}`.replace(/\W+/g, '').slice(0, 8) + `.${ext}`;
const seeded = (seed = 3) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const four = ['a', 'b', 'c', 'd'].map((x) => ({ file: `${x}.png`, category: 'Cartoons', answer: x.toUpperCase(), wrong: [], question: '', row: 2 }));
const files = Object.fromEntries(['a', 'b', 'c', 'd'].map((x) => [`${x}.png`, 1000]));

test('rows are read with flexible headers and blank lines are skipped', () => {
  const r = parsePictureRows('Image;Topic;Name;Wrong 1;Wrong 2;Wrong 3;Prompt\r\na.png;Cartoons;Tom;Jerry;Spike;Tyke;Who is this?\r\n\r\n');
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0], { row: 2, file: 'a.png', category: 'Cartoons', answer: 'Tom', wrong: ['Jerry', 'Spike', 'Tyke'], question: 'Who is this?' });
  assert.match(parsePictureRows('file,answer\r\n').fatal, /category/);
});

test('good rows become pool entries with hashed /pictures/custom paths, and their own wrong answers and question', () => {
  const rows = [{ ...four[0], wrong: ['x', 'y', 'z'], question: 'Which cartoon cat?' }, ...four.slice(1)].map((r, i) => ({ ...r, row: i + 2 }));
  const { items, copies, problems } = prepareCustom(rows, { files, makeName });
  assert.deepEqual(problems, []);
  assert.equal(items.length, 4);
  assert.deepEqual(items[0].wrong, ['x', 'y', 'z']);
  assert.equal(items[0].prompt, 'Which cartoon cat?');
  assert.ok(items.every((i) => i.image.startsWith('/pictures/custom/')));
  assert.equal(copies.length, 4);
});

test('every kind of mistake is reported with its row number', () => {
  const run = (patch, extra = {}) => prepareCustom([{ ...four[0], row: 5, ...patch }], { files: { 'a.png': 1000, 'big.png': 999999, 'mid.png': 300 * 1024, 'a.exe': 5 }, makeName, ...extra }).problems.map((p) => p.message).join(' | ');
  assert.match(run({ file: 'missing.png' }), /not in the my-pictures folder/);
  assert.match(run({ file: 'a.exe' }), /must be one of/);
  assert.match(run({ file: 'big.png' }), /Shrink it below 600 KB/);
  assert.match(run({ category: '' }), /no category/);
  assert.match(run({ answer: '' }), /no answer/);
  assert.match(run({ wrong: ['x'] }), /all three wrong answers or none/);
  assert.match(run({ wrong: ['x', 'x', 'y'] }), /must all be different/);
  assert.match(run({ wrong: ['A', 'y', 'z'] }), /must all be different/);
  assert.match(run({}), /only 1 picture/, 'a lone picture has nobody to borrow wrong answers from');
  assert.equal(run({ wrong: ['x', 'y', 'z'] }), '', 'but three own wrong answers fix that');
  assert.match(run({ category: 'Flags', answer: 'Nigeria' }, { builtIn: [{ category: 'Flags', answer: 'Nigeria' }] }), /already exists/);
  assert.equal(prepareCustom([{ ...four[0], row: 5 }], { files, makeName }).problems[0].row, 5);
});

test('built-in pictures count toward the four a category needs', () => {
  const builtIn = ['p', 'q', 'r'].map((a) => ({ category: 'Cartoons', answer: a, image: '/pictures/x.svg' }));
  assert.deepEqual(prepareCustom([{ ...four[0], row: 2 }], { builtIn, files, makeName }).problems, []);
});

test('a round uses your own wrong answers and question, and stays valid', () => {
  const pool = [
    { category: 'Cartoons', answer: 'Tom', image: '/pictures/custom/a1.png', wrong: ['Jerry', 'Spike', 'Tyke'], prompt: 'Which cartoon cat is this?' },
    ...['Jerry', 'Spike', 'Tyke'].map((a, i) => ({ category: 'Cartoons', answer: a, image: `/pictures/custom/b${i}.png` }))
  ];
  const round = buildPictureRound({ pool, categories: ['Cartoons'], count: 4, random: seeded() });
  const tom = round.questions.find((q) => q.image.endsWith('a1.png'));
  assert.equal(tom.prompt, 'Which cartoon cat is this?');
  assert.deepEqual([...tom.options].sort(), ['Jerry', 'Spike', 'Tom', 'Tyke']);
  assert.equal(tom.options[tom.correctIndex], 'Tom');
  assert.equal(validateQuiz(round).ok, true);
});

test('the script copies images under hashed names, writes the pool, and a bad run changes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-'));
  const dir = path.join(root, 'my-pictures'); fs.mkdirSync(dir);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  ['tom', 'jerry', 'spike', 'tyke'].forEach((n) => fs.writeFileSync(path.join(dir, `${n}.svg`), svg));
  fs.writeFileSync(path.join(dir, 'pictures.csv'), `${HEADER}tom.svg,Cartoons,Tom,,,,Which cartoon character is this?\r\njerry.svg,Cartoons,Jerry,,,,\r\nspike.svg,Cartoons,Spike,,,,\r\ntyke.svg,Cartoons,Tyke,,,,\r\n`);
  const run = () => spawnSync('node', [script], { env: { ...process.env, ROOT_DIR: root }, encoding: 'utf8' });
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  const generated = fs.readFileSync(path.join(root, 'server/src/custom-pictures.js'), 'utf8');
  assert.match(generated, /"category": "Cartoons"/);
  assert.ok(!/tom\.svg|jerry\.svg/.test(generated), 'the original file names must not appear');
  const copied = fs.readdirSync(path.join(root, 'client/public/pictures/custom'));
  assert.equal(copied.length, 4);
  assert.ok(copied.every((f) => /^[0-9a-f]{12}\.svg$/.test(f)));

  fs.appendFileSync(path.join(dir, 'pictures.csv'), 'nope.svg,Cartoons,Ghost,,,,\r\n');
  const bad = run();
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /Row 6: the file "nope.svg" is not in the my-pictures folder/);
  assert.equal(fs.readFileSync(path.join(root, 'server/src/custom-pictures.js'), 'utf8'), generated, 'a failed run leaves the last good result alone');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a picture between 200 and 600 KB is accepted with a heads-up, not refused', () => {
  const r = prepareCustom([{ ...four[0], file: 'mid.png', wrong: ['x', 'y', 'z'], row: 4 }], { files: { 'mid.png': 300 * 1024 }, makeName });
  assert.deepEqual(r.problems, []);
  assert.equal(r.items.length, 1);
  assert.match(r.warnings[0].message, /300 KB/);
  assert.equal(r.warnings[0].row, 4);
});

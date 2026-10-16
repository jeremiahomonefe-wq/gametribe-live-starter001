// Turns the rows of my-pictures/pictures.csv into custom pool entries. Pure functions (no Node imports) so the
// add-pictures script and the tests share them. Nothing is accepted that the quiz rules would later refuse.
import { splitCsv } from './quiz-csv.js';
import { QUIZ_LIMITS } from './quiz-rules.js';

export const IMAGE_TYPES = ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
export const MAX_IMAGE_BYTES = 200 * 1024;
const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function parsePictureRows(text) {
  const rows = splitCsv(text);
  if (!rows.length) return { fatal: 'pictures.csv is empty. Start from the header row: file,category,answer,wrong_1,wrong_2,wrong_3,question' };
  const col = { file: -1, category: -1, answer: -1, wrong: [-1, -1, -1], question: -1 };
  rows[0].forEach((h, i) => {
    const n = norm(h); const w = n.match(/^wrong(?:answer|option)?([1-3])$/);
    if (['file', 'filename', 'image', 'picture'].includes(n)) col.file = i;
    else if (['category', 'group', 'topic'].includes(n)) col.category = i;
    else if (['answer', 'correct', 'correctanswer', 'name'].includes(n)) col.answer = i;
    else if (['question', 'prompt'].includes(n)) col.question = i;
    else if (w) col.wrong[Number(w[1]) - 1] = i;
  });
  const missing = ['file', 'category', 'answer'].filter((k) => col[k] === -1);
  if (missing.length) return { fatal: `pictures.csv needs these columns: ${missing.join(', ')}. Use the header: file,category,answer,wrong_1,wrong_2,wrong_3,question` };
  const cell = (r, i) => (i >= 0 ? clean(r[i]) : '');
  const out = [];
  rows.slice(1).forEach((r, k) => {
    if (r.every((c) => !String(c).trim())) return;
    out.push({ row: k + 2, file: cell(r, col.file), category: cell(r, col.category), answer: cell(r, col.answer), wrong: col.wrong.map((i) => cell(r, i)).filter(Boolean), question: cell(r, col.question) });
  });
  return { rows: out };
}

// rows: from parsePictureRows. builtIn: the generated pool (flags, logos). files: { name -> byte size } of what is in the folder.
// makeName(category, answer, ext) gives the hashed file name. Returns { items, copies: [{from, to}], problems }.
export function prepareCustom(rows, { builtIn = [], files = {}, makeName }) {
  const problems = [];
  const bad = (row, message) => problems.push({ row, message });
  const items = []; const copies = []; const seen = new Set();
  for (const r of rows) {
    const where = r.row;
    if (!r.file) { bad(where, 'there is no file name.'); continue; }
    const ext = r.file.split('.').pop().toLowerCase();
    if (!IMAGE_TYPES.includes(ext)) { bad(where, `"${r.file}" must be one of: ${IMAGE_TYPES.join(', ')}.`); continue; }
    if (!(r.file in files)) { bad(where, `the file "${r.file}" is not in the my-pictures folder.`); continue; }
    if (files[r.file] > MAX_IMAGE_BYTES) bad(where, `"${r.file}" is ${Math.round(files[r.file] / 1024)} KB. Keep pictures under ${MAX_IMAGE_BYTES / 1024} KB so phones load them fast.`);
    if (!r.category) bad(where, 'there is no category.');
    else if (r.category.length > QUIZ_LIMITS.maxCategory) bad(where, `keep the category under ${QUIZ_LIMITS.maxCategory} characters.`);
    if (!r.answer) bad(where, 'there is no answer.');
    else if (r.answer.length > QUIZ_LIMITS.maxOption) bad(where, `keep the answer under ${QUIZ_LIMITS.maxOption} characters.`);
    if (r.question.length > QUIZ_LIMITS.maxPrompt) bad(where, `keep the question under ${QUIZ_LIMITS.maxPrompt} characters.`);
    if (r.wrong.length && r.wrong.length !== 3) bad(where, `give all three wrong answers or none (found ${r.wrong.length}).`);
    if (r.wrong.length === 3) {
      const all = [r.answer, ...r.wrong].map((x) => x.toLowerCase());
      if (new Set(all).size !== 4) bad(where, 'the answer and the three wrong answers must all be different.');
      if (r.wrong.some((w) => w.length > QUIZ_LIMITS.maxOption)) bad(where, `keep each wrong answer under ${QUIZ_LIMITS.maxOption} characters.`);
    }
    const key = `${r.category}:${r.answer}`.toLowerCase();
    if (seen.has(key) || builtIn.some((b) => `${b.category}:${b.answer}`.toLowerCase() === key)) { bad(where, `"${r.answer}" already exists in ${r.category}. Each answer can have one picture per category.`); continue; }
    seen.add(key);
    if (problems.some((p) => p.row === where)) continue;
    const to = makeName(r.category, r.answer, ext);
    copies.push({ from: r.file, to });
    items.push({ category: r.category, answer: r.answer, image: `/pictures/custom/${to}`, ...(r.wrong.length === 3 ? { wrong: r.wrong } : {}), ...(r.question ? { prompt: r.question } : {}) });
  }
  // Pictures without their own wrong answers borrow three from the same category, so it must have at least four.
  const everything = [...builtIn, ...items];
  for (const item of items) {
    const n = everything.filter((p) => p.category.toLowerCase() === item.category.toLowerCase()).length;
    if (!item.wrong && n < 4) bad(rows.find((r) => r.answer === item.answer && r.category === item.category)?.row ?? null, `"${item.category}" has only ${n} picture${n === 1 ? '' : 's'}. Add more to the category (it needs at least 4), or give wrong_1 to wrong_3 for this row.`);
  }
  return { items, copies, problems };
}

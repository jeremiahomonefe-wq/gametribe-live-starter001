// Checks that your pictures will actually show up. Run:  npm run check-pictures
// It compares what the game is told to show (server/src/custom-pictures.js) with the files that really exist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'client/public');
const dist = path.join(root, 'client/dist');
const { CUSTOM_PICTURES } = await import('../server/src/custom-pictures.js');
const { PICTURE_POOL } = await import('../server/src/picture-pool.js');
const all = [...PICTURE_POOL, ...CUSTOM_PICTURES];
const problems = []; const ok = (m) => console.log(`  OK    ${m}`); const bad = (m, fix) => { problems.push(fix); console.log(`  FIX   ${m}\n        -> ${fix}`); };

const csv = path.join(root, 'my-pictures/pictures.csv');
const csvRows = fs.existsSync(csv) ? fs.readFileSync(csv, 'utf8').split(/\r?\n/).slice(1).filter((l) => l.split(',')[0].trim()).length : 0;
const mine = fs.existsSync(path.join(root, 'my-pictures')) ? fs.readdirSync(path.join(root, 'my-pictures')).filter((f) => /\.(jpe?g|png|webp|gif|svg)$/i.test(f)).length : 0;
console.log(`\nYour list (my-pictures/pictures.csv): ${csvRows} picture rows. Image files in my-pictures: ${mine}.`);
console.log(`The game is currently told about: ${CUSTOM_PICTURES.length} of your pictures and ${PICTURE_POOL.length} built-in ones.\n`);

if (!csvRows) bad('pictures.csv has no picture rows.', 'Fill in my-pictures/pictures.csv, then run: npm run add-pictures');
else if (!CUSTOM_PICTURES.length) bad('The game knows about none of your pictures.', 'Run: npm run add-pictures   (read its message: it lists any row it could not accept)');
else if (CUSTOM_PICTURES.length !== csvRows) bad(`The CSV has ${csvRows} rows but the game knows ${CUSTOM_PICTURES.length}.`, 'Run again: npm run add-pictures');
else ok(`all ${csvRows} CSV rows are registered`);

const missing = all.filter((p) => !fs.existsSync(path.join(pub, p.image)));
if (missing.length) bad(`${missing.length} registered picture file(s) do not exist, for example ${missing[0].image}`, 'Run: npm run add-pictures   (it rebuilds client/public/pictures/custom from my-pictures)');
else if (all.length) ok('every registered picture file exists in client/public/pictures');

const svgs = CUSTOM_PICTURES.filter((p) => p.image.endsWith('.svg'));
if (svgs.length) bad(`${svgs.length} of your pictures still point to old .svg files (custom-pictures.js is out of date).`, 'Run: npm run add-pictures   (it must say "Added N pictures"; if it printed problems, fix those rows first)');

const customDir = path.join(pub, 'pictures/custom');
if (fs.existsSync(customDir)) {
  const used = new Set(CUSTOM_PICTURES.map((p) => path.basename(p.image)));
  const stale = fs.readdirSync(customDir).filter((f) => !used.has(f));
  if (stale.length) bad(`${stale.length} leftover file(s) in pictures/custom that no question uses (${stale.slice(0, 3).join(', ')}...)`, 'Run: npm run add-pictures   (it clears and rebuilds that folder)');
} else if (CUSTOM_PICTURES.length) bad('The folder client/public/pictures/custom does not exist.', 'Run: npm run add-pictures');

if (fs.existsSync(dist)) {
  const notBuilt = all.filter((p) => !fs.existsSync(path.join(dist, p.image)));
  if (notBuilt.length) bad(`The built site (client/dist) is missing ${notBuilt.length} picture(s). npm start and your live site use that copy.`, 'Run: npm run build   (then restart npm start, or redeploy)');
  else if (all.length) ok('the built site (client/dist) has every picture');
} else console.log('  note  client/dist does not exist yet. That is fine for npm run dev. Run npm run build before npm start or deploying.');

const cats = new Set(all.map((p) => p.category));
if (all.length && !cats.size) bad('No categories found.', 'Check the category column in pictures.csv');
console.log(problems.length ? `\n${problems.length} thing(s) to fix, see the lines marked FIX above.\n` : '\nEverything is in place. If pictures still do not show: stop the server, run npm run dev again, and press Ctrl+Shift+R in the browser.\n');
process.exit(problems.length ? 1 : 0);

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import fs from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createGameEngine } from './game-engine.js';
import { createContactStore } from './contact-store.js';
import { rowsToCsv } from './quiz-csv.js';
import { PHONE_MODES } from './phone.js';
import { createHub } from './hub.js';
import { DEFAULT_QUIZ } from './default-quiz.js';

const PORT = Number(process.env.PORT || 4000);
// One or more website addresses allowed to connect, comma separated (e.g. your Vercel production and preview URLs).
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);
// Every running copy of the server gets a short code. Everyone in one game must be on the same copy,
// so the code is shown in the app and in /health to make a mismatch easy to spot.
const INSTANCE_ID = randomUUID().slice(0, 6);
const startedAt = Date.now();
// COLLECT_PHONES: required (default), optional, or off. Decides whether the join form asks for a phone number.
const envMode = (process.env.COLLECT_PHONES || 'required').toLowerCase();
if (!PHONE_MODES.includes(envMode)) console.warn(`COLLECT_PHONES="${process.env.COLLECT_PHONES}" is not one of ${PHONE_MODES.join(', ')}; using "required".`);
const PHONE_MODE = PHONE_MODES.includes(envMode) ? envMode : 'required';
const PHONE_NOTICE = process.env.PHONE_NOTICE || 'The organisers use your number to reach you, for example if you win. It is not shown to other players.';
const DATA_DIR = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const contactStore = createContactStore({ dir: DATA_DIR });
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (process.env.RENDER && !process.env.DATA_DIR && PHONE_MODE !== 'off') {
  console.warn('WARNING: phone numbers are being saved to a temporary disk and will be lost on the next deploy or restart. Attach a persistent disk and set DATA_DIR to its mount path, and download contacts after each game.');
}
const engine = createGameEngine({ phoneMode: PHONE_MODE });
const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'gametribe-live-server', instance: INSTANCE_ID, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), games: engine.sessionCount() }));

// Everything ever collected, as a CSV. Switched off unless ADMIN_TOKEN is set. Send the token in an
// "Authorization: Bearer <token>" header, or as ?key=<token> to download from a browser. Never cached,
// and repeated wrong guesses from one address are slowed down.
const adminFailures = new Map();
app.get('/admin/contacts.csv', async (req, res) => {
  if (!ADMIN_TOKEN) return res.status(404).end();
  const now = Date.now();
  const recent = (adminFailures.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (recent.length >= 10) return res.status(429).send('Too many attempts. Try again later.');
  const given = Buffer.from(String(req.get('authorization')?.replace(/^Bearer\s+/i, '') || req.query.key || ''));
  const wanted = Buffer.from(ADMIN_TOKEN);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    adminFailures.set(req.ip, [...recent, now]);
    return res.status(401).send('Not authorised.');
  }
  try {
    const all = await contactStore.list();
    const rows = [['game_pin', 'quiz', 'nickname', 'phone', 'joined_at'], ...all.map((c) => [c.pin, c.quizTitle, c.nickname, c.phone, c.joinedAt])];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="gametribe-contacts.csv"', 'Cache-Control': 'no-store' });
    res.send(`\uFEFF${rowsToCsv(rows)}`);
  } catch (e) { console.error(`Could not read contacts: ${e.code || e.message}`); res.status(500).send('Could not read the saved contacts.'); }
});

// One deploy: when the website has been built (npm run build), this server also serves it,
// so players and the game share a single address and no cross-origin settings are needed.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const indexFile = path.join(distDir, 'index.html');
if (fs.existsSync(indexFile)) {
  app.use(express.static(distDir, { setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(indexFile) : next()));
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGINS, methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 20000
});

const hub = createHub({
  engine,
  instanceId: INSTANCE_ID,
  defaultQuiz: DEFAULT_QUIZ,
  contactStore,
  broadcast: (room, event, data) => io.to(room).emit(event, data),
  sendTo: (socketId, event, data) => io.to(socketId).emit(event, data)
});

io.on('connection', (socket) => {
  socket.emit('server:ready', { connected: true, instance: INSTANCE_ID, phoneMode: PHONE_MODE, phoneNotice: PHONE_NOTICE });
  for (const event of hub.events) socket.on(event, (payload) => hub.handle(socket, event, payload));
  socket.on('disconnect', () => hub.onDisconnect(socket));
});

httpServer.listen(PORT, () => console.log(`Game Tribe Live server listening on http://localhost:${PORT}${fs.existsSync(indexFile) ? ' (serving the website too)' : ''}. Phone numbers: ${PHONE_MODE}${PHONE_MODE === 'off' ? '' : `, saved to ${contactStore.file}`}.`));

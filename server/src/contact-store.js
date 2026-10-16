// Durable record of collected contacts: one JSON line per player, appended the moment they join, so a
// crash or restart never loses a number that was already collected. The file is private to the server
// (owner read/write only). On a host with an ephemeral disk (Render's free plan) it is wiped on redeploy
// or restart unless DATA_DIR points at a persistent disk.
import fs from 'node:fs';
import path from 'node:path';

export function createContactStore({ dir }) {
  const file = path.join(dir, 'contacts.jsonl');
  let ready = false;
  return {
    file,
    async save(contact) {
      if (!ready) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); ready = true; }
      await fs.promises.appendFile(file, `${JSON.stringify(contact)}\n`, { mode: 0o600 });
    },
    async list() {
      let text;
      try { text = await fs.promises.readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
      return text.split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
    }
  };
}

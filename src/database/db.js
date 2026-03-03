import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '../../data');
const DB_PATH    = join(DATA_DIR, 'conversations.json');

mkdirSync(DATA_DIR, { recursive: true });

const adapter = new JSONFile(DB_PATH);

const defaultData = {
  messages:  [],
  analyses:  [],
  _idCounters: { messages: 0, analyses: 0 },
};

const db = new Low(adapter, defaultData);

export async function initDatabase() {
  await db.read();
  // Merge any missing default keys (in case the file was created without them)
  db.data = { ...defaultData, ...db.data };
  await db.write();
  console.log(`✅ Base de datos lista: ${DB_PATH}`);
}

export default db;

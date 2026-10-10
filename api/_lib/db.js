import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
export const dataDir = resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });
const NativeDatabase = require('bun:sqlite').Database;
export const db = new NativeDatabase(resolve(dataDir, 'quotation.sqlite'));
export const query = (sql) => db.query(sql);
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;
  PRAGMA cache_size=-2048;
  CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, password TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
    customer TEXT NOT NULL, total REAL NOT NULL, data TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL, updated TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS versions (
    token TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id),
    version INTEGER NOT NULL, data TEXT NOT NULL, content_hash TEXT NOT NULL,
    pdf_hash TEXT NOT NULL, url TEXT NOT NULL, created TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    UNIQUE(quote_id,version)
  );
  CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, quote_id TEXT, action TEXT NOT NULL, at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS quotes_updated ON quotes(updated);
  CREATE INDEX IF NOT EXISTS versions_quote ON versions(quote_id);
`);
export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(id, action) {
  query('INSERT INTO audit(quote_id,action,at) VALUES(?,?,?)').run(id, action, new Date().toISOString());
}
export const settings = () => {
  const value = query('SELECT value FROM settings WHERE id=1').get();
  return value ? JSON.parse(value.value) : { publicOrigin: process.env.PUBLIC_ORIGIN || '', watermark: '扫码核验 · 以在线报价为准' };
};

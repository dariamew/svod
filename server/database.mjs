import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'svod.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, specialization TEXT NOT NULL, reliability REAL NOT NULL, discount REAL NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), supplier_id TEXT NOT NULL REFERENCES suppliers(id), filename TEXT NOT NULL, format TEXT NOT NULL, count INTEGER NOT NULL, skipped INTEGER NOT NULL, errors TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE, import_id TEXT NOT NULL REFERENCES imports(id), product_key TEXT NOT NULL, name TEXT NOT NULL, sku TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL, price REAL NOT NULL, discount REAL NOT NULL, effective_price REAL NOT NULL, currency TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,supplier_id,product_key));
    CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS selections (user_id TEXT NOT NULL REFERENCES users(id), product_key TEXT NOT NULL, offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE, PRIMARY KEY(user_id,product_key));
    CREATE INDEX IF NOT EXISTS offers_user ON offers(user_id);
    CREATE INDEX IF NOT EXISTS suppliers_user ON suppliers(user_id);
  `);
  return db;
}

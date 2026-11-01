import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

/** Each item is one migration. Its position becomes SQLite's `user_version`. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE overrides (
    service_key TEXT PRIMARY KEY, name TEXT, icon TEXT, category TEXT, hidden INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE manual_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
  CREATE TABLE incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, service_key TEXT NOT NULL, service_name TEXT NOT NULL,
    kind TEXT NOT NULL, planned INTEGER NOT NULL DEFAULT 0, cause TEXT,
    started_at INTEGER NOT NULL, ended_at INTEGER);
  CREATE INDEX idx_incidents_service ON incidents(service_key, started_at);
  CREATE TABLE restarts (service_key TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX idx_restarts ON restarts(service_key, at);
  CREATE TABLE dismissed (alert_id TEXT PRIMARY KEY, until INTEGER NOT NULL);
  CREATE TABLE icon_cache (name TEXT PRIMARY KEY, checked_at INTEGER NOT NULL);
  `,
  `ALTER TABLE overrides ADD COLUMN addresses TEXT;`,
];

export function openDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'selfdock.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function getSetting(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function numSetting(db: DB, key: string, fallback: number): number {
  const v = Number(getSetting(db, key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

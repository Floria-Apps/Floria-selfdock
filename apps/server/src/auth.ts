import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DB } from './db';

export const COOKIE_NAME = 'selfdock_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface SessionUser { id: number; username: string }

export class Auth {
  constructor(private db: DB) {}

  userCount(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  createUser(username: string, password: string): number {
    const r = this.db.prepare('INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?)')
      .run(username, hashPassword(password), Date.now());
    return Number(r.lastInsertRowid);
  }

  /** Returns the session token (it goes in the cookie), or null if the password is wrong. */
  login(username: string, password: string): string | null {
    const row = this.db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as
      { id: number; password_hash: string } | undefined;
    // Hash even when the user does not exist, so response time does not reveal which usernames exist.
    const ok = row ? verifyPassword(password, row.password_hash) : (verifyPassword(password, 'scrypt$00$00'), false);
    if (!row || !ok) return null;
    return this.createSession(row.id);
  }

  createSession(userId: number): string {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)')
      .run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
    return token;
  }

  userFromToken(token: string | undefined): SessionUser | null {
    if (!token) return null;
    const row = this.db.prepare(
      `SELECT u.id AS id, u.username AS username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), Date.now()) as SessionUser | undefined;
    return row ?? null;
  }

  logout(token: string | undefined) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  }

  ttlSeconds() { return SESSION_TTL_MS / 1000; }
}

/** Simple in-memory limiter for login attempts. */
export class LoginLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private max = 8, private windowMs = 5 * 60 * 1000) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset < now) { this.hits.set(key, { n: 1, reset: now + this.windowMs }); return true; }
    h.n++;
    return h.n <= this.max;
  }
  clear(key: string) { this.hits.delete(key); }
}

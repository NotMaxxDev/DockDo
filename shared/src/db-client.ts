import { sql } from 'drizzle-orm';
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMysql, type MySql2Database } from 'drizzle-orm/mysql2';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { Config, sqliteDbPath, nowIso } from './config';
import * as schema from './db-schema';
import { migrateUp } from './migrate';

export type DB =
  | BetterSQLite3Database<typeof schema>
  | MySql2Database<typeof schema>;

export type DbMode = 'sqlite' | 'mariadb';

export interface DbHandle {
  db: DB;
  mode: DbMode;
  config: Config;
}

let handle: DbHandle | null = null;

export function dbMode(cfg: Config): DbMode {
  return cfg.dbMode;
}

export async function openDatabase(config: Config, source: string): Promise<DbHandle> {
  if (config.dbMode === 'mariadb') {
    const pool = mysql.createPool({
      host: config.mariadb.host,
      port: config.mariadb.port,
      database: config.mariadb.database,
      user: config.mariadb.user,
      password: config.mariadb.password,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: 'Z'
    });
    const db = drizzleMysql(pool, { schema, mode: 'default' });
    return { db, mode: 'mariadb', config };
  }
  const sqlite = new Database(sqliteDbPath(config.dataDir));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzleSqlite(sqlite, { schema });
  return { db, mode: 'sqlite', config };
}

export async function initDatabase(config: Config, source: string): Promise<DbHandle> {
  handle = await openDatabase(config, source);
  try {
    await migrateUp(handle);
  } catch (err) {
    console.error(`[${source}] Migration failed:`, err);
    throw err;
  }
  return handle;
}

export function getHandle(): DbHandle {
  if (!handle) throw new Error('Database not initialized');
  return handle;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  return getHandle().db as BetterSQLite3Database<typeof schema>;
}

export function dbTyped(): BetterSQLite3Database<typeof schema> {
  return getDb();
}

export async function reopenDatabase(source: string): Promise<void> {
  if (!handle) return;
  const cfg = handle.config;
  const mode = handle.mode;
  if (mode === 'sqlite') {
    const sqlite = (handle.db as { session: { client: Database.Database } } & typeof handle.db).session.client;
    try {
      sqlite.close();
    } catch {
      /* ignore */
    }
  } else {
    const mgr = (handle.db as { session: { client: mysql.Pool } } & typeof handle.db).session.client;
    try {
      await mgr.end();
    } catch {
      /* ignore */
    }
  }
  const fresh = await openDatabase(cfg, source);
  await migrateUp(fresh);
  handle = fresh;
}

export async function runRaw(h: DbHandle, statement: string): Promise<void> {
  if (h.mode === 'sqlite') {
    (h.db as { session: { client: Database.Database } } & typeof h.db).session.client.exec(statement);
  } else {
    await (h.db as { session: { client: mysql.Pool } } & typeof h.db).session.client.query(statement);
  }
}

export async function testMariaDbConnection(config: Config): Promise<{ ok: boolean; error?: string }> {
  try {
    const conn = await mysql.createConnection({
      host: config.mariadb.host,
      port: config.mariadb.port,
      database: config.mariadb.database,
      user: config.mariadb.user,
      password: config.mariadb.password,
      connectTimeout: 5000
    });
    await conn.query('SELECT 1');
    await conn.end();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function nowDb(h: DbHandle): Promise<string> {
  if (h.mode === 'sqlite') {
    await (h.db as BetterSQLite3Database<typeof schema>).select({ v: sql`datetime('now')` }).from(schema.users).limit(1);
  }
  return nowIso();
}
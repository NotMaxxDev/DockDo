import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export interface Config {
  appPort: number;
  adminPort: number;
  host: string;
  dataDir: string;
  dbMode: 'sqlite' | 'mariadb';
  cookieSecret: string;
  sessionTtlDays: number;
  publicAppUrl: string;
  publicAdminUrl: string;
  mariadb: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  environment: 'development' | 'production';
}

function substituteDot(env: string, sub: string, x: string): string {
  return String(x).includes('${' + env + '}') ? String(x).replace('${' + env + '}', sub) : x;
}

function readDbModeFile(dataDir: string): 'sqlite' | 'mariadb' | null {
  try {
    const p = path.join(dataDir, 'db-mode.json');
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (raw && (raw.mode === 'sqlite' || raw.mode === 'mariadb')) return raw.mode;
  } catch {
    /* ignore */
  }
  return null;
}

export function isDocker(): boolean {
  return fs.existsSync('/.dockerenv');
}

export function defaultDataDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '..', 'data');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(env.DATA_DIR || defaultDataDir());
  const fileMode = readDbModeFile(dataDir);
  const modeEnv = (env.DB_MODE || 'sqlite').toLowerCase();
  const dbMode: 'sqlite' | 'mariadb' = fileMode || (modeEnv === 'mariadb' ? 'mariadb' : 'sqlite');
  const mariadbUser = substituteDot('MARIADB_DATABASE', env.MARIADB_DATABASE || 'todoapp', env.MARIADB_USER || 'todoapp');
  return {
    appPort: parseInt(env.APP_PORT || '3000', 10),
    adminPort: parseInt(env.ADMIN_PORT || '3001', 10),
    host: env.HOST || '0.0.0.0',
    dataDir,
    dbMode,
    cookieSecret: env.COOKIE_SECRET || 'dockdo-insecure-dev-secret-change-me',
    sessionTtlDays: parseInt(env.SESSION_TTL_DAYS || '30', 10),
    publicAppUrl: (env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
    publicAdminUrl: (env.PUBLIC_ADMIN_URL || 'http://localhost:3001').replace(/\/$/, ''),
    mariadb: {
      host: env.MARIADB_HOST || '127.0.0.1',
      port: parseInt(env.MARIADB_PORT || '3306', 10),
      database: env.MARIADB_DATABASE || 'todoapp',
      user: mariadbUser,
      password: env.MARIADB_PASSWORD || ''
    },
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
  };
}

export function writeDbModeFile(dataDir: string, mode: 'sqlite' | 'mariadb'): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'db-mode.json'), JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return (crypto?.randomUUID ? crypto.randomUUID() : require('crypto').randomUUID()) as string;
}

export function sqliteDbPath(dataDir: string): string {
  return path.join(dataDir, 'dockdo.db');
}

export function sha256hex(data: string): string {
  return require('crypto').createHash('sha256').update(data).digest('hex');
}
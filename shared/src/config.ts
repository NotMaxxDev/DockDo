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
  tls: boolean;
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

const KNOWN_INSECURE_SECRETS = ['dockdo-insecure-dev-secret-change-me', 'change-me', 'change-me-too'];

function readOrCreateSecret(dataDir: string, explicit: string | undefined): string {
  if (explicit && !KNOWN_INSECURE_SECRETS.includes(explicit)) return explicit;
  const secretPath = path.join(dataDir, 'secret');
  try {
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf-8').trim();
  } catch {
    /* ignore */
  }
  const secret = require('crypto').randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${secretPath}.tmp`;
    fs.writeFileSync(tmp, secret, { mode: 0o600 });
    fs.renameSync(tmp, secretPath);
  } catch {
    /* ignore */
  }
  return secret;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(env.DATA_DIR || defaultDataDir());
  const fileMode = readDbModeFile(dataDir);
  const modeEnv = (env.DB_MODE || 'sqlite').toLowerCase();
  const dbMode: 'sqlite' | 'mariadb' = fileMode || (modeEnv === 'mariadb' ? 'mariadb' : 'sqlite');
  if (dbMode === 'mariadb') {
    const pw = env.MARIADB_PASSWORD || '';
    if (!pw || KNOWN_INSECURE_SECRETS.includes(pw)) {
      throw new Error('[config] DB_MODE=mariadb erfordert ein eigenes MARIADB_PASSWORD in der .env – die bekannten Default-Passwörter sind in Produktion nicht erlaubt. Setze MARIADB_PASSWORD auf einen langen Zufallswert (docker compose up benötigt dann --profile mariadb).');
    }
  }
  const mariadbUser = substituteDot('MARIADB_DATABASE', env.MARIADB_DATABASE || 'todoapp', env.MARIADB_USER || 'todoapp');
  const publicAppUrl = (env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const publicAdminUrl = (env.PUBLIC_ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');
  const tls = env.TLS === undefined ? publicAppUrl.startsWith('https://') || publicAdminUrl.startsWith('https://') : env.TLS === 'on' || env.TLS === 'true';
  return {
    appPort: parseInt(env.APP_PORT || '3000', 10),
    adminPort: parseInt(env.ADMIN_PORT || '3001', 10),
    host: env.HOST || '0.0.0.0',
    dataDir,
    dbMode,
    cookieSecret: readOrCreateSecret(dataDir, env.COOKIE_SECRET),
    sessionTtlDays: parseInt(env.SESSION_TTL_DAYS || '30', 10),
    publicAppUrl,
    publicAdminUrl,
    tls,
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
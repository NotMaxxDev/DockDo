import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { RowDataPacket } from 'mysql2';
import { eq, desc } from 'drizzle-orm';
import {
  getDb, getHandle, backupTargets, backupJobs, backups, settings,
  audit, logAppEvent, nowIso, uuid, sqliteDbPath, loadConfig,
  type BackupTarget, type BackupJob
} from '@dockdo/shared';

const execFileP = promisify(execFile);

export interface TargetConfig {
  path?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  host?: string;
  share?: string;
  username?: string;
  password?: string;
  domain?: string;
  pathPrefix?: string;
}

async function produceDump(dataDir: string): Promise<{ file: string; tempDir: string }> {
  const cfg = loadConfig();
  const tempDir = fs.mkdtempSync(path.join(dataDir, '.backup-tmp-'));
  const dbFile = sqliteDbPath(dataDir);
  const outBase = path.join(tempDir, 'dockdo');
  if (cfg.dbMode === 'sqlite') {
    const { default: Database } = await import('better-sqlite3');
    const src = new Database(dbFile, { readonly: true });
    await src.backup(outBase + '.db').then(() => src.close());
  } else {
    const mysql = (await import('mysql2/promise')).default;
    const conn = await mysql.createConnection({
      host: cfg.mariadb.host, port: cfg.mariadb.port,
      database: cfg.mariadb.database, user: cfg.mariadb.user, password: cfg.mariadb.password
    });
    const [tables] = await conn.query<RowDataPacket[]>('SHOW TABLES');
    const tableKey = Object.keys(tables[0] || {})[0];
    let sql = '';
    for (const t of tables) {
      const table = (t as Record<string, string>)[tableKey];
      const [create] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
      sql += (create[0] as unknown as Record<string, string>)['Create Table'] + ';\n\n';
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      for (const r of rows as Record<string, unknown>[]) {
        const cols = Object.keys(r).map((c) => `\`${c}\``).join(', ');
        const vals = Object.values(r).map((v) => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)).join(', ');
        sql += `INSERT INTO \`${table}\` (${cols}) VALUES (${vals});\n`;
      }
      sql += '\n';
    }
    await conn.end();
    fs.writeFileSync(outBase + '.sql', sql);
  }
  fs.writeFileSync(outBase + '.settings.json', JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: '1.0.0' }));
  return { file: outBase, tempDir };
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function writeLocal(target: BackupTarget, fileBase: string, name: string): Promise<{ file: string; size: number }> {
  const cfg = (target.config || {}) as TargetConfig;
  const dir = path.resolve(cfg.path || './data/backups');
  fs.mkdirSync(dir, { recursive: true });
  const ext = fs.existsSync(fileBase + '.db') ? '.db' : '.sql';
  const final = path.join(dir, `${name}${ext}`);
  fs.copyFileSync(fileBase + ext, final);
  if (fs.existsSync(fileBase + '.settings.json')) {
    fs.copyFileSync(fileBase + '.settings.json', final + '.json');
  }
  return { file: final, size: fs.statSync(final).size };
}

async function writeS3(target: BackupTarget, fileBase: string, name: string): Promise<{ key: string; size: number }> {
  const cfg = (target.config || {}) as TargetConfig;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: cfg.endpoint || undefined,
    region: cfg.region || 'us-east-1',
    credentials: { accessKeyId: cfg.accessKeyId || '', secretAccessKey: cfg.secretAccessKey || '' },
    forcePathStyle: !!cfg.endpoint
  });
  const ext = fs.existsSync(fileBase + '.db') ? '.db' : '.sql';
  const key = `${cfg.pathPrefix || 'dockdo-backups'}/${name}${ext}`;
  const body = fs.readFileSync(fileBase + ext);
  await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body }));
  if (fs.existsSync(fileBase + '.settings.json')) {
    await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key + '.json', Body: fs.readFileSync(fileBase + '.settings.json') }));
  }
  return { key, size: body.length };
}

async function writeSmb(target: BackupTarget, fileBase: string, name: string): Promise<{ file: string; size: number }> {
  const cfg = (target.config || {}) as TargetConfig;
  const ext = fs.existsSync(fileBase + '.db') ? '.db' : '.sql';
  const remote = `//${cfg.host}/${cfg.share}/dockdo-backups`;
  const final = `${name}${ext}`;
  const pass = cfg.password ? `-U${cfg.domain ? cfg.domain + '\\' : ''}${cfg.username}%${cfg.password}` : `-N -U${cfg.username}`;
  await execFileP('smbclient', [remote, ...pass.split(' '), '-c', `mkdir dockdo-backups; cd dockdo-backups; put "${fileBase + ext}" "${final}"; put "${fileBase + '.settings.json'}" "${final}.json"`], { timeout: 120000 }).catch(async (err) => {
    await logAppEvent('error', 'backup', 'SMB put failed', { error: String(err) });
    throw new Error('SMB-Übertragung fehlgeschlagen: ' + String(err));
  });
  return { file: final, size: fs.statSync(fileBase + ext).size };
}

export async function runBackup(jobId: string | null, targetId: string, manualBy?: string): Promise<BackupJob | null> {
  const jobRow = jobId ? await getDb().select().from(backupJobs).where(eq(backupJobs.id, jobId)).limit(1).then((r) => r[0]) : null;
  const target = await getDb().select().from(backupTargets).where(eq(backupTargets.id, targetId)).limit(1).then((r) => r[0]);
  if (!target) throw new Error('Backup-Ziel nicht gefunden.');
  if (!target.enabled) throw new Error('Backup-Ziel ist deaktiviert.');
  const cfg = loadConfig();
  const { file: fileBase, tempDir } = await produceDump(cfg.dataDir);
  const name = `dockdo-${stamp()}`;
  const backupId = uuid();
  try {
    let remote: { file?: string; key?: string; size: number };
    if (target.type === 'local') remote = await writeLocal(target, fileBase, name);
    else if (target.type === 's3') remote = await writeS3(target, fileBase, name);
    else remote = await writeSmb(target, fileBase, name);
    await getDb().insert(backups).values({
      id: backupId, jobId: jobId || null, targetId,
      filename: remote.file || remote.key || name, size: remote.size, status: 'ok',
      meta: { mode: cfg.dbMode, backupId }, createdAt: nowIso()
    });
    if (jobRow) {
      await getDb().update(backupJobs).set({ lastRunAt: nowIso(), lastStatus: 'ok', lastError: null }).where(eq(backupJobs.id, jobRow.id));
    }
    if (jobRow && jobRow.retention) await applyRetention(target, jobRow, jobRow.retention);
    await logAppEvent('info', 'backup', `Backup erfolgreich: ${remote.file || remote.key} (${remote.size} B)`, { targetId, jobId });
    if (manualBy) await audit({ id: manualBy, email: '' }, 'backup:created-manual', 'backup', backupId, { targetId, filename: remote.file || remote.key }, undefined);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAppEvent('error', 'backup', `Backup fehlgeschlagen: ${msg}`, { targetId, jobId });
    if (jobRow) {
      await getDb().update(backupJobs).set({ lastRunAt: nowIso(), lastStatus: 'error', lastError: msg.slice(0, 500) }).where(eq(backupJobs.id, jobRow.id));
    }
    throw err;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export interface Retention { daily: number; weekly: number; monthly: number }

export async function applyRetention(target: BackupTarget, job: BackupJob, retention: Retention): Promise<void> {
  const rows = await getDb()
    .select()
    .from(backups)
    .where(eq(backups.targetId, target.id))
    .orderBy(desc(backups.createdAt));
  const keep = new Set<string>();
  const now = new Date();
  for (const rule of [['daily', retention.daily], ['weekly', retention.weekly], ['monthly', retention.monthly]] as [string, number][]) {
    const [kind, n] = rule;
    if (!n) continue;
    let taken = 0;
    for (const b of rows) {
      const d = new Date(b.createdAt);
      const ageDays = (now.getTime() - d.getTime()) / 86400000;
      const qualified = kind === 'daily' ? ageDays <= 32 : kind === 'weekly' ? ageDays <= 240 : true;
      if (!qualified) continue;
      if (taken < n) {
        keep.add(b.id);
        taken++;
      }
    }
  }
  for (const b of rows) {
    if (!keep.has(b.id)) {
      try {
        await deleteRemoteFile(target, b.filename);
      } catch (err) {
        await logAppEvent('warn', 'backup', 'Retention-Delete fehlgeschlagen', { filename: b.filename, error: String(err) });
      }
      await getDb().delete(backups).where(eq(backups.id, b.id));
    }
  }
}

async function deleteRemoteFile(target: BackupTarget, filename: string): Promise<void> {
  const cfg = (target.config || {}) as TargetConfig;
  if (target.type === 'local') {
    fs.rmSync(path.resolve(cfg.path || './data/backups', filename), { force: true });
    fs.rmSync(path.resolve(cfg.path || './data/backups', filename + '.json'), { force: true });
    return;
  }
  if (target.type === 's3') {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: cfg.endpoint || undefined,
      region: cfg.region || 'us-east-1',
      credentials: { accessKeyId: cfg.accessKeyId || '', secretAccessKey: cfg.secretAccessKey || '' },
      forcePathStyle: !!cfg.endpoint
    });
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: filename }));
    return;
  }
  await execFileP('smbclient', [`//${cfg.host}/${cfg.share}`, `-U${cfg.domain ? cfg.domain + '\\' : ''}${cfg.username}%${cfg.password}`, '-c', `cd dockdo-backups; del "${filename}"`], { timeout: 60000 });
}

export function cleanupRestoreTmp(): void {
  try {
    const cfg = loadConfig();
    if (!fs.existsSync(cfg.dataDir)) return;
    for (const dir of fs.readdirSync(cfg.dataDir)) {
      if (dir.startsWith('.restore-tmp-')) fs.rmSync(path.join(cfg.dataDir, dir), { recursive: true, force: true });
      if (dir.startsWith('.backup-tmp-')) fs.rmSync(path.join(cfg.dataDir, dir), { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
}

interface RunnableRestore {
  unique: string;
  run: () => Promise<void>;
}

async function buildRestore(backupId: string): Promise<RunnableRestore> {
  const backup = await getDb().select().from(backups).where(eq(backups.id, backupId)).limit(1).then((r) => r[0]);
  if (!backup) throw new Error('Backup nicht gefunden.');
  const target = await getDb().select().from(backupTargets).where(eq(backupTargets.id, backup.targetId)).limit(1).then((r) => r[0]);
  if (!target) throw new Error('Backup-Ziel nicht gefunden.');
  const cfg = loadConfig();
  const tmpDir = fs.mkdtempSync(path.join(cfg.dataDir, '.restore-tmp-'));
  let localPath: string;
  if (target.type === 'local') {
    const dir = path.resolve((target.config as TargetConfig).path || './data/backups');
    localPath = path.isAbsolute(backup.filename) ? backup.filename : path.join(dir, backup.filename);
    if (!fs.existsSync(localPath)) throw new Error('Backup-Datei existiert nicht mehr.');
  } else if (target.type === 's3') {
    const tcfg = target.config as TargetConfig;
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      endpoint: tcfg.endpoint || undefined,
      region: tcfg.region || 'us-east-1',
      credentials: { accessKeyId: tcfg.accessKeyId || '', secretAccessKey: tcfg.secretAccessKey || '' },
      forcePathStyle: !!tcfg.endpoint
    });
    const res = await client.send(new GetObjectCommand({ Bucket: tcfg.bucket, Key: backup.filename }));
    localPath = path.join(tmpDir, backup.filename);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const stream: any = res.Body;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    fs.writeFileSync(localPath, Buffer.concat(chunks));
  } else {
    const tcfg = target.config as TargetConfig;
    await execFileP('smbclient', [`//${tcfg.host}/${tcfg.share}`, `-U${tcfg.domain ? tcfg.domain + '\\' : ''}${tcfg.username}%${tcfg.password}`, '-c', `cd dockdo-backups; get "${backup.filename}" "${path.join(tmpDir, 'dl-backup')}"`], { timeout: 300000 });
    localPath = path.join(tmpDir, 'dl-backup');
  }
  const isDb = backup.filename.endsWith('.db');
  if (!isDb && !backup.filename.endsWith('.sql')) {
    const raw = fs.readFileSync(localPath, 'utf-8');
    if (!raw.includes('CREATE TABLE')) throw new Error('Datei sieht nicht wie ein DockDo-Backup aus.');
  }
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    unique,
    run: async () => {
      const pre = path.join(cfg.dataDir, `.pre-restore-${unique}.db`);
      if (cfg.dbMode === 'sqlite') {
        const { default: Database } = await import('better-sqlite3');
        const { reopenDatabase, sqliteDbPath: dbPathOf } = await import('@dockdo/shared');
        const dbPath = dbPathOf(cfg.dataDir);
        const src = new Database(sqliteDbPath(cfg.dataDir), { readonly: true });
        try {
          await src.backup(pre);
        } finally {
          src.close();
        }
        const live = (getHandle().db as unknown as { session: { client: import('better-sqlite3').Database } }).session.client;
        try {
          live.pragma('journal_mode = WAL');
          live.pragma('wal_checkpoint(TRUNCATE)');
          live.close();
        } catch {
          /* ignore */
        }
        try {
          fs.rmSync(dbPath + '-wal', { force: true });
          fs.rmSync(dbPath + '-shm', { force: true });
        } catch {
          throw new Error('Journal-Dateien der Datenbank werden noch von laufenden Prozessen gehalten. Bitte App- und Admin-Server stoppen, bevor eine Wiederherstellung durchgeführt wird.');
        }
        fs.copyFileSync(localPath, dbPath);
        await reopenDatabase('admin');
      } else {
        const mysql = (await import('mysql2/promise')).default;
        const conn = await mysql.createConnection({
          host: cfg.mariadb.host, port: cfg.mariadb.port,
          database: cfg.mariadb.database, user: cfg.mariadb.user, password: cfg.mariadb.password
        });
        const sqlText = fs.readFileSync(localPath, 'utf-8');
        const statements = sqlText.split(';\n').map((s) => s.trim()).filter((s) => s.length > 5);
        for (const stmt of statements) {
          if (/^CREATE TABLE/i.test(stmt)) {
            const m = stmt.match(/CREATE TABLE `?(\w+)`?/);
            if (m) await conn.query(`DROP TABLE IF EXISTS \`${m[1]}\``);
          }
        }
        for (const stmt of statements) await conn.query(stmt);
        await conn.end();
      }
    }
  };
}

export async function restoreBackup(backupId: string, actor: { id: string; email: string }): Promise<void> {
  const runner = await buildRestore(backupId);
  await runner.run();
  await audit(actor, 'backup:restored', 'backup', backupId, { unique: runner.unique }, undefined);
  await logAppEvent('info', 'backup', `Restore durchgeführt (Backup ${backupId})`, {});
}
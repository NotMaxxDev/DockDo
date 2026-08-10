import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  getDb, themes, audit, nowIso, uuid, setSetting, publishSyncEvent,
  defaultThemeConfig, type ThemeConfig
} from '@dockdo/shared';
import { requireAdmin } from '../gateway';

export function registerThemeRoutes(app: FastifyInstance): void {
  app.get('/api/admin/themes', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await getDb().select().from(themes).orderBy(themes.createdAt);
    return rows.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault, enabled: t.enabled, config: t.config, createdAt: t.createdAt, updatedAt: t.updatedAt }));
  });

  app.post('/api/admin/themes', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { name?: string; config?: Partial<ThemeConfig>; enabled?: boolean };
    if (!body.name || !body.name.trim()) return reply.status(400).send({ error: 'Name erforderlich.' });
    const id = uuid();
    const ts = nowIso();
    const cfg: ThemeConfig = { ...defaultThemeConfig(), ...(body.config || {}) };
    await getDb().insert(themes).values({
      id, name: body.name.trim(), isDefault: false,
      enabled: body.enabled ?? true, config: cfg, createdAt: ts, updatedAt: ts
    });
    await audit(req.user!, 'theme:created', 'theme', id, { name: body.name.trim() }, req.clientIp);
    return { id, name: body.name.trim(), isDefault: false, enabled: body.enabled ?? true, config: cfg, createdAt: ts, updatedAt: ts };
  });

  app.put('/api/admin/themes/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const theme = await getDb().select().from(themes).where(eq(themes.id, id)).limit(1).then((r) => r[0]);
    if (!theme) return reply.status(404).send({ error: 'Theme nicht gefunden.' });
    const body = req.body as { name?: string; config?: Partial<ThemeConfig>; enabled?: boolean; isDefault?: boolean };
    const update: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.name) update.name = body.name.trim();
    if (body.config) update.config = { ...theme.config, ...body.config };
    if (body.enabled !== undefined) update.enabled = !!body.enabled;
    if (body.isDefault === true) {
      await getDb().update(themes).set({ isDefault: false }).where(eq(themes.isDefault, true));
      update.isDefault = true;
    }
    await getDb().update(themes).set(update).where(eq(themes.id, id));
    await audit(req.user!, 'theme:updated', 'theme', id, { fields: Object.keys(update) }, req.clientIp);
    await publishSyncEvent('system:theme-changed', { themeId: id });
    const fresh = await getDb().select().from(themes).where(eq(themes.id, id)).limit(1).then((r) => r[0]);
    return { ok: true, theme: fresh };
  });

  app.post('/api/admin/themes/:id/duplicate', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const theme = await getDb().select().from(themes).where(eq(themes.id, id)).limit(1).then((r) => r[0]);
    if (!theme) return reply.status(404).send({ error: 'Theme nicht gefunden.' });
    const ts = nowIso();
    await getDb().insert(themes).values({
      id: uuid(), name: `${theme.name} (Kopie)`, isDefault: false, enabled: theme.enabled,
      config: theme.config, createdAt: ts, updatedAt: ts
    });
    await audit(req.user!, 'theme:duplicated', 'theme', id, {}, req.clientIp);
    return { ok: true };
  });

  app.delete('/api/admin/themes/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const theme = await getDb().select().from(themes).where(eq(themes.id, id)).limit(1).then((r) => r[0]);
    if (!theme) return reply.status(404).send({ error: 'Theme nicht gefunden.' });
    if (theme.isDefault) {
      const others = await getDb().select().from(themes).where(eq(themes.enabled, true));
      if (others.length <= 1) return reply.status(400).send({ error: 'Das Standard-Theme kann nicht gelöscht werden.' });
      await getDb().update(themes).set({ isDefault: false }).where(eq(themes.isDefault, true));
      await getDb().update(themes).set({ isDefault: true }).where(eq(themes.id, others.find((o) => o.id !== id)!.id));
    }
    await getDb().delete(themes).where(eq(themes.id, id));
    await audit(req.user!, 'theme:deleted', 'theme', id, {}, req.clientIp);
    return { ok: true };
  });

  app.get('/api/admin/themes/:id/export', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const theme = await getDb().select().from(themes).where(eq(themes.id, id)).limit(1).then((r) => r[0]);
    if (!theme) return reply.status(404).send({ error: 'Theme nicht gefunden.' });
    reply.header('Content-Disposition', `attachment; filename="theme-${theme.id}.json"`);
    return reply.send(JSON.stringify({ name: theme.name, config: theme.config }, null, 2));
  });

  app.post('/api/admin/themes/import', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = req.body as { name?: string; config?: Partial<ThemeConfig> };
    if (!body.config || typeof body.config !== 'object') return reply.status(400).send({ error: 'Ungültiges Theme-JSON.' });
    const cfg: ThemeConfig = { ...defaultThemeConfig(), ...body.config };
    const ts = nowIso();
    const id = uuid();
    await getDb().insert(themes).values({
      id, name: body.name?.trim() || 'Importiertes Theme', isDefault: false, enabled: false,
      config: cfg, createdAt: ts, updatedAt: ts
    });
    await audit(req.user!, 'theme:imported', 'theme', id, { name: body.name }, req.clientIp);
    return { ok: true, id };
  });
}
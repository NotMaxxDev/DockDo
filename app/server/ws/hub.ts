import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, gt } from 'drizzle-orm';
import { getDb, syncEvents, users } from '@dockdo/shared';
import type { WebSocket } from 'ws';
import { getSessionTokenFromCookie } from '@dockdo/shared';

interface ClientConn {
  socket: WebSocket;
  userId: string;
  userName: string;
  listIds: Set<string>;
}
const rooms = new Map<string, Set<ClientConn>>();
const clients = new Set<ClientConn>();

export function registerWs(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket: WebSocket, req: FastifyRequest) => {
    const token = getSessionTokenFromCookie(req.headers.cookie);
    if (!token) return socket.close(4001, 'unauthorized');
    void (async () => {
      try {
        const { findSessionByToken } = await import('@dockdo/shared');
        const found = await findSessionByToken(token);
        if (!found) return socket.close(4001, 'unauthorized');
        const conn: ClientConn = { socket, userId: found.user.id, userName: found.user.name, listIds: new Set() };
        clients.add(conn);
        socket.on('message', (raw: Buffer) => {
          void handleMessage(app, conn, raw.toString());
        });
        socket.on('close', () => {
          clients.delete(conn);
          for (const listId of conn.listIds) {
            leaveRoom(conn, listId);
          }
        });
        socket.send(JSON.stringify({ type: 'hello', userId: found.user.id }));
      } catch {
        socket.close(4001, 'unauthorized');
      }
    })();
  });

  void startSyncPolling(app);
}

async function handleMessage(app: FastifyInstance, conn: ClientConn, raw: string): Promise<void> {
  let msg: { type?: string; listId?: string };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === 'subscribe' && msg.listId) {
    const { getListMembership } = await import('../permissions');
    const membership = await getListMembership(msg.listId, conn.userId);
    if (!membership) {
      conn.socket.send(JSON.stringify({ type: 'error', code: 'forbidden' }));
      return;
    }
    if (!conn.listIds.has(msg.listId)) {
      conn.listIds.add(msg.listId);
      const room = roomFor(msg.listId);
      room.add(conn);
      broadcastPresence(msg.listId);
    }
  }
  if (msg.type === 'unsubscribe' && msg.listId) {
    conn.listIds.delete(msg.listId);
    leaveRoom(conn, msg.listId);
  }
}

function roomFor(listId: string): Set<ClientConn> {
  let room = rooms.get(listId);
  if (!room) {
    room = new Set();
    rooms.set(listId, room);
  }
  return room;
}

function leaveRoom(conn: ClientConn, listId: string): void {
  const room = rooms.get(listId);
  if (room) {
    room.delete(conn);
    broadcastPresence(listId);
  }
}

function broadcastPresence(listId: string): void {
  const room = rooms.get(listId);
  if (!room) return;
  const payload = JSON.stringify({
    type: 'presence',
    listId,
    users: [...room].map((c) => ({ userId: c.userId, name: c.userName }))
  });
  for (const c of room) {
    c.socket.send(payload);
  }
}

export function broadcastToList(listId: string, type: string, payload: unknown): void {
  const room = rooms.get(listId);
  if (!room) return;
  const msg = JSON.stringify({ type, ...(payload as Record<string, unknown>) });
  for (const c of room) {
    c.socket.send(msg);
  }
}

class SyncPoller {
  private lastId = 0;
  private timer: NodeJS.Timeout | null = null;

  async poll(app: FastifyInstance): Promise<void> {
    try {
      const rows = await getDb()
        .select()
        .from(syncEvents)
        .where(gt(syncEvents.id, this.lastId))
        .orderBy(syncEvents.id)
        .limit(100);
      for (const ev of rows) {
        try {
          await this.dispatch(app, ev.type, ev.payload);
        } catch (err) {
          console.error('sync event dispatch failed', err);
        }
        this.lastId = Math.max(this.lastId, ev.id);
      }
    } catch {
      /* db busy */
    }
  }

  private async dispatch(app: FastifyInstance, type: string, payload: Record<string, unknown> | null): Promise<void> {
    const p = payload || {};
    const listId = String(p.listId || '');
    if (!listId) return;
    switch (type) {
      case 'task:created':
      case 'task:updated':
      case 'task:deleted':
      case 'task:reordered':
      case 'task:comment':
        broadcastToList(listId, type, p);
        return;
      case 'list:updated':
      case 'list:deleted':
      case 'list:shared':
      case 'list:member-role':
      case 'list:member-removed':
        broadcastToList(listId, type, p);
        return;
      case 'list:created':
      case 'system:theme-changed':
      case 'user:suspended':
      case 'user:activated': {
        const targetUserId = String(p.userId || '');
        const msg = JSON.stringify({ type, payload: p });
        for (const c of clients) {
          if (c.userId === targetUserId || type === 'system:theme-changed') c.socket.send(msg);
        }
        return;
      }
      case 'system:db-restarted':
        for (const c of clients) c.socket.send(JSON.stringify({ type, payload: p }));
        return;
    }
  }

  start(app: FastifyInstance): void {
    this.timer = setInterval(() => void this.poll(app), 1500);
    void this.poll(app);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

export const syncPoller = new SyncPoller();

export function startSyncPolling(app: FastifyInstance): void {
  syncPoller.start(app);
}

export function wsConnectionsCount(): number {
  return clients.size;
}

export async function broadcastSystemEvent(app: FastifyInstance, type: string, payload: Record<string, unknown>): Promise<void> {
  const msg = JSON.stringify({ type, payload });
  for (const c of clients) {
    c.socket.send(msg);
  }
}

export async function closeClientSockets(userId: string): Promise<void> {
  for (const c of clients) {
    if (c.userId === userId) {
      try {
        c.socket.close(4003, 'session revoked');
      } catch {
        /* ignore */
      }
    }
  }
}
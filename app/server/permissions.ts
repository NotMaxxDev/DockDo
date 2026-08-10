import { and, eq } from 'drizzle-orm';
import { getDb, listMembers, lists, type ListRole } from '@dockdo/shared';

export async function getListMembership(listId: string, userId: string): Promise<{ role: ListRole } | null> {
  const row = await getDb()
    .select()
    .from(listMembers)
    .where(and(eq(listMembers.listId, listId), eq(listMembers.userId, userId)))
    .limit(1)
    .then((r) => r[0]);
  return row ? { role: row.role } : null;
}

export async function assertListAccess(
  listId: string,
  userId: string,
  minRole: ListRole
): Promise<{ role: ListRole } | null> {
  return getListMembership(listId, userId);
}

export function roleRank(role: ListRole): number {
  return { owner: 3, editor: 2, viewer: 1 }[role] || 0;
}

export function canEditByRole(role: ListRole | undefined): boolean {
  return !!role && roleRank(role) >= 2;
}

export function canAdminByRole(role: ListRole | undefined): boolean {
  return !!role && roleRank(role) >= 3;
}

export async function listExists(listId: string): Promise<boolean> {
  const row = await getDb().select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).limit(1).then((r) => r[0]);
  return !!row;
}
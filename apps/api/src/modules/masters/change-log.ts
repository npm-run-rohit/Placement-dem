import { type DataSource, type EntityManager, In } from 'typeorm';
import type { MasterChangeView } from '@bimaplacement/contracts';
import type { AuthUser } from '../../common/auth/auth.types';
import { MasterChangeLog } from '../insurers/entities/master-change-log.entity';
import { User } from '../users/user.entity';

/** One before/after row in master_change_log (FR-148), written in the same transaction as the edit. */
export function recordChange(
  m: EntityManager,
  user: AuthUser,
  entry: {
    entityType: string;
    entityId: string;
    entityLabel: string;
    field: string;
    before: unknown;
    after: unknown;
  },
) {
  return m.getRepository(MasterChangeLog).insert({
    ...entry,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    changedBy: user.id,
  });
}

/** Newest first, optionally limited to some entity types, with the editor's name resolved. */
export async function changeViews(
  ds: DataSource,
  opts: { types?: string[]; limit?: number } = {},
): Promise<MasterChangeView[]> {
  const rows = await ds.getRepository(MasterChangeLog).find({
    where: opts.types ? { entityType: In(opts.types) } : {},
    order: { changedAt: 'DESC' },
    take: opts.limit ?? 100,
  });
  const users = rows.length
    ? await ds.getRepository(User).findBy({ id: In([...new Set(rows.map((r) => r.changedBy))]) })
    : [];
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityLabel: r.entityLabel,
    field: r.field,
    before: r.before,
    after: r.after,
    changedBy: users.find((u) => u.id === r.changedBy)?.name ?? 'Unknown',
    changedAt: r.changedAt.toISOString(),
  }));
}

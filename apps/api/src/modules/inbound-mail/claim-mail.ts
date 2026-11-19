import type { EntityManager } from 'typeorm';
import type { InboundClass } from '@bimaplacement/contracts';
import { InboundMail } from './entities/inbound-mail.entity';

/**
 * Claims an inbound mail for its effect: sets appliedClass only while it is still null, inside the caller's
 * transaction, so the marker commits together with the effect and a concurrent or repeated apply sees 0 rows
 * (the row lock makes the second caller wait for the first to commit). False = already applied: skip the effect.
 */
export async function claimInboundMail(
  manager: EntityManager,
  claim: { id: string; label: InboundClass },
  at: Date,
): Promise<boolean> {
  const res = await manager
    .getRepository(InboundMail)
    .createQueryBuilder()
    .update(InboundMail)
    .set({ appliedClass: claim.label, processedAt: at })
    .where('id = :id AND applied_class IS NULL', { id: claim.id })
    .execute();
  return (res.affected ?? 0) > 0;
}

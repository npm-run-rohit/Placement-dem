import type { AuditEventView } from '@bimaplacement/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RequestContext } from '../../common/context/request-context';
import { AuditEvent } from './audit-event.entity';
import type { Actor } from './actor';

export interface AuditInput {
  ticketId?: string | null;
  entityType: string;
  entityId: string;
  event: string;
  detail?: string;
  before?: unknown;
  after?: unknown;
  /** business time (engine clock); defaults to the DB clock */
  at?: Date;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditEvent) private readonly repo: Repository<AuditEvent>) {}

  /** Write inside the caller's transaction so audit is never lost (10.2) nor written for a rollback. */
  async record(manager: EntityManager, actor: Actor, input: AuditInput): Promise<void> {
    await manager.getRepository(AuditEvent).insert({
      ticketId: input.ticketId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      event: input.event,
      detail: input.detail ?? '',
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      ...(input.at ? { at: input.at } : {}),
      correlationId: RequestContext.get()?.correlationId ?? null,
    });
  }

  /** Audit Trail tab; filter by actor type (All / You / Insurers / RM / System). */
  async forTicket(ticketId: string, actorTypes?: string[]) {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.ticket_id = :ticketId', { ticketId })
      .orderBy('a.at', 'DESC');
    if (actorTypes?.length) qb.andWhere('a.actor_type IN (:...actorTypes)', { actorTypes });
    const rows = await qb.getMany();
    return rows.map((a): AuditEventView => ({
      id: a.id,
      event: a.event,
      detail: a.detail,
      actorType: a.actorType,
      actorId: a.actorId,
      actorName: a.actorName,
      at: a.at.toISOString(),
    }));
  }
}

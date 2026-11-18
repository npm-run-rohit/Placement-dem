import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { STAGE_META, Stage, type SearchScope, type SearchView } from '@bimaplacement/contracts';
import { isHead, type AuthUser } from '../../common/auth/auth.types';
import { PlacementTicket } from './entities/placement-ticket.entity';
import { TicketReadService } from './ticket-read.service';

const RESULT_LIMIT = 30;
const RECENT_LIMIT = 3;

/**
 * Global search (UI-SPEC 2.5, PLAN 1.8) over the tickets the user can see (FR-208: a PM never finds a
 * Head-owned escalated ticket). Scopes match the prototype: Tickets (number, stage, business type,
 * product), Clients (business name, RM, client SPOC), Insurers (threaded or panel-selected insurers).
 * An empty query returns the most recent tickets, open first.
 */
@Injectable()
export class TicketSearchService {
  constructor(
    private readonly ds: DataSource,
    private readonly read: TicketReadService,
  ) {}

  async search(user: AuthUser, q: string, scopes: SearchScope[]): Promise<SearchView> {
    const term = q.trim();
    const qb = this.ds
      .getRepository(PlacementTicket)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.owner', 'owner');
    if (!isHead(user)) qb.andWhere('t.escalated = false');

    if (!term) {
      qb.orderBy('CASE WHEN t.stage = :closed THEN 1 ELSE 0 END', 'ASC')
        .addOrderBy('t.receivedAt', 'DESC')
        .setParameter('closed', Stage.CLOSED)
        .limit(RECENT_LIMIT);
      return { query: '', recent: true, items: await this.read.listItems(await qb.getMany()) };
    }
    if (!scopes.length) return { query: term, recent: false, items: [] };

    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const ors: string[] = [];
    if (scopes.includes('tickets')) {
      const stages = (Object.keys(STAGE_META) as Stage[]).filter((s) =>
        STAGE_META[s].label.toLowerCase().includes(term.toLowerCase()),
      );
      ors.push(
        't.ticket_no ILIKE :like',
        't.business_type ILIKE :like',
        't.product_type ILIKE :like',
        'EXISTS (SELECT 1 FROM product_types p WHERE p.code = t.product_type AND (p.label ILIKE :like OR p.short_label ILIKE :like))',
      );
      if (stages.length) ors.push('t.stage IN (:...stages)');
      qb.setParameter('stages', stages);
    }
    if (scopes.includes('clients'))
      ors.push('t.business_name ILIKE :like', 't.rm_name ILIKE :like', 't.client_spoc ILIKE :like');
    if (scopes.includes('insurers')) {
      ors.push(
        'EXISTS (SELECT 1 FROM insurer_threads th JOIN insurers i ON i.id = th.insurer_id WHERE th.ticket_id = t.id AND i.name ILIKE :like)',
        'EXISTS (SELECT 1 FROM panel_selections ps JOIN insurers i ON i.id = ps.insurer_id WHERE ps.ticket_id = t.id AND i.name ILIKE :like)',
      );
    }
    qb.andWhere(`(${ors.join(' OR ')})`, { like })
      .orderBy('CASE WHEN t.stage = :closed THEN 1 ELSE 0 END', 'ASC')
      .addOrderBy('t.receivedAt', 'DESC')
      .setParameter('closed', Stage.CLOSED)
      .limit(RESULT_LIMIT);
    return { query: term, recent: false, items: await this.read.listItems(await qb.getMany()) };
  }
}

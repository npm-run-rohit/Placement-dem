import { Injectable } from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';
import {
  MandateRequestStatus,
  MandateType,
  QuoteDecision,
  Stage,
  ThreadStatus,
  type DeskCounts,
  type TicketDetail,
  type TicketListItem,
  type TicketPagerView,
  type UserRef,
} from '@bimaplacement/contracts';
import { isHead, type AuthUser } from '../../common/auth/auth.types';
import { Clock } from '../../common/time/clock';
import { SlaConfigService } from '../sla/sla-config.service';
import { Insurer } from '../insurers/entities/insurer.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { threadRemainingMins } from '../threads/thread-clock';
import { User } from '../users/user.entity';
import { PlacementTicket } from './entities/placement-ticket.entity';
import { TicketWorkflow } from './ticket-workflow.service';
import { nextAction } from './domain/next-action';
import { slaClockView } from './domain/sla-view';
import { deskCounts } from './domain/desk-counts';

type MandateState = TicketListItem['mandateState'];

/**
 * Read models for the queue, header and rail (contracts TicketListItem / TicketDetail): live SLA clock
 * in business minutes, usable-quote count (distinct insurers on the active RFQ, BR-061), mandate state
 * and the next action. Read-only - never mutates a ticket.
 */
@Injectable()
export class TicketReadService {
  constructor(
    private readonly ds: DataSource,
    private readonly sla: SlaConfigService,
    private readonly clock: Clock,
    private readonly workflow: TicketWorkflow,
  ) {}

  async listItems(tickets: PlacementTicket[]): Promise<TicketListItem[]> {
    if (!tickets.length) return [];
    const ids = tickets.map((t) => t.id);
    const now = this.clock.now();
    const [usable, mandates] = await Promise.all([this.usableCounts(ids), this.mandateStates(ids)]);
    return tickets.map((t) => ({
      id: t.id,
      ticketNo: t.ticketNo,
      stage: t.stage,
      internalStatus: t.internalStatus,
      rmStatus: t.rmStatus,
      businessType: t.businessType,
      urgency: t.urgency,
      businessName: t.businessName,
      productType: t.productType,
      owner: userRef(t.owner, t.ownerId),
      receivedAt: t.receivedAt.toISOString(),
      sla: slaClockView(t, this.sla.calendar, now),
      usableQuoteCount: usable.get(t.id) ?? 0,
      mandateState: mandates.get(t.id) ?? 'none',
      outcome: t.outcomeType,
    }));
  }

  async detail(t: PlacementTicket): Promise<TicketDetail> {
    const [item] = await this.listItems([t]);
    const users = await this.ds
      .getRepository(User)
      .find({ where: { id: In([t.createdById, t.rmUserId].filter((x): x is string => !!x)) } });
    const snapshot = await this.workflow.loadSnapshot(this.ds.manager, t);
    const threadHints = await this.threadHints(t);
    return {
      ...item,
      channel: t.channel,
      bimasetuLineRef: t.bimasetuLineRef,
      rm: {
        id: t.rmUserId ?? '',
        name: t.rmName,
        email: t.rmEmail,
        avatarUrl: users.find((u) => u.id === t.rmUserId)?.avatarUrl ?? null,
      },
      createdBy: t.createdById
        ? userRef(
            users.find((u) => u.id === t.createdById),
            t.createdById,
          )
        : { id: '', name: 'BimaSetu' },
      industryType: t.industryType,
      renewalDate: t.renewalDate,
      incumbentInsurer: t.incumbentInsurerText,
      clientSpoc: t.clientSpoc,
      targetPremium: t.targetPremium,
      riskTier: t.riskTier,
      activeRfqVersion: t.activeRfqVersion,
      qcrRound: t.qcrRound,
      panelLocked: t.panelLocked,
      followUpsStopped: t.followUpsStopped,
      escalated: t.escalated,
      nextAction: nextAction(snapshot, threadHints),
      float: t.bimasetuLineRef
        ? {
            lineRef: t.bimasetuLineRef,
            exclusiveMandate: t.floatPayload?.exclusiveMandate === true,
            noteToPlacement: t.noteToPlacement,
          }
        : null,
      outcomeDetail: t.outcome
        ? {
            reason: t.outcome.reason ?? null,
            insurerName: t.outcome.insurerId
              ? ((await this.ds.getRepository(Insurer).findOneBy({ id: t.outcome.insurerId }))?.name ?? null)
              : null,
            premium: t.outcome.premium ?? null,
            qcrVersion: t.outcome.qcrVersion ?? null,
            decidedBy: t.outcome.decidedBy,
            source: t.outcome.source,
            closedAt: t.closedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * Home desk cards (FR-226, FR-271) over open tickets in scope: the Head's Team view is every open
   * ticket, Me is what they own (FR-209); a PM's desk is their own non-escalated tickets (FR-208).
   */
  async deskCounts(user: AuthUser, scope: 'me' | 'team'): Promise<DeskCounts> {
    const qb = this.ds
      .getRepository(PlacementTicket)
      .createQueryBuilder('t')
      .where('t.stage <> :closed', { closed: Stage.CLOSED });
    if (!isHead(user) || scope === 'me') qb.andWhere('t.owner_id = :me', { me: user.id });
    if (!isHead(user)) qb.andWhere('t.escalated = false');
    const tickets = await qb.getMany();
    if (!tickets.length) return deskCounts([], this.sla.thresholds.dueSoonBusinessMins);
    const ids = tickets.map((t) => t.id);
    const threads: Array<{ ticket_id: string; insurer: boolean; rm: boolean }> = await this.ds.query(
      `SELECT th.ticket_id, bool_or(th.status = ANY($2)) AS insurer, bool_or(th.status = $3) AS rm
         FROM insurer_threads th JOIN placement_tickets t ON t.id = th.ticket_id
        WHERE th.ticket_id = ANY($1) AND th.rfq_version = t.active_rfq_version
        GROUP BY th.ticket_id`,
      [ids, [ThreadStatus.RFQ_SENT, ThreadStatus.ACKNOWLEDGED], ThreadStatus.AWAITING_RM],
    );
    const pending: Array<{ ticket_id: string }> = await this.ds.query(
      `SELECT DISTINCT q.ticket_id FROM quotes q JOIN placement_tickets t ON t.id = q.ticket_id
        WHERE q.ticket_id = ANY($1) AND q.decision IS NULL AND q.rfq_version = t.active_rfq_version`,
      [ids],
    );
    const byTicket = new Map(threads.map((r) => [r.ticket_id, r]));
    const toReview = new Set(pending.map((r) => r.ticket_id));
    const now = this.clock.now();
    return deskCounts(
      tickets.map((t) => ({
        waitingOnInsurer: !!byTicket.get(t.id)?.insurer,
        waitingOnRm: t.stage === Stage.AWAITING_RM || !!byTicket.get(t.id)?.rm,
        quotesToReview: toReview.has(t.id),
        sla: slaClockView(t, this.sla.calendar, now),
      })),
      this.sla.thresholds.dueSoonBusinessMins,
    );
  }

  /** Home "Escalated to You" (FR-207): open tickets the SLA-P1 ladder moved to this Placement Head, most overdue first. */
  async escalatedTo(user: AuthUser): Promise<TicketListItem[]> {
    if (!isHead(user)) return [];
    const tickets = await this.ds.getRepository(PlacementTicket).find({
      where: { escalated: true, ownerId: user.id, stage: Not(Stage.CLOSED) },
      relations: { owner: true },
      order: { slaDueAt: 'ASC' },
    });
    return this.listItems(tickets);
  }

  /**
   * Breadcrumb pager (UI-SPEC 2.1): open tickets the user can see plus the current one, in urgency order -
   * Placement-owned clocks first (soonest due first), then clocks waiting on others, then no clock.
   * A PM never steps onto a Head-owned escalated ticket (FR-208).
   */
  async pager(user: AuthUser, current: PlacementTicket): Promise<TicketPagerView> {
    const rows: Array<{ ticket_no: string }> = await this.ds.query(
      `SELECT ticket_no FROM placement_tickets t
        WHERE (t.stage <> $1 OR t.id = $2) AND ($3 OR t.escalated = false OR t.id = $2)
        ORDER BY CASE WHEN t.sla_owner_type = 'internal' THEN 0 WHEN t.sla_due_at IS NOT NULL THEN 1 ELSE 2 END, t.sla_due_at ASC NULLS LAST, t.ticket_no`,
      [Stage.CLOSED, current.id, isHead(user)],
    );
    const nos = rows.map((r) => r.ticket_no);
    const i = nos.indexOf(current.ticketNo);
    return {
      prev: i > 0 ? nos[i - 1] : null,
      next: i >= 0 && i < nos.length - 1 ? nos[i + 1] : null,
      position: i + 1,
      total: nos.length,
    };
  }

  /** Usable quotes from distinct insurer companies on the active RFQ version (threshold count, BR-061). */
  private async usableCounts(ids: string[]): Promise<Map<string, number>> {
    const rows: Array<{ ticket_id: string; n: number }> = await this.ds.query(
      `SELECT q.ticket_id, count(DISTINCT q.insurer_id)::int AS n
         FROM quotes q JOIN placement_tickets t ON t.id = q.ticket_id
        WHERE q.ticket_id = ANY($1) AND q.decision = $2 AND q.rfq_version = t.active_rfq_version
        GROUP BY q.ticket_id`,
      [ids, QuoteDecision.USABLE],
    );
    return new Map(rows.map((r) => [r.ticket_id, r.n]));
  }

  /** signed (Exclusive Placement Mandate on file) > open request status > last request declined > none. */
  private async mandateStates(ids: string[]): Promise<Map<string, MandateState>> {
    const signed: Array<{ ticket_id: string }> = await this.ds.query(
      `SELECT DISTINCT ticket_id FROM mandates WHERE ticket_id = ANY($1) AND type = $2`,
      [ids, MandateType.EXCLUSIVE_PLACEMENT],
    );
    const latest: Array<{ ticket_id: string; status: MandateRequestStatus }> = await this.ds.query(
      `SELECT DISTINCT ON (ticket_id) ticket_id, status FROM mandate_requests WHERE ticket_id = ANY($1) ORDER BY ticket_id, requested_at DESC`,
      [ids],
    );
    const out = new Map<string, MandateState>();
    for (const r of latest) {
      if (
        r.status === MandateRequestStatus.REQUESTED ||
        r.status === MandateRequestStatus.CONSIDERING ||
        r.status === MandateRequestStatus.DECLINED
      )
        out.set(r.ticket_id, r.status);
    }
    for (const r of signed) out.set(r.ticket_id, 'signed');
    return out;
  }

  /** Thread-level inputs to the next action: a clarification waiting on the PM, or an insurer clock past due. */
  private async threadHints(t: PlacementTicket) {
    const threads = await this.ds
      .getRepository(InsurerThread)
      .find({ where: { ticketId: t.id, rfqVersion: t.activeRfqVersion }, order: { threadRef: 'ASC' } });
    if (!threads.length) return {};
    const names = new Map(
      (await this.ds.getRepository(Insurer).find({ where: { id: In(threads.map((x) => x.insurerId)) } })).map(
        (i) => [i.id, i.name],
      ),
    );
    const now = this.clock.now();
    const paused = threads.find((x) => x.status === ThreadStatus.INSURER_CLARIFICATION);
    const breached = threads.find(
      (x) => (threadRemainingMins(this.sla.calendar, x, now, t.followUpsStopped) ?? 0) < 0,
    );
    return {
      pausedThreadInsurer: paused && names.get(paused.insurerId),
      breachedThreadInsurer: breached && names.get(breached.insurerId),
    };
  }
}

function userRef(
  u: { id: string; name: string; avatarUrl?: string | null } | null | undefined,
  fallbackId: string,
): UserRef {
  return u
    ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null }
    : { id: fallbackId, name: 'Unknown user', avatarUrl: null };
}

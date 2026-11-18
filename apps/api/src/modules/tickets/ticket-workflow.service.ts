import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  BimaSetuOutboundType,
  Channel,
  CopycatStatus,
  QcrStatus,
  SlaOwnerType,
  Stage,
  TicketCommand,
  formatTicketNo,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import { Clock } from '../../common/time/clock';
import { AuditService, type AuditInput } from '../audit/audit.service';
import type { Actor } from '../audit/actor';
import { OutboxService, type OutboxMessage } from '../../infrastructure/outbox/outbox.service';
import { SlaConfigService } from '../sla/sla-config.service';
import { SlaEvent } from '../sla/sla-event.entity';
import { PlacementTicket } from './entities/placement-ticket.entity';
import { TicketStateMachine } from './domain/ticket-state-machine';
import { deriveStatus } from './domain/status-deriver';
import { resolveTicketSlaId } from './domain/sla-resolver';
import type { TicketSnapshot } from './domain/ticket-snapshot';
import { RfqQuery } from '../rfq/entities/rfq-query.entity';
import { RfqVersion } from '../rfq/entities/rfq-version.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { QcrVersion } from '../qcr/entities/qcr-version.entity';
import { CopycatRequest } from '../qcr/entities/copycat-request.entity';
import { Revision } from '../decisions/entities/revision.entity';
import { resolveQuoteTargetScenario, resolveThreadTargetMins } from '../sla/quote-target.resolver';
import { PRODUCT_TYPES_SEED } from '@bimaplacement/contracts';

export interface WorkflowContext {
  manager: EntityManager;
  ticket: PlacementTicket;
  actor: Actor;
  now: Date;
  /** Move the stage (validated against the transition table). */
  moveTo(stage: Stage, command: TicketCommand): void;
  audit(event: string, detail?: string, extra?: Partial<AuditInput>): Promise<void>;
  outbox(
    msg: Omit<OutboxMessage, 'aggregateType' | 'aggregateId'> &
      Partial<Pick<OutboxMessage, 'aggregateType' | 'aggregateId'>>,
  ): Promise<void>;
}

/**
 * Placement core unit of work - the ONLY way to mutate a ticket (mirrors prototype `patch()`):
 *   BEGIN; SELECT ... FOR UPDATE; guard terminal; run command; re-derive status;
 *   reconcile the single ticket SLA clock; emit stage_changed to BimaSetu if the
 *   desk status changed; publish placement.* bus event; COMMIT.
 * Commands must be idempotent or guarded - workers retry.
 */
@Injectable()
export class TicketWorkflow {
  private readonly logger = new Logger(TicketWorkflow.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly outboxService: OutboxService,
    private readonly sla: SlaConfigService,
    private readonly clock: Clock,
  ) {}

  async run<R>(
    ticketId: string,
    actor: Actor,
    fn: (ctx: WorkflowContext) => Promise<R>,
    opts: { allowTerminal?: boolean } = {},
  ): Promise<R> {
    return this.dataSource.transaction(async (manager) => {
      const ticket = await manager
        .getRepository(PlacementTicket)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :ticketId', { ticketId })
        .getOne();
      if (!ticket) throw DomainError.notFound('Ticket', ticketId);
      if (!opts.allowTerminal) TicketStateMachine.assertMutable(ticket.stage);
      const before = { stage: ticket.stage, internal: ticket.internalStatus };
      const now = this.clock.now();

      const ctx: WorkflowContext = {
        manager,
        ticket,
        actor,
        now,
        moveTo: (stage, command) => {
          TicketStateMachine.assertTransition(ticket.stage, stage, command);
          ticket.stage = stage;
        },
        audit: (event, detail = '', extra = {}) =>
          this.audit.record(manager, actor, {
            ticketId: ticket.id,
            entityType: 'ticket',
            entityId: ticket.id,
            event,
            detail,
            at: now,
            ...extra,
          }),
        outbox: (msg) =>
          this.outboxService.add(manager, {
            aggregateType: 'ticket',
            aggregateId: ticket.id,
            createdAt: now,
            ...msg,
          } as OutboxMessage),
      };

      const result = await fn(ctx);
      await this.afterCommand(ctx, before);
      await manager.getRepository(PlacementTicket).save(ticket);
      return result;
    });
  }

  /** Create a brand-new ticket inside its own transaction and then run the post-command pipeline. */
  async create(
    actor: Actor,
    build: (manager: EntityManager, ticketNo: string, now: Date) => Promise<PlacementTicket>,
    after?: (ctx: WorkflowContext) => Promise<void>,
  ): Promise<PlacementTicket> {
    return this.dataSource.transaction(async (manager) => {
      const [{ nextval }] = await manager.query(`SELECT nextval('placement_ticket_no_seq') AS nextval`);
      const now = this.clock.now();
      const ticket = await build(manager, formatTicketNo(Number(nextval)), now);
      const ctx: WorkflowContext = {
        manager,
        ticket,
        actor,
        now,
        moveTo: () => undefined,
        audit: (event, detail = '', extra = {}) =>
          this.audit.record(manager, actor, {
            ticketId: ticket.id,
            entityType: 'ticket',
            entityId: ticket.id,
            event,
            detail,
            at: now,
            ...extra,
          }),
        outbox: (msg) =>
          this.outboxService.add(manager, {
            aggregateType: 'ticket',
            aggregateId: ticket.id,
            createdAt: now,
            ...msg,
          } as OutboxMessage),
      };
      if (after) await after(ctx);
      await this.afterCommand(ctx, { stage: null, internal: null });
      return manager.getRepository(PlacementTicket).save(ticket);
    });
  }

  private async afterCommand(ctx: WorkflowContext, before: { stage: Stage | null; internal: string | null }) {
    const { ticket, manager, now } = ctx;
    const snapshot = await this.loadSnapshot(manager, ticket);

    // 1) layered status (PRD 5)
    const derived = deriveStatus(snapshot);
    ticket.internalStatus = derived.internal;
    ticket.rmStatus = derived.rm;
    if (ticket.stage === Stage.CLOSED && !ticket.closedAt) ticket.closedAt = now;

    // 2) one active ticket clock; re-anchor at full target when the clock changes (FR-222)
    const slaId = resolveTicketSlaId(snapshot);
    if (slaId !== ticket.slaId) {
      if (ticket.slaId)
        await manager
          .getRepository(SlaEvent)
          .insert({ at: now, ticketId: ticket.id, slaId: ticket.slaId, kind: 'stopped', data: {} as never });
      ticket.slaId = slaId;
      ticket.p1ArmedAt = null; // ladder re-arms on the next internal breach (FR-225)
      ticket.p1RemindersSent = 0;
      ticket.p1EscalatedAt = null;
      if (slaId) {
        const def = this.sla.definitions.get(slaId);
        const targetMins = slaId === 'SLA-06' ? this.threadTargetMins(ticket) : (def?.targetMins ?? 60);
        ticket.slaOwnerType = def?.ownerType ?? SlaOwnerType.INTERNAL;
        ticket.slaAnchorAt = now;
        ticket.slaTargetMins = targetMins;
        ticket.slaDueAt = this.sla.calendar.addMinutes(now, targetMins);
        await manager
          .getRepository(SlaEvent)
          .insert({ at: now, ticketId: ticket.id, slaId, kind: 'started', data: { targetMins } as never });
      } else {
        ticket.slaOwnerType = null;
        ticket.slaAnchorAt = null;
        ticket.slaTargetMins = null;
        ticket.slaDueAt = null;
      }
    }

    // 3) desk-stage sync to BimaSetu (FR-283) + bus event for sibling products
    if (before.internal !== ticket.internalStatus) {
      if (ticket.channel === Channel.BIMASETU && before.internal !== null) {
        await ctx.outbox({
          destination: 'bimasetu',
          eventType: BimaSetuOutboundType.STAGE_CHANGED,
          payload: {
            lineRef: ticket.bimasetuLineRef,
            ticketNo: ticket.ticketNo,
            stage: ticket.internalStatus,
            rmStatus: ticket.rmStatus,
          },
        });
      }
      await ctx.outbox({
        destination: 'bus',
        eventType: 'placement.stage_changed',
        payload: {
          ticketNo: ticket.ticketNo,
          stage: ticket.stage,
          internalStatus: ticket.internalStatus,
          previous: before.internal,
        },
      });
    }
  }

  /** SLA-06 target for this ticket from the LOB x risk-tier x case-type matrix (BR-128). */
  threadTargetMins(ticket: PlacementTicket): number {
    const product = PRODUCT_TYPES_SEED.find((p) => p.code === ticket.productType); // TODO(W2): read ProductType master (cached)
    if (!product) return 1080;
    const scenario = resolveQuoteTargetScenario({
      businessType: ticket.businessType,
      riskTier: ticket.riskTier,
      productGroup: product.group,
    });
    return resolveThreadTargetMins(
      this.sla.matrix,
      product.timingLob,
      scenario,
      this.sla.calendar.minutesPerDay,
    );
  }

  /** Assemble the persistence-free snapshot used by the pure derivations. */
  async loadSnapshot(manager: EntityManager, ticket: PlacementTicket): Promise<TicketSnapshot> {
    if (!ticket.id) {
      return {
        stage: ticket.stage,
        outcomeType: ticket.outcomeType,
        panelLocked: ticket.panelLocked,
        activeRfqVersion: ticket.activeRfqVersion,
        openRfqQueries: 0,
        threads: [],
        quotes: [],
        draftQcr: null,
        latestReleasedQcr: null,
        openRevision: false,
        channelIsBimaSetu: ticket.channel === Channel.BIMASETU,
      };
    }
    const rfq = await manager
      .getRepository(RfqVersion)
      .findOne({ where: { ticketId: ticket.id, version: ticket.activeRfqVersion } });
    const openRfqQueries = rfq
      ? await manager.getRepository(RfqQuery).count({ where: { rfqVersionId: rfq.id, resolved: false } })
      : 0;
    const threads = await manager.getRepository(InsurerThread).find({ where: { ticketId: ticket.id } });
    const quotes = await manager.getRepository(Quote).find({ where: { ticketId: ticket.id } });
    const qcrs = await manager
      .getRepository(QcrVersion)
      .find({ where: { ticketId: ticket.id }, order: { version: 'DESC' } });
    const draft =
      qcrs.find((q) => q.status === QcrStatus.DRAFT && q.rfqVersion === ticket.activeRfqVersion) ?? null;
    let copycatStatus: CopycatStatus | null = null;
    if (draft?.currentCopycatRequestId) {
      const req = await manager
        .getRepository(CopycatRequest)
        .findOne({ where: { requestId: draft.currentCopycatRequestId } });
      copycatStatus = req?.status ?? null;
    }
    const released = qcrs.find((q) => q.status === QcrStatus.RELEASED) ?? null;
    const openRevision =
      (await manager.getRepository(Revision).count({ where: { ticketId: ticket.id, handledAt: IsNull() } })) >
      0;
    return {
      stage: ticket.stage,
      outcomeType: ticket.outcomeType,
      panelLocked: ticket.panelLocked,
      activeRfqVersion: ticket.activeRfqVersion,
      openRfqQueries,
      threads: threads.map((t) => ({
        id: t.id,
        insurerId: t.insurerId,
        status: t.status,
        held: !!t.pausedSince,
        rfqVersion: t.rfqVersion,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        insurerId: q.insurerId,
        rfqVersion: q.rfqVersion,
        decision: q.decision,
      })),
      draftQcr: draft ? { source: draft.source, copycatStatus, hasFile: !!draft.documentId } : null,
      latestReleasedQcr: released ? { status: released.status, releasedAt: released.releasedAt! } : null,
      openRevision,
      channelIsBimaSetu: ticket.channel === Channel.BIMASETU,
    };
  }
}

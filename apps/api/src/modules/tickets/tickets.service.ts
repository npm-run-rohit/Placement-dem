import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, ILike, Repository, SelectQueryBuilder } from 'typeorm';
import {
  BimaSetuOutboundType,
  BusinessType,
  Channel,
  InternalStatus,
  RfqStatus,
  RmFacingStatus,
  Role,
  SlaOwnerType,
  Stage,
  ThreadStatus,
  Urgency,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import { isHead, type AuthUser } from '../../common/auth/auth.types';
import { Actors, type Actor } from '../audit/actor';
import { UsersService } from '../users/users.service';
import { PlacementTicket } from './entities/placement-ticket.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { TicketWorkflow } from './ticket-workflow.service';
import { CreateManualTicketDto } from './dto/create-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { RfqVersion } from '../rfq/entities/rfq-version.entity';
import { SlaConfigService } from '../sla/sla-config.service';
import { Clock } from '../../common/time/clock';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(PlacementTicket) private readonly repo: Repository<PlacementTicket>,
    private readonly workflow: TicketWorkflow,
    private readonly users: UsersService,
    private readonly sla: SlaConfigService,
    private readonly clock: Clock,
  ) {}

  /**
   * Manual ticket (M1, FR-192..201). Ticket opens on its RFQ tab in RFQ Review (stage rfq_review).
   * BimaSetu floats use BimaSetuInboundService.handleFloat which shares `createTicket`.
   */
  async createManual(user: AuthUser, dto: CreateManualTicketDto): Promise<PlacementTicket> {
    if (!dto.rfqExcelDocumentId && !dto.rfqLinkUrl)
      throw DomainError.guard('Provide an RFQ Excel and/or an RFQ link (FR-193)');
    if (dto.businessType === BusinessType.RENEWAL && !dto.renewalDate)
      throw DomainError.guard('Renewal date is required for Renewal (FR-194)');
    const rm = await this.users.get(dto.rmUserId);
    if (!rm.active || !rm.roles.includes(Role.RM))
      throw DomainError.guard('Relationship Manager must be an active RM');
    const ownerId = isHead(user) && dto.ownerId ? dto.ownerId : user.id; // FR-198
    if (ownerId !== user.id) {
      const owner = await this.users.get(ownerId);
      if (
        !owner.active ||
        !owner.roles.some((r) => r === Role.PLACEMENT_MANAGER || r === Role.PLACEMENT_HEAD)
      )
        throw DomainError.guard('Owner must be an active Placement Manager or Head');
    }
    // TODO(W2): validate productType/industryType against active masters

    return this.createTicket(Actors.user(user), {
      channel: Channel.MANUAL,
      createdById: user.id,
      ownerId,
      rm: { id: rm.id, name: rm.name, email: rm.email },
      intake: dto,
      excelDocumentId: dto.rfqExcelDocumentId ?? null,
      linkUrl: dto.rfqLinkUrl ?? null,
    });
  }

  /** Shared by manual creation and BimaSetu float intake. */
  async createTicket(
    actor: Actor,
    input: {
      channel: Channel;
      createdById: string | null;
      ownerId: string;
      rm: { id: string | null; name: string; email: string | null };
      intake: Pick<
        CreateManualTicketDto,
        | 'businessName'
        | 'industryType'
        | 'productType'
        | 'businessType'
        | 'renewalDate'
        | 'incumbentInsurer'
        | 'clientSpoc'
        | 'urgency'
        | 'targetPremium'
      > & { noteToPlacement?: string | null };
      excelDocumentId: string | null;
      linkUrl: string | null;
      renderedViewUrl?: string | null;
      bimasetu?: {
        lineRef: string;
        clientRef?: string | null;
        opportunityRef?: string | null;
        floatPayload: Record<string, unknown>;
      };
    },
  ): Promise<PlacementTicket> {
    return this.workflow.create(
      actor,
      async (manager, ticketNo, now) => {
        const incumbentInsurerId = await this.resolveIncumbent(manager, input.intake.incumbentInsurer);
        const t = manager.getRepository(PlacementTicket).create({
          ticketNo,
          channel: input.channel,
          createdById: input.createdById,
          ownerId: input.ownerId,
          rmUserId: input.rm.id,
          rmName: input.rm.name,
          rmEmail: input.rm.email,
          businessName: input.intake.businessName,
          industryType: input.intake.industryType,
          productType: input.intake.productType,
          businessType: input.intake.businessType,
          businessTypeAtIntake: input.intake.businessType,
          renewalDate: input.intake.renewalDate ?? null,
          incumbentInsurerId,
          incumbentInsurerText: input.intake.incumbentInsurer ?? null,
          clientSpoc: input.intake.clientSpoc ?? null,
          urgency: input.intake.urgency ?? Urgency.MEDIUM,
          targetPremium: input.intake.targetPremium ?? null,
          noteToPlacement: input.intake.noteToPlacement ?? null,
          receivedAt: now,
          stage: Stage.RFQ_REVIEW,
          internalStatus: InternalStatus.READY_FOR_PLACEMENT,
          rmStatus: RmFacingStatus.PLACEMENT_IN_PROGRESS,
          bimasetuLineRef: input.bimasetu?.lineRef ?? null,
          clientRef: input.bimasetu?.clientRef ?? null,
          opportunityRef: input.bimasetu?.opportunityRef ?? null,
          floatPayload: input.bimasetu?.floatPayload ?? null,
        });
        const saved = await manager.getRepository(PlacementTicket).save(t);
        await manager.getRepository(RfqVersion).save(
          manager.getRepository(RfqVersion).create({
            ticketId: saved.id,
            version: 1,
            status: RfqStatus.IN_REVIEW,
            excelDocumentId: input.excelDocumentId,
            linkUrl: input.linkUrl,
            renderedViewUrl: input.renderedViewUrl ?? null,
            createdById: input.createdById,
          }),
        );
        // the RFQ Excel is uploaded before the ticket exists: link it so it shows on the Documents tab
        if (input.excelDocumentId)
          await manager.query(`UPDATE documents SET ticket_id = $1 WHERE id = $2 AND ticket_id IS NULL`, [
            saved.id,
            input.excelDocumentId,
          ]);
        return saved;
      },
      async (ctx) => {
        const ticket = ctx.ticket;
        await ctx.audit(
          input.channel === Channel.MANUAL ? 'Ticket created manually' : 'Ticket created from BimaSetu float',
          [input.bimasetu?.lineRef, 'RFQ V1', input.excelDocumentId ? 'Excel' : null, input.linkUrl]
            .filter(Boolean)
            .join(' · '),
        );
        await ctx.audit('Ticket assigned', `Owner ${ticket.ownerId}`);
        if (input.channel === Channel.BIMASETU) {
          await ctx.outbox({
            destination: 'bimasetu',
            eventType: BimaSetuOutboundType.TICKET_CREATED,
            payload: {
              lineRef: ticket.bimasetuLineRef,
              ticketNo: ticket.ticketNo,
              openedAt: ticket.receivedAt.toISOString(),
            },
          });
        }
        await ctx.outbox({
          destination: 'bus',
          eventType: 'placement.ticket_created',
          payload: { ticketNo: ticket.ticketNo, channel: ticket.channel, productType: ticket.productType },
        });
        // INT-T01: a ticket the owner did not create themselves (BimaSetu float, or assigned by the Head)
        if (ticket.ownerId && ticket.ownerId !== input.createdById)
          await ctx.outbox({
            destination: 'notification',
            eventType: 'ticket.assigned',
            payload: { ticketId: ticket.id, ownerId: ticket.ownerId },
          });
        // TODO(W9): RM acknowledgement mail on manual tickets (PRD 7)
      },
    );
  }

  /** Incumbent on intake: an insurer id or a name that matches the Insurer Master links it (BR-026); anything else stays text. */
  private async resolveIncumbent(
    manager: EntityManager,
    value: string | null | undefined,
  ): Promise<string | null> {
    const v = value?.trim();
    if (!v) return null;
    const repo = manager.getRepository(Insurer);
    const byId = /^[0-9a-f-]{36}$/i.test(v) ? await repo.findOneBy({ id: v }) : null;
    return (byId ?? (await repo.findOneBy({ name: ILike(v) })))?.id ?? null;
  }

  async get(user: AuthUser, id: string) {
    const t = await this.repo.findOne({ where: { id }, relations: { owner: true } });
    if (!t) throw DomainError.notFound('Ticket', id);
    this.assertVisible(user, t);
    return t;
  }

  async getByNo(user: AuthUser, ticketNo: string) {
    const t = await this.repo.findOne({ where: { ticketNo }, relations: { owner: true } });
    if (!t) throw DomainError.notFound('Ticket', ticketNo);
    this.assertVisible(user, t);
    return t;
  }

  /** FR-208: a PM sees every non-escalated team ticket, never one escalated to the Placement Head. */
  private assertVisible(user: AuthUser, t: PlacementTicket) {
    if (isHead(user) || user.roles.includes(Role.ADMIN)) return;
    if (t.escalated) throw DomainError.notFound('Ticket', t.id);
  }

  /**
   * Desk card deep link (FR-226, FR-271): the rules of TicketReadService.deskCounts as SQL. Due Today / Overdue
   * compare against the moment N business minutes ahead, which is exact on the business calendar.
   */
  private applyDesk(qb: SelectQueryBuilder<PlacementTicket>, desk: NonNullable<TicketQueryDto['desk']>) {
    const activeThreads =
      'SELECT 1 FROM insurer_threads th WHERE th.ticket_id = t.id AND th.rfq_version = t.active_rfq_version';
    const now = this.clock.now();
    switch (desk) {
      case 'insurerResponse':
        return qb.andWhere(`EXISTS (${activeThreads} AND th.status IN (:...waitingStatuses))`, {
          waitingStatuses: [ThreadStatus.RFQ_SENT, ThreadStatus.ACKNOWLEDGED],
        });
      case 'rmResponse':
        return qb.andWhere(
          new Brackets((b) =>
            b
              .where('t.stage = :awaitingRm', { awaitingRm: Stage.AWAITING_RM })
              .orWhere(`EXISTS (${activeThreads} AND th.status = :heldForRm)`, {
                heldForRm: ThreadStatus.AWAITING_RM,
              }),
          ),
        );
      case 'quotesToReview':
        return qb.andWhere(
          'EXISTS (SELECT 1 FROM quotes qq WHERE qq.ticket_id = t.id AND qq.rfq_version = t.active_rfq_version AND qq.decision IS NULL)',
        );
      case 'dueToday':
        return qb
          .andWhere('t.sla_owner_type = :internalDesk', { internalDesk: SlaOwnerType.INTERNAL })
          .andWhere('t.sla_due_at >= :deskNow AND t.sla_due_at < :dueSoon', {
            deskNow: now,
            dueSoon: this.sla.calendar.addMinutes(now, this.sla.thresholds.dueSoonBusinessMins),
          });
      case 'overdue':
        return qb
          .andWhere('t.sla_owner_type = :internalDesk', { internalDesk: SlaOwnerType.INTERNAL })
          .andWhere('t.sla_due_at < :deskNow', { deskNow: now });
    }
  }

  /** My Tickets queue with tabs (UI-SPEC 3.2) and Head scope (FR-209). */
  async list(user: AuthUser, q: TicketQueryDto) {
    const qb = this.repo.createQueryBuilder('t').leftJoinAndSelect('t.owner', 'owner');
    if (isHead(user)) {
      if (q.scope === 'me') qb.andWhere('t.owner_id = :me', { me: user.id });
    } else {
      qb.andWhere('t.escalated = false');
      // TODO(W2): decide PM visibility (own only vs. team). Prototype shows all non-Head tickets.
    }
    if (q.tab !== 'all') qb.andWhere('t.stage <> :closed', { closed: Stage.CLOSED });
    if (q.tab === 'action' || q.tab === 'sla')
      qb.andWhere('t.sla_owner_type = :internal', { internal: SlaOwnerType.INTERNAL });
    if (q.tab === 'sla') {
      // remaining < slaRiskBusinessMins  <=>  due_at < now + risk window (approximation in wall-clock; refine with calendar)
      const riskCutoff = this.sla.calendar.addMinutes(
        this.clock.now(),
        this.sla.thresholds.slaRiskBusinessMins,
      );
      qb.andWhere('t.sla_due_at < :riskCutoff', { riskCutoff });
    }
    if (q.desk) this.applyDesk(qb, q.desk);
    const inList = (col: string, v?: string) =>
      v && qb.andWhere(`t.${col} IN (:...${col})`, { [col]: v.split(',') });
    inList('stage', q.stage);
    inList('business_type', q.businessType);
    inList('product_type', q.productType);
    inList('urgency', q.urgency);
    if (q.q)
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('t.ticket_no ILIKE :q', { q: `%${q.q}%` })
            .orWhere('t.business_name ILIKE :q', { q: `%${q.q}%` }),
        ),
      );
    // orderBy needs the property path (not the column name) when combined with skip/take + joins
    qb.orderBy('t.receivedAt', q.sort === 'oldest' ? 'ASC' : 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async setTargetPremium(user: AuthUser, id: string, value: number | null, note?: string) {
    return this.workflow.run(id, Actors.user(user), async (ctx) => {
      const prev = ctx.ticket.targetPremium;
      const next = value ?? null;
      if (prev === next) return ctx.ticket;
      ctx.ticket.targetPremium = next;
      const event =
        prev == null
          ? 'Target premium added'
          : next == null
            ? 'Target premium removed'
            : 'Target premium updated';
      await ctx.audit(
        event,
        [prev, next].filter((x) => x != null).join(' -> ') + (note ? ` · ${note}` : ''),
        { before: prev, after: next },
      );
      return ctx.ticket;
    });
  }

  /** FR-029 / BR-015: allowed before float only; not sent back to BimaSetu (BR-139). */
  async correctBusinessType(user: AuthUser, id: string, value: BusinessType, reason: string) {
    return this.workflow.run(id, Actors.user(user), async (ctx) => {
      if (ctx.ticket.panelLocked)
        throw DomainError.guard('Business type can only be corrected before RFQ float - use RFQ Version 2');
      const prev = ctx.ticket.businessType;
      ctx.ticket.businessType = value;
      await ctx.audit('Business type corrected', `${prev} -> ${value} · ${reason}`, {
        before: prev,
        after: value,
      });
      return ctx.ticket;
    });
  }

  /** FR-024..027: Head reassigns any; PM may self-reassign. SLA is NOT reset (BR-020). */
  async reassign(user: AuthUser, id: string, ownerId: string, reason: string) {
    return this.workflow.run(id, Actors.user(user), async (ctx) => {
      if (!isHead(user) && ctx.ticket.ownerId !== user.id)
        throw new DomainError('FORBIDDEN', 'Only the Placement Head or the current owner can reassign');
      const to = await this.users.get(ownerId);
      if (!to.active) throw DomainError.guard('Cannot assign to an inactive user');
      const prev = ctx.ticket.ownerId;
      ctx.ticket.ownerId = ownerId;
      ctx.ticket.escalated = false; // Head reassigning an escalated ticket hands it back (BR-113)
      await ctx.audit('Ticket reassigned', `${prev} -> ${to.name} · ${reason}`, {
        before: prev,
        after: ownerId,
      });
      await ctx.outbox({
        destination: 'notification',
        eventType: 'ticket.reassigned',
        payload: { from: prev, to: ownerId, reason, ticketNo: ctx.ticket.ticketNo },
      });
      return ctx.ticket;
    });
  }
}

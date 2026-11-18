import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  BusinessType,
  MandateRequestStatus,
  MandateType,
  formatMandateRequestRef,
  type MandateView,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors } from '../audit/actor';
import { TicketWorkflow } from '../tickets/ticket-workflow.service';
import { Mandate } from './entities/mandate.entity';
import { MandateRequest } from './entities/mandate-request.entity';
import { User } from '../users/user.entity';
import { Insurer } from '../insurers/entities/insurer.entity';

const OPEN = [MandateRequestStatus.REQUESTED, MandateRequestStatus.CONSIDERING];
/** MND-1026-E (exclusive) / MND-1026-A (incumbent approach), as in the prototype. */
const mandateReference = (ticketNo: string, kind: 'E' | 'A') =>
  `MND-${ticketNo.replace(/^PLC-/, '')}-${kind}`;

/**
 * Exclusive Placement Mandate requests (M4 3.1, FR-276..280). Informational only: never changes the
 * panel, the threshold or the ticket status (BR-136). Incumbent Approach Mandate unblocks the
 * rollover incumbent (BR-026).
 */
@Injectable()
export class MandatesService {
  constructor(
    @InjectRepository(Mandate) private readonly mandates: Repository<Mandate>,
    @InjectRepository(MandateRequest) private readonly requests: Repository<MandateRequest>,
    private readonly workflow: TicketWorkflow,
  ) {}

  /** Mandates on file + request history with names resolved (rail card, header pill and hover). */
  async forTicket(ticketId: string): Promise<MandateView> {
    const [mandates, requests] = await Promise.all([
      this.mandates.find({ where: { ticketId } }),
      this.requests.find({ where: { ticketId }, order: { requestedAt: 'DESC' } }),
    ]);
    const signed = mandates.find((m) => m.type === MandateType.EXCLUSIVE_PLACEMENT);
    const open = requests.find((r) => OPEN.includes(r.status));
    const state = signed
      ? 'signed'
      : open
        ? (open.status as 'requested' | 'considering')
        : requests[0]?.status === MandateRequestStatus.DECLINED
          ? 'declined'
          : 'none';
    const userIds = [...new Set(requests.map((r) => r.requestedById))];
    const insurerIds = [
      ...new Set([...requests, ...mandates].map((x) => x.preferredInsurerId).filter((x): x is string => !!x)),
    ];
    const [users, insurers] = await Promise.all([
      userIds.length ? this.mandates.manager.getRepository(User).find({ where: { id: In(userIds) } }) : [],
      insurerIds.length
        ? this.mandates.manager.getRepository(Insurer).find({ where: { id: In(insurerIds) } })
        : [],
    ]);
    const userName = (id: string) => users.find((u) => u.id === id)?.name ?? 'Placement';
    const insurerName = (id: string | null) =>
      id ? (insurers.find((i) => i.id === id)?.name ?? null) : null;
    return {
      state,
      mandates: mandates.map((m) => {
        const req = requests.find((r) => r.id === m.mandateRequestId);
        return {
          id: m.id,
          type: m.type,
          reference: m.reference,
          preferredInsurerName: insurerName(m.preferredInsurerId),
          note: m.note,
          source: m.source,
          signedAt: m.signedAt?.toISOString() ?? null,
          requestedByName: req ? userName(req.requestedById) : null,
          requestedAt: req?.requestedAt.toISOString() ?? null,
        };
      }),
      requests: requests.map((r) => ({
        id: r.id,
        ref: r.ref,
        status: r.status,
        reason: r.reason,
        message: r.message,
        preferredInsurerId: r.preferredInsurerId,
        preferredInsurerName: insurerName(r.preferredInsurerId),
        requestedByName: userName(r.requestedById),
        requestedAt: r.requestedAt.toISOString(),
        closedAt: r.closedAt?.toISOString() ?? null,
        events: r.events,
      })),
    };
  }

  async request(
    user: AuthUser,
    ticketId: string,
    input: { reason: string; preferredInsurerId?: string; message: string },
  ) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const repo = ctx.manager.getRepository(MandateRequest);
      if (await repo.count({ where: { ticketId, status: In(OPEN) } }))
        throw DomainError.guard('A mandate request is already open (BR-135)');
      if (
        await ctx.manager
          .getRepository(Mandate)
          .count({ where: { ticketId, type: MandateType.EXCLUSIVE_PLACEMENT } })
      )
        throw DomainError.guard('An Exclusive Placement Mandate is already on file');
      ctx.ticket.mandateRequestSeq += 1;
      const req = await repo.save(
        repo.create({
          ticketId,
          ref: formatMandateRequestRef(ctx.ticket.mandateRequestSeq),
          reason: input.reason,
          preferredInsurerId: input.preferredInsurerId ?? null,
          message: input.message,
          requestedById: user.id,
          requestedAt: ctx.now,
        }),
      );
      await ctx.outbox({
        destination: 'mail',
        eventType: 'mail.mandate_request',
        payload: { ticketId, mandateRequestId: req.id, fromUserId: user.id },
      });
      await ctx.audit('Exclusive Mandate requested', `${req.ref} · ${input.reason}`);
      return req;
    });
  }

  /** FR-278: reminder on the open request, mailed to the RM. */
  async remind(user: AuthUser, ticketId: string, note?: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const req = await this.openRequest(ctx.manager, ticketId);
      const n = req.events.filter((e) => e.kind === 'reminder').length + 1;
      req.events = [...req.events, { kind: 'reminder', at: ctx.now.toISOString(), by: user.name, note }];
      await ctx.manager.getRepository(MandateRequest).save(req);
      await ctx.outbox({
        destination: 'mail',
        eventType: 'mail.mandate_reminder',
        payload: { ticketId, mandateRequestId: req.id, n, note, fromUserId: user.id },
      });
      await ctx.audit(
        'Mandate reminder sent',
        `Reminder ${n} to ${ctx.ticket.rmName}${note ? ` · ${note}` : ''}`,
      );
      return req;
    });
  }

  /** FR-278: withdraw the open request with a note; a new request is allowed afterwards (BR-135). */
  async withdraw(user: AuthUser, ticketId: string, note?: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const req = await this.openRequest(ctx.manager, ticketId);
      Object.assign(req, {
        status: MandateRequestStatus.WITHDRAWN,
        closedAt: ctx.now,
        events: [...req.events, { kind: 'withdrawn', at: ctx.now.toISOString(), by: user.name, note }],
      });
      await ctx.manager.getRepository(MandateRequest).save(req);
      await ctx.outbox({
        destination: 'mail',
        eventType: 'mail.mandate_withdrawn',
        payload: { ticketId, mandateRequestId: req.id, note, fromUserId: user.id },
      });
      await ctx.audit('Mandate request withdrawn', `${req.ref}${note ? ` · ${note}` : ''}`);
      return req;
    });
  }

  /**
   * The RM's reply, recorded by Placement (FR-279): Considering keeps the request open; Signed records
   * the Exclusive Placement Mandate (FR-280, display-only per FR-216); Declined needs a reason.
   */
  async recordResponse(
    user: AuthUser,
    ticketId: string,
    input: {
      kind: 'considering' | 'signed' | 'declined';
      note?: string;
      declineReason?: string;
      reference?: string;
    },
  ) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const req = await this.openRequest(ctx.manager, ticketId);
      if (input.kind === 'considering' && req.status === MandateRequestStatus.CONSIDERING && !input.note)
        throw DomainError.guard('The client is already considering - add the RM note');
      if (input.kind === 'declined' && !input.declineReason?.trim())
        throw DomainError.guard('A decline reason is required (FR-279)');
      const event = {
        kind: input.kind,
        at: ctx.now.toISOString(),
        by: ctx.ticket.rmName,
        note: input.note,
        reason: input.declineReason,
      };
      const status = {
        considering: MandateRequestStatus.CONSIDERING,
        signed: MandateRequestStatus.SIGNED,
        declined: MandateRequestStatus.DECLINED,
      }[input.kind];
      Object.assign(req, {
        status,
        closedAt: input.kind === 'considering' ? null : ctx.now,
        events: [...req.events, event],
      });
      await ctx.manager.getRepository(MandateRequest).save(req);

      if (input.kind === 'signed') {
        const repo = ctx.manager.getRepository(Mandate);
        await repo.save(
          repo.create({
            ticketId,
            type: MandateType.EXCLUSIVE_PLACEMENT,
            reference: input.reference?.trim() || mandateReference(ctx.ticket.ticketNo, 'E'),
            preferredInsurerId: req.preferredInsurerId,
            note: input.note ?? null,
            source: 'mandate_request',
            mandateRequestId: req.id,
            signedAt: ctx.now,
            recordedById: user.id,
          }),
        );
        await ctx.audit(
          'Exclusive Placement Mandate signed',
          `${req.ref} · requested by ${await this.userName(ctx.manager, req.requestedById)}`,
        );
      } else if (input.kind === 'declined') {
        await ctx.audit(
          'Mandate request declined',
          `${req.ref} · ${input.declineReason}${input.note ? ` · ${input.note}` : ''}`,
        );
      } else {
        await ctx.audit('Client still considering the mandate', input.note ?? req.ref);
      }
      return req;
    });
  }

  /** Incumbent Approach Mandate upload (BR-026): the rollover incumbent becomes selectable on the next panel load. */
  async recordIncumbentMandate(
    user: AuthUser,
    ticketId: string,
    proofDocumentId: string,
    reference?: string,
  ) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.businessType !== BusinessType.ROLLOVER)
        throw DomainError.guard('An Incumbent Approach Mandate applies to Rollover tickets only');
      const repo = ctx.manager.getRepository(Mandate);
      if (await repo.count({ where: { ticketId, type: MandateType.INCUMBENT_APPROACH } }))
        throw DomainError.guard('An Incumbent Approach Mandate is already on file');
      const m = await repo.save(
        repo.create({
          ticketId,
          type: MandateType.INCUMBENT_APPROACH,
          reference: reference?.trim() || mandateReference(ctx.ticket.ticketNo, 'A'),
          preferredInsurerId: null,
          note: null,
          source: 'manual_upload',
          proofDocumentId,
          signedAt: ctx.now,
          recordedById: user.id,
        }),
      );
      await ctx.audit(
        'Incumbent Approach Mandate uploaded',
        `${m.reference} · incumbent can now be approached`,
      );
      return m;
    });
  }

  private async openRequest(manager: EntityManager, ticketId: string) {
    const req = await manager
      .getRepository(MandateRequest)
      .findOne({ where: { ticketId, status: In(OPEN) } });
    if (!req) throw DomainError.guard('There is no open mandate request on this ticket');
    return req;
  }

  private async userName(manager: EntityManager, id: string) {
    return (await manager.getRepository(User).findOneBy({ id }))?.name ?? 'Placement';
  }
}

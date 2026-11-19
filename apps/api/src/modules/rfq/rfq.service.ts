import type { InboundClass, RfqQueryView, RfqVersionView } from '@bimaplacement/contracts';
import { claimInboundMail } from '../inbound-mail/claim-mail';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BimaSetuOutboundType, Channel, RfqStatus, Stage, TicketCommand } from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors, type Actor } from '../audit/actor';
import { TicketWorkflow } from '../tickets/ticket-workflow.service';
import { RfqVersion } from './entities/rfq-version.entity';
import { RfqQuery } from './entities/rfq-query.entity';

/** M2 RFQ Review + queries to the RM; M11 RFQ versioning (new version orchestration lives in DecisionsService). */
@Injectable()
export class RfqService {
  constructor(
    @InjectRepository(RfqVersion) private readonly versions: Repository<RfqVersion>,
    @InjectRepository(RfqQuery) private readonly queries: Repository<RfqQuery>,
    private readonly workflow: TicketWorkflow,
  ) {}

  async listVersions(ticketId: string): Promise<RfqVersionView[]> {
    const rows = await this.versions.find({ where: { ticketId }, order: { version: 'ASC' } });
    return rows.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      excelDocumentId: v.excelDocumentId,
      linkUrl: v.linkUrl,
      renderedViewUrl: v.renderedViewUrl,
      changeNote: v.changeNote,
      validatedAt: v.validatedAt?.toISOString() ?? null,
      floatedAt: v.floatedAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  async listQueries(ticketId: string): Promise<RfqQueryView[]> {
    const rows = await this.queries.find({ where: { ticketId }, order: { raisedAt: 'ASC' } });
    return rows.map((q) => ({
      id: q.id,
      ref: q.ref,
      label: q.label,
      raisedAt: q.raisedAt.toISOString(),
      sendCount: q.sendCount,
      answer: q.answer,
      answeredAt: q.answeredAt?.toISOString() ?? null,
      answeredBy: q.answeredBy,
      resolved: q.resolved,
      resolvedAt: q.resolvedAt?.toISOString() ?? null,
    }));
  }

  /** FR-259/260 - only in RFQ Review. */
  async setRiskTier(user: AuthUser, ticketId: string, value: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.stage !== Stage.RFQ_REVIEW)
        throw DomainError.guard('Risk tier can only be set during RFQ Review');
      const prev = ctx.ticket.riskTier;
      if (prev === value) return ctx.ticket;
      ctx.ticket.riskTier = value as never;
      await ctx.audit(prev ? 'Risk tier updated' : 'Risk tier set', prev ? `${prev} -> ${value}` : value, {
        before: prev,
        after: value,
      });
      return ctx.ticket;
    });
  }

  /**
   * FR-202/203: add new queries, re-include still-open ones without duplicates, move to
   * RFQ Clarification Required (awaiting_rm, SLA-03 external) and send to BimaSetu (floated)
   * or mail the RM (manual, RM-T01).
   */
  async raiseQueries(user: AuthUser, ticketId: string, newQueries: string[], message?: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.stage !== Stage.RFQ_REVIEW)
        throw DomainError.guard('Queries can be raised only in RFQ Review');
      const rfq = await ctx.manager
        .getRepository(RfqVersion)
        .findOneOrFail({ where: { ticketId, version: ctx.ticket.activeRfqVersion } });
      const repo = ctx.manager.getRepository(RfqQuery);
      const open = await repo.find({ where: { rfqVersionId: rfq.id, resolved: false } });
      const labels = newQueries.map((s) => s.trim()).filter(Boolean);
      if (!labels.length && (ctx.ticket.channel === Channel.BIMASETU || !open.length)) {
        throw DomainError.guard('Add at least one new query (or have one still open on a manual ticket)');
      }
      const existingCount = await repo.count({ where: { ticketId } });
      const created = await repo.save(
        labels.map((label, i) =>
          repo.create({
            ticketId,
            rfqVersionId: rfq.id,
            ref: `Q-${String(existingCount + i + 1).padStart(2, '0')}`,
            label,
            raisedById: user.id,
            raisedAt: ctx.now,
          }),
        ),
      );
      // one UPDATE at a time: save(open) would run them in parallel on the transaction's connection
      for (const q of open) await repo.update(q.id, { sendCount: q.sendCount + 1 });
      ctx.moveTo(Stage.AWAITING_RM, TicketCommand.RAISE_RM_QUERIES);

      if (ctx.ticket.channel === Channel.BIMASETU) {
        for (const q of created) {
          await ctx.outbox({
            destination: 'bimasetu',
            eventType: BimaSetuOutboundType.QUERY_RAISED,
            payload: {
              lineRef: ctx.ticket.bimasetuLineRef,
              ticketNo: ctx.ticket.ticketNo,
              queryRef: q.ref,
              query: q.label,
            },
          });
        }
        await ctx.audit(
          'Queries raised to RM in BimaSetu',
          `${created.length} query(ies): ${created.map((q) => q.label).join('; ')}`,
        );
      } else {
        await ctx.outbox({
          destination: 'mail',
          eventType: 'mail.rm_queries',
          payload: {
            templateId: 'RM-T01',
            ticketId,
            queryIds: [...open, ...created].map((q) => q.id),
            message: message ?? null,
            fromUserId: ctx.ticket.ownerId,
          },
        });
        await ctx.audit(
          'Query mail sent to RM',
          `To ${ctx.ticket.rmName} · ${open.length + created.length} query(ies)`,
        );
      }
      return created;
    });
  }

  /**
   * RM answer: from BimaSetu (query_answer, per query) or an inbound RM mail on manual tickets.
   * Returns the ticket to RFQ Review; never resolves the query (FR-018, BR-111).
   */
  async recordRmAnswer(
    actor: Actor,
    ticketId: string,
    input: {
      queryRef?: string;
      text: string;
      answeredBy: string;
      /** Inbound RM mail: its applied marker commits with the answer, so a retried delivery answers once. */
      claim?: { id: string; label: InboundClass };
      /** RM mail (no Q-nn): the text answers every open, unanswered query on the active RFQ version; none is resolved (BR-111). */
      answerOpenQueries?: boolean;
    },
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      if (input.claim && !(await claimInboundMail(ctx.manager, input.claim, ctx.now))) return;
      const repo = ctx.manager.getRepository(RfqQuery);
      if (input.queryRef) {
        const q = await repo.findOne({ where: { ticketId, ref: input.queryRef } });
        if (!q) throw DomainError.notFound('Query', input.queryRef);
        Object.assign(q, { answer: input.text, answeredAt: ctx.now, answeredBy: input.answeredBy });
        await repo.save(q);
      }
      if (input.answerOpenQueries && !input.queryRef) {
        const rfq = await ctx.manager
          .getRepository(RfqVersion)
          .findOneOrFail({ where: { ticketId, version: ctx.ticket.activeRfqVersion } });
        const open = await repo.find({
          where: { rfqVersionId: rfq.id, resolved: false, answer: IsNull() },
        });
        for (const q of open)
          await repo.update(q.id, { answer: input.text, answeredAt: ctx.now, answeredBy: input.answeredBy });
      }
      if (ctx.ticket.stage === Stage.AWAITING_RM) ctx.moveTo(Stage.RFQ_REVIEW, TicketCommand.RM_ANSWERED);
      await ctx.audit(
        ctx.ticket.channel === Channel.BIMASETU ? 'Query answered in BimaSetu' : 'Query answered by mail',
        input.queryRef ? `${input.queryRef} · ${input.text}` : input.text,
      );
      await ctx.outbox({
        destination: 'notification',
        eventType: 'rfq.rm_replied',
        payload: { ticketId, ownerId: ctx.ticket.ownerId },
      });
    });
  }

  /** FR-204 - PM resolves each query, only while in RFQ Review. */
  async resolveQuery(user: AuthUser, ticketId: string, queryId: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.stage !== Stage.RFQ_REVIEW)
        throw DomainError.guard('Queries can be resolved only in RFQ Review');
      const repo = ctx.manager.getRepository(RfqQuery);
      const q = await repo.findOneOrFail({ where: { id: queryId, ticketId } });
      if (q.resolved) return q;
      Object.assign(q, { resolved: true, resolvedAt: ctx.now, resolvedById: user.id });
      await repo.save(q);
      await ctx.audit('Query resolved', q.label);
      return q;
    });
  }

  /** FR-014/260: zero open queries AND risk tier set -> Insurer Selection. */
  async validate(user: AuthUser, ticketId: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.stage !== Stage.RFQ_REVIEW)
        throw DomainError.guard('RFQ can be validated only in RFQ Review');
      if (!ctx.ticket.riskTier) throw DomainError.guard('Set the risk tier to validate');
      const rfq = await ctx.manager
        .getRepository(RfqVersion)
        .findOneOrFail({ where: { ticketId, version: ctx.ticket.activeRfqVersion } });
      const open = await ctx.manager
        .getRepository(RfqQuery)
        .count({ where: { rfqVersionId: rfq.id, resolved: false } });
      if (open) throw DomainError.guard(`${open} query(ies) still open`, { open });
      rfq.status = RfqStatus.VALIDATED;
      rfq.validatedAt = ctx.now;
      rfq.validatedById = user.id;
      await ctx.manager.getRepository(RfqVersion).save(rfq);
      ctx.moveTo(Stage.INSURER_SELECTION, TicketCommand.VALIDATE_RFQ);
      await ctx.audit(`RFQ V${rfq.version} validated`, 'Moved to insurer selection');
      return rfq;
    });
  }
}

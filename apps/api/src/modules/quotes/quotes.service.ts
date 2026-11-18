import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QuoteDecision, Stage, ThreadStatus, TicketCommand, type QuoteView } from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors, type Actor } from '../audit/actor';
import { TicketWorkflow } from '../tickets/ticket-workflow.service';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { ThreadEvent } from '../threads/entities/thread-event.entity';
import { SlaConfigService } from '../sla/sla-config.service';
import { usableInsurerCount } from '../tickets/domain/status-deriver';
import { QcrService } from '../qcr/qcr.service';
import { Quote } from './entities/quote.entity';
import { targetFlag } from './target-flag';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { InsurerBranch } from '../insurers/entities/insurer-branch.entity';
import { Document } from '../documents/document.entity';

/** M8 quote ingestion & usability review; triggers M9 threshold auto-draft. */
@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private readonly quotes: Repository<Quote>,
    private readonly workflow: TicketWorkflow,
    private readonly sla: SlaConfigService,
    private readonly qcr: QcrService,
  ) {}

  /** QuoteView[] (UI-SPEC 3.3.7): newest first; target flag against the ticket's target premium (FR-265). */
  async list(ticketId: string): Promise<QuoteView[]> {
    const m = this.quotes.manager;
    const [list, ticket, threads] = await Promise.all([
      this.quotes.find({ where: { ticketId }, order: { receivedAt: 'DESC' } }),
      m.getRepository(PlacementTicket).findOneByOrFail({ id: ticketId }),
      m.getRepository(InsurerThread).find({ where: { ticketId } }),
    ]);
    if (!list.length) return [];
    const [insurers, branches, docs] = await Promise.all([
      m.getRepository(Insurer).find({ where: { id: In([...new Set(list.map((x) => x.insurerId))]) } }),
      m.getRepository(InsurerBranch).find({ where: { id: In(threads.map((x) => x.branchId)) } }),
      m.getRepository(Document).find({ where: { id: In(list.map((x) => x.documentId)) } }),
    ]);
    return list.map((q) => {
      const th = threads.find((x) => x.id === q.threadId);
      const ins = insurers.find((i) => i.id === q.insurerId);
      return {
        id: q.id,
        threadId: q.threadId,
        threadRef: th?.threadRef ?? '',
        insurerId: q.insurerId,
        insurer: { id: q.insurerId, name: ins?.name ?? 'Insurer', logoUrl: ins?.logoUrl ?? null },
        branchName: branches.find((b) => b.id === th?.branchId)?.name || null,
        multiThread:
          threads.filter((x) => x.insurerId === q.insurerId && x.rfqVersion === q.rfqVersion).length > 1,
        multiVersion: list.filter((x) => x.threadId === q.threadId).length > 1,
        rfqVersion: q.rfqVersion,
        version: q.version,
        receivedAt: q.receivedAt.toISOString(),
        documentId: q.documentId,
        fileName: docs.find((d) => d.id === q.documentId)?.fileName ?? 'quote.pdf',
        decision: q.decision,
        decisionNote: q.decisionNote,
        clarificationText: q.clarificationText,
        premium: q.premium,
        targetFlag: targetFlag(ticket.targetPremium, q.premium),
      };
    });
  }

  /**
   * New Quote Version from a mapped insurer mail / Manual Review confirm / PM re-upload (FR-081/082, FR-092).
   * Dedupe on content hash per thread (10.2). Quotes on a superseded RFQ version are stored but never count (FR-128).
   */
  async ingestQuote(
    actor: Actor,
    ticketId: string,
    threadId: string,
    input: { documentId: string; contentHash?: string; mailId?: string },
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      const thread = await ctx.manager
        .getRepository(InsurerThread)
        .findOneByOrFail({ id: threadId, ticketId });
      const repo = ctx.manager.getRepository(Quote);
      if (input.contentHash && (await repo.count({ where: { threadId, contentHash: input.contentHash } }))) {
        await ctx.audit('Duplicate quote ignored', thread.threadRef);
        return null;
      }
      const version = (await repo.count({ where: { threadId } })) + 1;
      // earlier undecided versions on this thread are superseded by the revision (BR-059 keeps them visible)
      await repo
        .createQueryBuilder()
        .update(Quote)
        .set({ decision: QuoteDecision.SUPERSEDED })
        .where('thread_id = :threadId AND decision IS NULL', { threadId })
        .execute();
      const quote = await repo.save(
        repo.create({
          ticketId,
          threadId,
          insurerId: thread.insurerId,
          rfqVersion: thread.rfqVersion,
          version,
          receivedAt: ctx.now,
          documentId: input.documentId,
          sourceMailId: input.mailId ?? null,
          contentHash: input.contentHash ?? null,
        }),
      );
      if (thread.rfqVersion === ctx.ticket.activeRfqVersion) {
        thread.status = ThreadStatus.QUOTE_RECEIVED;
        thread.lastEventAt = ctx.now;
        await ctx.manager.getRepository(InsurerThread).save(thread);
        if (ctx.ticket.stage === Stage.MARKET) ctx.moveTo(Stage.QUOTE_REVIEW, TicketCommand.QUOTE_RECEIVED);
      }
      await ctx.manager.getRepository(ThreadEvent).insert({
        at: ctx.now,
        threadId,
        kind: 'quote',
        actorType: actor.type,
        actorId: actor.id,
        text: `Quote V${version} received`,
        mailMessageId: input.mailId ?? null,
      });
      await ctx.audit('Quote received', `${thread.threadRef} · awaiting Placement Manager review`);
      await ctx.outbox({
        destination: 'notification',
        eventType: 'quote.received',
        payload: { ticketId, quoteId: quote.id, ownerId: ctx.ticket.ownerId },
      });
      // late quote after release -> PM decides on next QCR version (FR-105); nextAction surfaces it
      return quote;
    });
  }

  /**
   * FR-090/091, FR-264, BR-053..056: decision updates only that quote's thread (FR-237).
   * Third distinct usable insurer -> stop follow-ups + queue Copycat draft automatically (FR-096/097).
   */
  async decide(
    user: AuthUser,
    ticketId: string,
    quoteId: string,
    decision: 'usable' | 'clarification' | 'excluded',
    note?: string,
  ) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const repo = ctx.manager.getRepository(Quote);
      const q = await repo.findOneByOrFail({ id: quoteId, ticketId });
      if (q.rfqVersion !== ctx.ticket.activeRfqVersion || q.decision === QuoteDecision.SUPERSEDED)
        throw DomainError.guard('Quote belongs to a superseded RFQ version / revision');
      if (decision === 'usable' && q.decision === QuoteDecision.CLARIFICATION)
        throw DomainError.guard('Resolve the open clarification before marking usable');
      if (decision === 'excluded' && !note?.trim()) throw DomainError.guard('Exclusion needs a reason');
      Object.assign(q, {
        decision,
        decisionNote: note ?? null,
        decidedAt: ctx.now,
        decidedById: user.id,
        clarificationText: decision === 'clarification' ? note : q.clarificationText,
      });
      await repo.save(q);
      if (decision === 'usable') {
        // the newly validated revision replaces the previously usable one on this thread (M8 validation)
        await repo
          .createQueryBuilder()
          .update(Quote)
          .set({ decision: QuoteDecision.SUPERSEDED, supersededByQuoteId: q.id })
          .where('thread_id = :tid AND id <> :id AND decision = :usable', {
            tid: q.threadId,
            id: q.id,
            usable: QuoteDecision.USABLE,
          })
          .execute();
      }

      const thread = await ctx.manager.getRepository(InsurerThread).findOneByOrFail({ id: q.threadId });
      thread.status = {
        usable: ThreadStatus.QUOTE_USABLE,
        clarification: ThreadStatus.QUOTE_CLARIFICATION,
        excluded: ThreadStatus.QUOTE_EXCLUDED,
      }[decision];
      await ctx.manager.getRepository(InsurerThread).save(thread);
      if (decision === 'clarification') {
        await ctx.outbox({
          destination: 'mail',
          eventType: 'mail.quote_clarification',
          payload: { ticketId, threadId: thread.id, quoteId, text: note, fromUserId: ctx.ticket.ownerId },
        });
      }
      await ctx.audit(
        {
          usable: 'Quote marked usable',
          clarification: 'Quote marked needs clarification',
          excluded: 'Quote excluded from QCR',
        }[decision],
        `${thread.threadRef} · Quote V${q.version}${note ? ` · ${note}` : ''}`,
      );

      // threshold check (BR-061) on the live snapshot
      const snap = await this.workflow.loadSnapshot(ctx.manager, ctx.ticket);
      const usable = usableInsurerCount(snap);
      const pendingDecisions = snap.quotes.some(
        (x) => x.rfqVersion === ctx.ticket.activeRfqVersion && x.decision === null,
      );
      if (
        usable >= this.sla.thresholds.usableQuoteThreshold &&
        !snap.draftQcr &&
        !ctx.ticket.followUpsStopped &&
        (ctx.ticket.stage === Stage.MARKET || ctx.ticket.stage === Stage.QUOTE_REVIEW)
      ) {
        await ctx.audit(
          'Usable-quote threshold reached',
          `${usable} usable quotes from ${usable} distinct insurers`,
        );
        await this.qcr.createDraftInTx(ctx, {
          earlyReleaseReason: null,
          command: TicketCommand.THRESHOLD_REACHED,
        });
      } else if (ctx.ticket.stage === Stage.QUOTE_REVIEW && !pendingDecisions) {
        ctx.moveTo(Stage.MARKET, TicketCommand.QUOTE_DECIDED);
      }
      return q;
    });
  }

  /** FR-265: PM-recorded premium drives the target flag only. Commit on blur in the UI (no per-keystroke audit). */
  async setPremium(user: AuthUser, ticketId: string, quoteId: string, premium: number | null) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const repo = ctx.manager.getRepository(Quote);
      const q = await repo.findOneByOrFail({ id: quoteId, ticketId });
      if (q.premium === premium) return q;
      const before = q.premium;
      q.premium = premium;
      await repo.save(q);
      await ctx.audit(
        premium == null
          ? 'Quote premium cleared'
          : before == null
            ? 'Quote premium recorded'
            : 'Quote premium updated',
        `Quote V${q.version} · ${premium ?? ''}`,
        { before, after: premium },
      );
      return { ...q, targetFlag: targetFlag(ctx.ticket.targetPremium, premium) };
    });
  }
}

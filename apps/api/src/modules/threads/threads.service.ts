import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BimaSetuOutboundType,
  Channel,
  RfqStatus,
  Stage,
  ThreadStatus,
  TicketCommand,
  formatThreadRef,
  type ThreadEventView,
  type ThreadView,
} from '@bimaplacement/contracts';
import type { InboundClass } from '@bimaplacement/contracts';
import { claimInboundMail } from '../inbound-mail/claim-mail';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors, type Actor } from '../audit/actor';
import { TicketWorkflow, type WorkflowContext } from '../tickets/ticket-workflow.service';
import { InsurersService } from '../insurers/insurers.service';
import { SlaConfigService } from '../sla/sla-config.service';
import { RfqVersion } from '../rfq/entities/rfq-version.entity';
import { InsurerThread } from './entities/insurer-thread.entity';
import { PanelSelection } from './entities/panel-selection.entity';
import { ThreadEvent } from './entities/thread-event.entity';
import { ThreadClarification } from './entities/thread-clarification.entity';
import { CallLog } from './entities/call-log.entity';
import { threadRemainingMins } from './thread-clock';
import { Clock } from '../../common/time/clock';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { InsurerBranch } from '../insurers/entities/insurer-branch.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { hasOpenQuestion, statusAfterReply } from './thread-status';

import { markRevisionHandled } from '../decisions/revision-handling';
/** M4 selection -> M5 float -> M6/M7 thread lifecycle (hold/resume, follow-ups, restart). */
@Injectable()
export class ThreadsService {
  constructor(
    @InjectRepository(InsurerThread) private readonly threads: Repository<InsurerThread>,
    @InjectRepository(ThreadEvent) private readonly events: Repository<ThreadEvent>,
    private readonly workflow: TicketWorkflow,
    private readonly insurers: InsurersService,
    private readonly sla: SlaConfigService,
    private readonly clock: Clock,
  ) {}

  /** ThreadView[] for the Insurer Threads / Insurer Panel tabs; live insurer clock on the engine time. */
  async list(ticketId: string): Promise<ThreadView[]> {
    const threads = await this.threads.find({ where: { ticketId }, order: { threadRef: 'ASC' } });
    if (!threads.length) return [];
    const m = this.threads.manager;
    const ticket = await m.getRepository(PlacementTicket).findOneByOrFail({ id: ticketId });
    const insurerIds = [...new Set(threads.map((x) => x.insurerId))];
    const [insurers, branches, clarifications, quotes] = await Promise.all([
      m.getRepository(Insurer).find({ where: { id: In(insurerIds) } }),
      m.getRepository(InsurerBranch).find({ where: { insurerId: In(insurerIds) } }),
      m
        .getRepository(ThreadClarification)
        .find({ where: { threadId: In(threads.map((x) => x.id)) }, order: { askedAt: 'DESC' } }),
      m.getRepository(Quote).find({ where: { ticketId }, order: { version: 'DESC' } }),
    ]);
    const now = this.clock.now();
    const iso = (d: Date | null) => d?.toISOString() ?? null;
    return threads.map((t) => {
      const ins = insurers.find((i) => i.id === t.insurerId);
      const clar = clarifications.find((c) => c.threadId === t.id);
      const q = quotes.find((x) => x.threadId === t.id);
      return {
        id: t.id,
        threadRef: t.threadRef,
        rfqVersion: t.rfqVersion,
        insurerId: t.insurerId,
        insurer: { id: t.insurerId, name: ins?.name ?? 'Insurer', logoUrl: ins?.logoUrl ?? null },
        branch: { id: t.branchId, name: branches.find((b) => b.id === t.branchId)?.name || null },
        multiBranch: branches.filter((b) => b.insurerId === t.insurerId).length > 1,
        pocs: t.pocs.map((p) => ({ name: p.name, email: p.email })),
        status: t.status,
        followUpsSent: t.followUpsSent,
        followUpsActive: t.followUpsActive && !ticket.followUpsStopped,
        held: !!t.pausedSince,
        heldMins: t.heldMins,
        pauseReason: t.pauseReason,
        declineReason: t.declineReason,
        remainingMins: threadRemainingMins(this.sla.calendar, t, now, ticket.followUpsStopped),
        targetMins: t.targetMins,
        floatedAt: iso(t.floatedAt),
        lastEventAt: iso(t.lastEventAt),
        clarification: clar
          ? {
              question: clar.question,
              askedAt: clar.askedAt.toISOString(),
              rmRequestText: clar.rmRequestText,
              rmRequestedAt: iso(clar.rmRequestedAt),
              rmResponse: clar.rmResponse,
              rmRespondedAt: iso(clar.rmRespondedAt),
              replyText: clar.replyText,
              repliedAt: iso(clar.repliedAt),
            }
          : null,
        latestQuote: q
          ? { id: q.id, version: q.version, documentId: q.documentId, decision: q.decision }
          : null,
      };
    });
  }

  async timeline(ticketId: string, threadId: string): Promise<ThreadEventView[]> {
    if (!(await this.threads.existsBy({ id: threadId, ticketId })))
      throw DomainError.notFound('Thread', threadId);
    const events = await this.events.find({ where: { threadId }, order: { at: 'ASC' } });
    return events.map((e) => ({
      id: e.id,
      kind: e.kind,
      actorType: e.actorType,
      text: e.text,
      at: e.at.toISOString(),
    }));
  }

  /** Pre-float selection toggle. Do Not Float etc. enforced on every add path (FR-212). */
  async togglePanelEntity(
    user: AuthUser,
    ticketId: string,
    insurerId: string,
    branchId: string,
    selected: boolean,
  ) {
    const entities = await this.insurers.entitiesForTicket(ticketId);
    const entity = entities.find((e) => e.insurerId === insurerId && e.branchId === branchId);
    if (!entity) throw DomainError.guard('This insurer + branch has no POC for the product group');
    if (selected && entity.lock) throw DomainError.guard(`Cannot add: ${entity.lock}`);

    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.stage !== Stage.INSURER_SELECTION && !ctx.ticket.panelLocked)
        throw DomainError.guard('Insurers can be selected after the RFQ is validated');
      if (ctx.ticket.panelLocked) {
        if (!selected) throw DomainError.guard('A floated thread cannot be removed');
        return this.addAfterFloat(ctx, entity);
      }
      const repo = ctx.manager.getRepository(PanelSelection);
      const where = { ticketId, rfqVersion: ctx.ticket.activeRfqVersion, insurerId, branchId };
      if (selected)
        await repo.upsert({ ...where, selectedById: user.id }, [
          'ticketId',
          'rfqVersion',
          'insurerId',
          'branchId',
        ]);
      else await repo.delete(where);
      await ctx.audit('Panel updated', `${entity.label} ${selected ? 'added' : 'removed'}`);
    });
  }

  /**
   * Approve and float RFQ (M5): one thread per selected insurer + branch, TH-nn never reused,
   * RFQ attached/linked, sent from the PM identity to all POCs in To; panel locks; each thread
   * starts its own SLA-06 clock (FR-045..055, FR-217..221).
   */
  async floatRfq(user: AuthUser, ticketId: string) {
    const entities = await this.insurers.entitiesForTicket(ticketId);
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (ctx.ticket.stage !== Stage.INSURER_SELECTION || ctx.ticket.panelLocked)
        throw DomainError.guard('RFQ can be floated once, from Insurer Selection');
      const picks = await ctx.manager
        .getRepository(PanelSelection)
        .find({ where: { ticketId, rfqVersion: ctx.ticket.activeRfqVersion } });
      if (!picks.length) throw DomainError.guard('Select at least one insurer');
      const selected = picks.map((p) =>
        entities.find((e) => e.insurerId === p.insurerId && e.branchId === p.branchId),
      );
      const blocked = selected.filter((e) => !e || e.lock || !e.pocs.length);
      if (blocked.length)
        throw DomainError.guard('Some selections are no longer eligible (status re-checked before send)', {
          blocked,
        });

      const rfq = await ctx.manager
        .getRepository(RfqVersion)
        .findOneOrFail({ where: { ticketId, version: ctx.ticket.activeRfqVersion } });
      const created: InsurerThread[] = [];
      for (const e of selected as NonNullable<(typeof selected)[number]>[]) {
        created.push(await this.createThread(ctx, e, rfq, false));
      }
      rfq.status = RfqStatus.FLOATED;
      rfq.floatedAt = ctx.now;
      await ctx.manager.getRepository(RfqVersion).save(rfq);
      ctx.ticket.panelLocked = true;
      ctx.ticket.followUpsStopped = false;
      ctx.moveTo(Stage.MARKET, TicketCommand.FLOAT_RFQ);
      await ctx.audit(
        `RFQ V${rfq.version} sent to insurers`,
        `${created.length} independent insurer threads created`,
      );
      return created;
    });
  }

  private async createThread(
    ctx: WorkflowContext,
    e: {
      insurerId: string;
      branchId: string;
      label: string;
      pocs: Array<{ pocId: string; name: string; email: string }>;
    },
    rfq: RfqVersion,
    afterFloat: boolean,
  ) {
    ctx.ticket.threadSeq += 1;
    const repo = ctx.manager.getRepository(InsurerThread);
    const thread = await repo.save(
      repo.create({
        ticketId: ctx.ticket.id,
        threadRef: formatThreadRef(ctx.ticket.threadSeq),
        rfqVersion: rfq.version,
        insurerId: e.insurerId,
        branchId: e.branchId,
        pocs: e.pocs,
        status: ThreadStatus.RFQ_SENT,
        addedAfterFloat: afterFloat,
        floatedAt: ctx.now,
        targetMins: this.workflow.threadTargetMins(ctx.ticket),
        lastEventAt: ctx.now,
      }),
    );
    await ctx.manager.getRepository(ThreadEvent).insert({
      at: ctx.now,
      threadId: thread.id,
      kind: 'rfq_sent',
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      text: `RFQ V${rfq.version} sent to ${e.label} · To: ${e.pocs.map((p) => p.name).join(', ')}`,
    });
    // INS-T01 from the assigned PM mailbox; worker renders + sends + writes mail_messages (FR-049..053)
    await ctx.outbox({
      destination: 'mail',
      eventType: 'mail.rfq_float',
      payload: {
        templateId: 'INS-T01',
        ticketId: ctx.ticket.id,
        threadId: thread.id,
        rfqVersionId: rfq.id,
        fromUserId: ctx.ticket.ownerId,
      },
    });
    return thread;
  }

  /** FR-219 / FR-125: post-float addition creates a new independent thread and re-sends the RFQ. */
  private async addAfterFloat(
    ctx: WorkflowContext,
    entity: {
      insurerId: string;
      branchId: string;
      label: string;
      pocs: Array<{ pocId: string; name: string; email: string }>;
    },
  ) {
    const existing = await ctx.manager.getRepository(InsurerThread).count({
      where: {
        ticketId: ctx.ticket.id,
        rfqVersion: ctx.ticket.activeRfqVersion,
        insurerId: entity.insurerId,
        branchId: entity.branchId,
      },
    });
    if (existing) throw DomainError.guard('This insurer + branch already has a thread on the active RFQ');
    const rfq = await ctx.manager
      .getRepository(RfqVersion)
      .findOneOrFail({ where: { ticketId: ctx.ticket.id, version: ctx.ticket.activeRfqVersion } });
    const thread = await this.createThread(ctx, entity, rfq, true);
    if (ctx.ticket.stage === Stage.QCR_RELEASED || ctx.ticket.stage === Stage.REVISION_REQUESTED) {
      await markRevisionHandled(ctx, 'add_insurer'); // FR-250
      ctx.moveTo(Stage.MARKET, TicketCommand.ADD_INSURER_AFTER_FLOAT);
    }
    await ctx.audit(
      'Additional insurer approached',
      `${entity.label} · new independent thread on RFQ V${rfq.version}`,
    );
    return thread;
  }

  /** FR-232 / FR-063: request RM info for one thread and hold that thread's clock. */
  async holdForRm(user: AuthUser, ticketId: string, threadId: string, request: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const repo = ctx.manager.getRepository(InsurerThread);
      const t = await repo.findOneByOrFail({ id: threadId, ticketId });
      if (t.status !== ThreadStatus.INSURER_CLARIFICATION)
        throw DomainError.guard('Thread is not waiting on a clarification');
      const remaining = threadRemainingMins(this.sla.calendar, t, ctx.now, ctx.ticket.followUpsStopped);
      Object.assign(t, {
        status: ThreadStatus.AWAITING_RM,
        pausedSince: ctx.now,
        pauseReason: request,
        lastEventAt: ctx.now,
      });
      await repo.save(t);
      const clar = await ctx.manager
        .getRepository(ThreadClarification)
        .findOne({ where: { threadId }, order: { askedAt: 'DESC' } });
      // FR-290: BimaSetu sees a ticket-scoped IR-nn, never the insurer thread ref
      const [{ n }] = await ctx.manager.query(
        `SELECT count(*)::int AS n FROM thread_clarifications c JOIN insurer_threads t ON t.id = c.thread_id WHERE t.ticket_id = $1 AND c.rm_query_ref IS NOT NULL`,
        [ticketId],
      );
      const rmQueryRef = `IR-${String(n + 1).padStart(2, '0')}`;
      if (clar)
        await ctx.manager
          .getRepository(ThreadClarification)
          .update(clar.id, { rmRequestedAt: ctx.now, rmRequestText: request, rmQueryRef });
      await ctx.manager.getRepository(ThreadEvent).insert({
        at: ctx.now,
        threadId,
        kind: 'hold',
        actorType: ctx.actor.type,
        actorId: ctx.actor.id,
        text: `Information requested from RM · insurer clock held at ${remaining ?? '-'} min`,
      });
      if (ctx.ticket.channel === Channel.BIMASETU) {
        await ctx.outbox({
          destination: 'bimasetu',
          eventType: BimaSetuOutboundType.QUERY_RAISED,
          payload: {
            lineRef: ctx.ticket.bimasetuLineRef,
            ticketNo: ctx.ticket.ticketNo,
            queryRef: rmQueryRef,
            query: request,
          },
        });
      } else {
        await ctx.outbox({
          destination: 'mail',
          eventType: 'mail.rm_thread_info',
          payload: { ticketId, threadId, request, fromUserId: ctx.ticket.ownerId },
        });
      }
      await ctx.audit(
        'Information requested from RM',
        `${t.threadRef} · ${rmQueryRef} · SLA held at ${remaining ?? '-'} min remaining`,
      );
    });
  }

  /** RM answered a thread information request (BimaSetu query_answer with TH-nn, or RM mail). */
  async recordRmThreadAnswer(
    actor: Actor,
    ticketId: string,
    threadRef: string,
    text: string,
    rmQueryRef?: string,
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      const t = await ctx.manager.getRepository(InsurerThread).findOneByOrFail({ ticketId, threadRef });
      // FR-063: only an open information request (thread held for the RM) can be answered
      if (t.status !== ThreadStatus.AWAITING_RM)
        throw DomainError.guard(`${t.threadRef} is not waiting for RM information`);
      const clar = await ctx.manager
        .getRepository(ThreadClarification)
        .findOne({ where: { threadId: t.id }, order: { askedAt: 'DESC' } });
      // An answer to an earlier request (late or duplicate) must not land on the open one
      if (rmQueryRef && clar?.rmQueryRef !== rmQueryRef)
        throw DomainError.guard(`${rmQueryRef} is not the open information request on ${t.threadRef}`);
      if (clar)
        await ctx.manager
          .getRepository(ThreadClarification)
          .update(clar.id, { rmResponse: text, rmRespondedAt: ctx.now });
      await ctx.manager.getRepository(ThreadEvent).insert({
        at: ctx.now,
        threadId: t.id,
        kind: 'note',
        actorType: actor.type,
        actorId: actor.id,
        text: 'RM provided the requested information',
      });
      await ctx.audit('Information provided', t.threadRef);
    });
  }

  /** FR-064 / BR-117: reply to the insurer and resume with exactly the remaining time. */
  async replyToInsurer(user: AuthUser, ticketId: string, threadId: string, text: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const t = await ctx.manager.getRepository(InsurerThread).findOneByOrFail({ id: threadId, ticketId });
      await this.resumeOnOurReply(ctx, t, text, 'app', user.name);
      await ctx.outbox({
        destination: 'mail',
        eventType: 'mail.insurer_reply',
        payload: { ticketId, threadId, text, fromUserId: ctx.ticket.ownerId },
      });
    });
  }

  /**
   * A colleague replied to the insurer from their own Gmail (shared email layer): counts as our reply, so the
   * thread resumes exactly as an in-app reply would (FR-064), but no mail is sent. The inbound mail is claimed in
   * this transaction, so a retried or concurrent delivery resumes the thread once.
   */
  async recordColleagueReply(
    actor: Actor,
    ticketId: string,
    threadId: string,
    text: string,
    byName: string,
    claim?: { id: string; label: InboundClass },
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      if (claim && !(await claimInboundMail(ctx.manager, claim, ctx.now))) return;
      const t = await ctx.manager.getRepository(InsurerThread).findOneByOrFail({ id: threadId, ticketId });
      if (t.status !== ThreadStatus.AWAITING_RM && t.status !== ThreadStatus.INSURER_CLARIFICATION)
        throw DomainError.guard(`${t.threadRef} is not waiting on a reply from us`);
      await this.resumeOnOurReply(ctx, t, text, 'gmail', byName);
    });
  }

  /** Shared by the in-app reply and a colleague's Gmail reply: resume with the remaining time, close the clarification. */
  private async resumeOnOurReply(
    ctx: WorkflowContext,
    t: InsurerThread,
    text: string,
    how: 'app' | 'gmail',
    byName: string,
  ) {
    const threadId = t.id;
    if (t.pausedSince) t.heldMins += this.sla.calendar.minutesBetween(t.pausedSince, ctx.now);
    if (hasOpenQuestion(t.status)) {
      const quotes = await ctx.manager
        .getRepository(Quote)
        .find({ where: { threadId }, select: { version: true, decision: true } });
      t.status = statusAfterReply(quotes);
    }
    Object.assign(t, {
      pausedSince: null,
      pauseReason: null,
      lastEventAt: ctx.now,
    });
    await ctx.manager.getRepository(InsurerThread).save(t);
    const clar = await ctx.manager
      .getRepository(ThreadClarification)
      .findOne({ where: { threadId }, order: { askedAt: 'DESC' } });
    if (clar)
      await ctx.manager
        .getRepository(ThreadClarification)
        .update(clar.id, { replyText: text, repliedAt: ctx.now });
    await ctx.manager.getRepository(ThreadEvent).insert({
      at: ctx.now,
      threadId,
      kind: 'resume',
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      text:
        how === 'app'
          ? 'Reply sent to insurer · clock resumed'
          : `Replied from Gmail by ${byName} · clock resumed`,
    });
    await ctx.audit(
      'Replied to insurer clarification',
      how === 'app' ? `${t.threadRef} · SLA resumed` : `${t.threadRef} · from Gmail by ${byName}`,
    );
  }

  /** Manual follow-up (same counter as the automatic ladder). */
  async followUp(user: AuthUser, ticketId: string, threadId: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const repo = ctx.manager.getRepository(InsurerThread);
      const t = await repo.findOneByOrFail({ id: threadId, ticketId });
      if ([ThreadStatus.DECLINED, ThreadStatus.QUOTE_USABLE, ThreadStatus.QUOTE_EXCLUDED].includes(t.status))
        throw DomainError.guard('Thread no longer needs follow-ups');
      t.followUpsSent = Math.min(3, t.followUpsSent + 1);
      t.lastEventAt = ctx.now;
      await repo.save(t);
      const templateId = t.followUpsSent >= 3 ? 'INS-T04' : t.followUpsSent === 2 ? 'INS-T03' : 'INS-T02';
      await ctx.outbox({
        destination: 'mail',
        eventType: 'mail.insurer_follow_up',
        payload: { templateId, ticketId, threadId, fromUserId: ctx.ticket.ownerId, manual: true },
      });
      await ctx.audit('Follow-up sent', `${t.threadRef} · ${templateId}`);
    });
  }

  async logCall(
    user: AuthUser,
    ticketId: string,
    threadId: string,
    input: { outcome: string; notes?: string; nextFollowUpAt?: string },
  ) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      await ctx.manager.getRepository(CallLog).insert({
        threadId,
        outcome: input.outcome,
        notes: input.notes ?? null,
        nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
        loggedById: user.id,
      });
      await ctx.manager.getRepository(ThreadEvent).insert({
        at: ctx.now,
        threadId,
        kind: 'call',
        actorType: ctx.actor.type,
        actorId: ctx.actor.id,
        text: `Call logged - ${input.outcome}`,
      });
      await ctx.audit('Call logged', input.outcome);
    });
  }

  /**
   * Request More Quotes / revision re-rate (FR-067, BR-044): selected threads get a fresh clock,
   * ladder reset and the RFQ re-sent (INS-T06). Re-enables follow-ups ticket-wide.
   */
  async restartThreads(user: AuthUser, ticketId: string, threadIds: string[], reason: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const repo = ctx.manager.getRepository(InsurerThread);
      const list = await repo.find({
        where: { ticketId, id: In(threadIds), rfqVersion: ctx.ticket.activeRfqVersion },
      });
      if (list.length !== threadIds.length)
        throw DomainError.guard('Some threads are not on the active RFQ version');
      for (const t of list) {
        if (t.status === ThreadStatus.AWAITING_RM)
          throw DomainError.guard(`${t.threadRef} is waiting on the RM`);
        Object.assign(t, {
          floatedAt: ctx.now,
          heldMins: 0,
          pausedSince: null,
          followUpsSent: 0,
          followUpsActive: true,
          targetMins: this.workflow.threadTargetMins(ctx.ticket),
          status: ThreadStatus.RFQ_SENT,
          lastEventAt: ctx.now,
        });
        await ctx.outbox({
          destination: 'mail',
          eventType: 'mail.rfq_resend',
          payload: {
            templateId: 'INS-T06',
            ticketId,
            threadId: t.id,
            reason,
            fromUserId: ctx.ticket.ownerId,
          },
        });
      }
      for (const t of list) await repo.save(t); // one at a time: save(list) runs UPDATEs in parallel on the transaction's connection
      ctx.ticket.followUpsStopped = false;
      await markRevisionHandled(ctx, 'restart_threads'); // FR-250
      if (ctx.ticket.stage !== Stage.MARKET) ctx.moveTo(Stage.MARKET, TicketCommand.RESTART_THREADS);
      // TODO(W2): mark open revision handled_via='restart_threads'
      await ctx.audit('Threads restarted', `${list.map((t) => t.threadRef).join(', ')} · ${reason}`);
    });
  }

  /**
   * Apply a classified insurer event to a thread (called by InboundMailService when confident,
   * or from Manual Review confirm - FR-228). Quote creation itself is QuotesService.ingestQuote.
   */
  async applyInsurerEvent(
    actor: Actor,
    ticketId: string,
    threadId: string,
    kind: 'ack' | 'clarification' | 'decline' | 'not_applicable',
    input: { text: string; mailId?: string; claim?: { id: string; label: InboundClass } },
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      // inbound mail: the applied marker commits with the effect; an already applied mail is a no-op
      if (input.claim && !(await claimInboundMail(ctx.manager, input.claim, ctx.now))) return;
      const repo = ctx.manager.getRepository(InsurerThread);
      const t = await repo.findOneByOrFail({ id: threadId, ticketId });
      switch (kind) {
        case 'ack':
          if (t.status === ThreadStatus.RFQ_SENT) t.status = ThreadStatus.ACKNOWLEDGED;
          break;
        case 'clarification':
          t.status = ThreadStatus.INSURER_CLARIFICATION;
          await ctx.manager
            .getRepository(ThreadClarification)
            .insert({ threadId, question: input.text, askedAt: ctx.now, sourceMailId: input.mailId ?? null });
          break;
        case 'decline': // FR-077, BR-050
          Object.assign(t, {
            status: ThreadStatus.DECLINED,
            followUpsActive: false,
            declineReason: input.text,
          });
          break;
        case 'not_applicable':
          break; // logged only (FR-228)
      }
      t.lastEventAt = ctx.now;
      await repo.save(t);
      await ctx.manager.getRepository(ThreadEvent).insert({
        at: ctx.now,
        threadId,
        kind,
        actorType: actor.type,
        actorId: actor.id,
        text: input.text.slice(0, 500),
        mailMessageId: input.mailId ?? null,
      });
      await ctx.audit(
        {
          ack: 'Submission acknowledged',
          clarification: 'Clarification raised',
          decline: 'Declined to quote',
          not_applicable: 'Inbound mail marked not applicable',
        }[kind],
        `${t.threadRef} · ${input.text.slice(0, 200)}`,
      );
      if (kind !== 'ack' && kind !== 'not_applicable') {
        await ctx.outbox({
          destination: 'notification',
          eventType: `thread.${kind}`,
          payload: { ticketId, threadId, ownerId: ctx.ticket.ownerId },
        });
      }
    });
  }
}

import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BimaSetuOutboundType,
  Channel,
  OutcomeType,
  QcrStatus,
  QuoteDecision,
  RevisionAsk,
  RevisionBy,
  RfqStatus,
  Stage,
  TicketCommand,
  type RevisionView,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors, type Actor } from '../audit/actor';
import { TicketWorkflow } from '../tickets/ticket-workflow.service';
import { QcrVersion } from '../qcr/entities/qcr-version.entity';
import { QcrRow } from '../qcr/entities/qcr-row.entity';
import { RfqVersion } from '../rfq/entities/rfq-version.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { Revision } from './entities/revision.entity';
import { isUuid } from '../tickets/ticket-visibility';
import { createRevisionTask, markRevisionHandled } from './revision-handling';

/** M10/M11: client decisions, revision rounds, RFQ V2, terminal outcomes (BR-137: only 3 closures). */

@Injectable()
export class DecisionsService {
  constructor(
    private readonly workflow: TicketWorkflow,
    private readonly ds: DataSource,
  ) {}

  /** BimaSetu revision_request -> new round, stage revision_requested, PM task, no insurer contacted (FR-287, FR-250). */
  async onRevisionRequest(
    actor: Actor,
    ticketId: string,
    input: { by: RevisionBy; reason: string; asks: RevisionAsk[]; messageId: string },
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      if (ctx.ticket.stage !== Stage.QCR_RELEASED)
        throw DomainError.guard('Revision requests apply to a released QCR');
      const released = await ctx.manager
        .getRepository(QcrVersion)
        .findOneOrFail({ where: { ticketId, status: QcrStatus.RELEASED }, order: { version: 'DESC' } });
      // the objection lives on the Revision row: a released QCR is frozen (rule 5, FR-103)
      ctx.ticket.qcrRound += 1;
      await ctx.manager.getRepository(Revision).insert({
        ticketId,
        round: ctx.ticket.qcrRound,
        qcrVersion: released.version,
        by: input.by,
        reason: input.reason,
        asks: input.asks,
        bimasetuMessageId: input.messageId,
        receivedAt: ctx.now,
      });
      ctx.moveTo(Stage.REVISION_REQUESTED, TicketCommand.REVISION_REQUESTED);
      await ctx.audit(
        `Revision requested · round ${ctx.ticket.qcrRound}`,
        `${input.by === 'client' ? 'The client' : 'Us'} objected to QCR V${released.version} · ${input.reason} · asks: ${input.asks.join(', ')} · no insurer contacted`,
      );
      await ctx.outbox({
        destination: 'notification',
        eventType: 'revision.requested',
        payload: { ticketId, ownerId: ctx.ticket.ownerId },
      });
      await createRevisionTask(ctx, ctx.ticket.qcrRound); // FR-250
    });
  }

  async revisions(ticketId: string): Promise<RevisionView[]> {
    const rows = await this.ds
      .getRepository(Revision)
      .find({ where: { ticketId }, order: { round: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      round: r.round,
      qcrVersion: r.qcrVersion,
      by: r.by,
      reason: r.reason,
      asks: r.asks,
      receivedAt: r.receivedAt.toISOString(),
      handledAt: r.handledAt?.toISOString() ?? null,
      handledVia: r.handledVia,
    }));
  }

  /** BimaSetu client_confirmation (FR-288) or manual Log client decision (FR-269). */
  async selectQuote(
    actor: Actor,
    ticketId: string,
    qcrRowId: string,
    source: 'bimasetu' | 'manual',
    qcrRound?: number,
  ) {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      const row = isUuid(qcrRowId)
        ? await ctx.manager.getRepository(QcrRow).findOneBy({ id: qcrRowId })
        : null;
      const qcr = row && (await ctx.manager.getRepository(QcrVersion).findOneBy({ id: row.qcrId, ticketId }));
      if (!row || !qcr) throw DomainError.notFound('Quote row', qcrRowId); // final for BimaSetu, 404 for the PM
      if (qcr.status !== QcrStatus.RELEASED)
        throw DomainError.guard('Quote selection must reference a released QCR (FR-118)');
      if (qcr.rfqVersion !== ctx.ticket.activeRfqVersion)
        throw DomainError.guard('Quote selected against a superseded RFQ version');
      if (qcrRound !== undefined && qcr.round !== qcrRound)
        throw DomainError.guard(`That quote row is not in QCR round ${qcrRound}`);
      // a later released round supersedes this one: a stale confirmation must not close the ticket
      const latest = await ctx.manager.getRepository(QcrVersion).findOne({
        where: { ticketId, status: QcrStatus.RELEASED, rfqVersion: qcr.rfqVersion },
        order: { version: 'DESC' },
      });
      if (latest && latest.id !== qcr.id)
        throw DomainError.guard(`QCR V${qcr.version} was superseded by QCR V${latest.version}`);
      ctx.ticket.outcomeType = OutcomeType.QUOTE_SELECTED;
      ctx.ticket.outcome = {
        insurerId: row.insurerId,
        quoteId: row.quoteId,
        qcrVersion: qcr.version,
        premium: row.premium,
        decidedBy: actor.name,
        source,
      };
      ctx.moveTo(Stage.CLOSED, TicketCommand.CLOSE);
      await ctx.audit(
        source === 'bimasetu' ? 'Client confirmation received' : 'Client decision logged',
        `Quote selected - ${row.insurerName} · QCR V${qcr.version}`,
      );
      // Downstream hand-off: BimaSetu continues to payment & policy (BR-088); bus event for policy admin / finance
      await ctx.outbox({
        destination: 'bus',
        eventType: 'placement.quote_selected',
        payload: {
          ticketNo: ctx.ticket.ticketNo,
          lineRef: ctx.ticket.bimasetuLineRef,
          insurerId: row.insurerId,
          premium: row.premium,
          qcrVersion: qcr.version,
        },
      });
    });
  }

  /** BimaSetu line_lost (FR-288) or manual Lost (FR-269). */
  async markLost(actor: Actor, ticketId: string, reason: string, source: 'bimasetu' | 'manual') {
    return this.workflow.run(ticketId, actor, async (ctx) => {
      ctx.ticket.outcomeType = OutcomeType.LOST;
      ctx.ticket.outcome = { reason, decidedBy: actor.name, source };
      ctx.moveTo(Stage.CLOSED, TicketCommand.CLOSE);
      await ctx.audit(source === 'bimasetu' ? 'Line lost' : 'Client decision logged', `Lost · ${reason}`);
      await ctx.outbox({
        destination: 'bus',
        eventType: 'placement.closed',
        payload: { ticketNo: ctx.ticket.ticketNo, outcome: 'lost' },
      });
    });
  }

  /** PM closes No appetite (FR-133, FR-289): zero-row QCR round + closed_no_appetite to BimaSetu. */
  async closeNoAppetite(user: AuthUser, ticketId: string, reason: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      if (!reason?.trim()) throw DomainError.guard('No appetite needs a reason');
      ctx.ticket.outcomeType = OutcomeType.NO_APPETITE;
      ctx.ticket.outcome = { reason, decidedBy: user.name, source: 'manual' };
      ctx.moveTo(Stage.CLOSED, TicketCommand.CLOSE);
      if (ctx.ticket.channel === Channel.BIMASETU) {
        await ctx.outbox({
          destination: 'bimasetu',
          eventType: BimaSetuOutboundType.QCR_ROUND,
          payload: {
            lineRef: ctx.ticket.bimasetuLineRef,
            ticketNo: ctx.ticket.ticketNo,
            zeroRows: true,
            notice: 'No insurer has appetite for this risk.',
          },
        });
        await ctx.outbox({
          destination: 'bimasetu',
          eventType: BimaSetuOutboundType.CLOSED_NO_APPETITE,
          payload: { lineRef: ctx.ticket.bimasetuLineRef, ticketNo: ctx.ticket.ticketNo, reason },
        });
      } else {
        await ctx.outbox({
          destination: 'mail',
          eventType: 'mail.no_appetite_to_rm',
          payload: { ticketId, reason, fromUserId: ctx.ticket.ownerId },
        });
      }
      await ctx.audit('Ticket closed - no appetite', reason);
      await ctx.outbox({
        destination: 'bus',
        eventType: 'placement.closed',
        payload: { ticketNo: ctx.ticket.ticketNo, outcome: 'no_appetite' },
      });
    });
  }

  /** Manual tickets: Log client decision (FR-268/269). Floated tickets get these from BimaSetu only. */
  async logClientDecision(
    user: AuthUser,
    ticketId: string,
    kind: 'quote_selected' | 'lost' | 'no_appetite',
    input: { qcrRowId?: string; reason?: string },
  ) {
    // channel guard happens inside each branch via the ticket; keep one round-trip simple:
    if (kind === 'quote_selected') {
      if (!input.qcrRowId) throw DomainError.guard('Pick a quote row from the released QCR');
      return this.selectQuote(Actors.user(user), ticketId, input.qcrRowId, 'manual');
    }
    if (!input.reason?.trim()) throw DomainError.guard('A reason is required');
    return kind === 'lost'
      ? this.markLost(Actors.user(user), ticketId, input.reason, 'manual')
      : this.closeNoAppetite(user, ticketId, input.reason);
  }

  /**
   * RFQ Version 2 (M11, FR-126..132, FR-251..253): supersede old RFQ, its quotes and QCRs; reset
   * threads (new threads on float, TH ids continue), counter and follow-ups; back to RFQ Review
   * with the previous selection carried forward ticked.
   */
  async newRfqVersion(
    user: AuthUser,
    ticketId: string,
    input: { changeNote: string; excelDocumentId?: string; linkUrl?: string },
  ) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const m = ctx.manager;
      const prev = await m
        .getRepository(RfqVersion)
        .findOneByOrFail({ ticketId, version: ctx.ticket.activeRfqVersion });
      if ((prev.excelDocumentId && !input.excelDocumentId) || (prev.linkUrl && !input.linkUrl)) {
        throw DomainError.guard('RFQ V2 needs a new source of every type the previous version had (FR-251)');
      }
      prev.status = RfqStatus.SUPERSEDED;
      await m.getRepository(RfqVersion).save(prev);
      const next = prev.version + 1;
      await m.getRepository(RfqVersion).insert({
        ticketId,
        version: next,
        status: RfqStatus.IN_REVIEW,
        excelDocumentId: input.excelDocumentId ?? null,
        linkUrl: input.linkUrl ?? null,
        changeNote: input.changeNote,
        createdById: user.id,
      });
      await m
        .getRepository(Quote)
        .update({ ticketId, rfqVersion: prev.version }, { decision: QuoteDecision.SUPERSEDED });
      await m
        .getRepository(QcrVersion)
        .update({ ticketId, rfqVersion: prev.version }, { status: QcrStatus.SUPERSEDED });
      await m
        .getRepository(InsurerThread)
        .update({ ticketId, rfqVersion: prev.version }, { followUpsActive: false });
      // FR-132: the previous selection is carried forward ticked; the PM adjusts it before floating V2
      await m.query(
        `INSERT INTO panel_selections (ticket_id, rfq_version, insurer_id, branch_id, selected_by_id)
         SELECT ticket_id, $2, insurer_id, branch_id, $3 FROM panel_selections WHERE ticket_id = $1 AND rfq_version = $4`,
        [ticketId, next, user.id, prev.version],
      );
      Object.assign(ctx.ticket, { activeRfqVersion: next, panelLocked: false, followUpsStopped: false });
      await markRevisionHandled(ctx, 'new_rfq_version');
      ctx.moveTo(Stage.RFQ_REVIEW, TicketCommand.NEW_RFQ_VERSION);
      await ctx.audit(`RFQ V${next} created`, input.changeNote);
      await ctx.audit(
        'Insurer threads reset',
        `Quotes against RFQ V${prev.version} retained for audit but no longer count toward the threshold`,
      );
      await ctx.outbox({
        destination: 'notification',
        eventType: 'rfq.v2_created',
        payload: { ticketId, ownerId: ctx.ticket.ownerId },
      });
    });
  }
}

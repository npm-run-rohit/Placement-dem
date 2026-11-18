import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BimaSetuInboundType,
  BusinessType,
  Channel,
  CopycatStatus,
  INDUSTRY_TYPES_SEED,
  ProductTypeCode,
  QcrStatus,
  RiskTier,
  Stage,
  ThreadStatus,
  type QcrView,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors } from '../audit/actor';
import { TicketsService } from '../tickets/tickets.service';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { RfqService } from '../rfq/rfq.service';
import { InsurersService } from '../insurers/insurers.service';
import { ThreadsService } from '../threads/threads.service';
import { QuotesService } from '../quotes/quotes.service';
import { QcrService } from '../qcr/qcr.service';
import { DecisionsService } from '../decisions/decisions.service';
import { MastersService } from '../masters/masters.service';
import { UsersService } from '../users/users.service';
import { DevSimulatorService } from './dev-simulator.service';

export interface JourneyStep {
  step: string;
  detail: string;
  stage: string;
}
export type JourneyUntil = 'qcr_released' | 'closed';

const MAX_STEPS = 40;
/** Threads that are still waiting for the insurer (no quote, not declined, not held for the RM). */
const AWAITING_INSURER: string[] = [ThreadStatus.RFQ_SENT, ThreadStatus.ACKNOWLEDGED];
/** Threads where a quote cannot be marked usable yet (an insurer or RM clarification is open). */
const CLARIFICATION_OPEN: string[] = [ThreadStatus.INSURER_CLARIFICATION, ThreadStatus.AWAITING_RM];

/**
 * DEV ONLY - end-to-end journey simulator (demo, Rohit 2026-11-05). `next` performs ONE step from the ticket's
 * current state through the same services the UI calls (TicketWorkflow inside them), so audit, SLA, outbox and
 * mail all happen for real. The calling user acts as the Placement Manager; RM, insurer, Copycat and BimaSetu
 * events use the existing dev simulators. A step that cannot proceed answers 422 with a reason.
 */
@Injectable()
export class DevJourneyService {
  constructor(
    private readonly ds: DataSource,
    private readonly tickets: TicketsService,
    private readonly rfq: RfqService,
    private readonly insurers: InsurersService,
    private readonly threads: ThreadsService,
    private readonly quotes: QuotesService,
    private readonly qcr: QcrService,
    private readonly decisions: DecisionsService,
    private readonly masters: MastersService,
    private readonly users: UsersService,
    private readonly sim: DevSimulatorService,
  ) {}

  private ticket(id: string) {
    return this.ds.getRepository(PlacementTicket).findOneBy({ id });
  }

  async next(user: AuthUser, ticketId: string): Promise<JourneyStep & { done: boolean }> {
    const t = await this.ticket(ticketId);
    if (!t) throw DomainError.notFound('Ticket', ticketId);
    if (t.stage === Stage.CLOSED)
      return { step: 'Ticket is closed', detail: t.outcomeType ?? '', stage: t.stage, done: true };
    const r = await this.perform(user, t);
    const after = (await this.ticket(ticketId))!;
    return { ...r, stage: after.stage, done: after.stage === Stage.CLOSED };
  }

  async run(user: AuthUser, ticketId: string, until: JourneyUntil = 'qcr_released') {
    const steps: JourneyStep[] = [];
    const reached = (stage: string) =>
      stage === Stage.CLOSED || (until === 'qcr_released' && stage === Stage.QCR_RELEASED);
    const start = await this.ticket(ticketId);
    if (!start) throw DomainError.notFound('Ticket', ticketId);
    if (reached(start.stage)) return { steps };
    for (let i = 0; i < MAX_STEPS; i++) {
      const r = await this.next(user, ticketId);
      steps.push({ step: r.step, detail: r.detail, stage: r.stage });
      if (r.done || reached(r.stage)) return { steps };
    }
    throw DomainError.guard(`Stopped after ${MAX_STEPS} steps without reaching ${until}`, { steps });
  }

  /** A fresh ticket (manual: created as the calling user with the dev RM and a link RFQ; bimasetu: dev float), then run. */
  async journey(user: AuthUser, channel: 'manual' | 'bimasetu' = 'manual', until?: JourneyUntil) {
    let ticketId: string;
    let ticketNo: string;
    if (channel === 'bimasetu') {
      ({ ticketId, ticketNo } = await this.sim.float('gmc_new'));
    } else {
      const [rm] = await this.users.rms();
      if (!rm) throw DomainError.guard('No RM in the directory to raise the ticket for');
      const stamp = Date.now().toString(36).toUpperCase();
      // DEV FIXTURE - demo client name and RFQ link (not business data)
      const created = await this.tickets.createManual(user, {
        rfqLinkUrl: `https://example.test/demo/rfq/${stamp}`,
        businessName: `Demo Journey ${stamp} Pvt Ltd (dev)`,
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: ProductTypeCode.GMC,
        businessType: BusinessType.NEW,
        rmUserId: rm.id,
      } as never);
      ticketId = created.id;
      ticketNo = created.ticketNo;
    }
    const { steps } = await this.run(user, ticketId, until ?? 'qcr_released');
    return { ticketId, ticketNo, steps };
  }

  private async perform(user: AuthUser, t: PlacementTicket): Promise<{ step: string; detail: string }> {
    switch (t.stage) {
      case Stage.RFQ_REVIEW:
        return this.rfqReview(user, t);
      case Stage.AWAITING_RM:
        return this.answerQueries(t);
      case Stage.INSURER_SELECTION:
        return this.selectAndFloat(user, t);
      case Stage.MARKET:
      case Stage.QUOTE_REVIEW:
        return this.collectQuotes(user, t);
      case Stage.QCR_DRAFT:
        return this.draft(user, t);
      case Stage.QCR_RELEASED:
        return this.clientDecision(user, t);
      case Stage.REVISION_REQUESTED:
        throw DomainError.guard(
          'A revision was requested: handle it on the QCR tab, the journey simulator does not pick a revision path',
        );
      default:
        throw DomainError.guard(`No journey step for stage ${t.stage}`);
    }
  }

  private async rfqReview(user: AuthUser, t: PlacementTicket) {
    if (!t.riskTier) {
      await this.rfq.setRiskTier(user, t.id, RiskTier.PREFERRED);
      return { step: 'Risk tier set to Preferred', detail: 'RFQ Review' };
    }
    const open = (await this.rfq.listQueries(t.id)).filter((q) => !q.resolved);
    if (open.some((q) => !q.answer)) return this.answerQueries(t);
    if (open.length) {
      for (const q of open) await this.rfq.resolveQuery(user, t.id, q.id);
      return { step: `${open.length} RM answer(s) resolved`, detail: open.map((q) => q.ref).join(', ') };
    }
    await this.rfq.validate(user, t.id);
    return { step: 'RFQ validated', detail: 'Moved to insurer selection' };
  }

  /** The RM answers every open, unanswered query (BimaSetu query_answer on floated tickets, mail on manual ones). */
  private async answerQueries(t: PlacementTicket) {
    const open = (await this.rfq.listQueries(t.id)).filter((q) => !q.resolved && !q.answer);
    if (!open.length) {
      if (t.stage === Stage.AWAITING_RM)
        throw DomainError.guard(
          'Waiting for the RM but no query is open: raise a query or answer it on the RFQ tab',
        );
      return { step: 'No open queries', detail: '' };
    }
    const answer = 'Answered by the RM (simulated)';
    for (const q of open) {
      if (t.channel === Channel.BIMASETU)
        await this.sim.bimasetuMessage(t.id, BimaSetuInboundType.QUERY_ANSWER, {
          queryRef: q.ref,
          answer,
          answeredBy: { id: 'dev-rm', name: 'RM (simulated)' },
        });
      else
        await this.rfq.recordRmAnswer(Actors.rm('RM (simulated)'), t.id, {
          queryRef: q.ref,
          text: answer,
          answeredBy: 'RM (simulated)',
        });
    }
    return { step: `RM answered ${open.length} query(ies)`, detail: open.map((q) => q.ref).join(', ') };
  }

  /** Up to 3 eligible insurer + branch entities from distinct insurer companies (appetite first), then float. */
  private async selectAndFloat(user: AuthUser, t: PlacementTicket) {
    const panel = await this.insurers.panelForTicket(t.id);
    let picked = panel.filter((e) => e.selected);
    if (!picked.length) {
      const eligible = panel
        .filter((e) => !e.lock && e.pocs.length > 0)
        .sort((a, b) => Number(b.inAppetite) - Number(a.inAppetite));
      const companies = new Set<string>();
      for (const e of eligible) {
        if (companies.has(e.insurerId)) continue;
        companies.add(e.insurerId);
        picked.push(e);
        if (picked.length === 3) break;
      }
      if (!picked.length) throw DomainError.guard(`No eligible insurers with contacts for ${t.productType}`);
      for (const e of picked) await this.threads.togglePanelEntity(user, t.id, e.insurerId, e.branchId, true);
    } else {
      picked = picked.filter((e) => !e.lock);
    }
    await this.threads.floatRfq(user, t.id);
    return {
      step: `RFQ floated to ${picked.length} insurer(s)`,
      detail: picked.map((e) => e.insurerName).join(', '),
    };
  }

  /**
   * Market: the first thread still waiting sends a quote. Quote review: the PM marks the next received quote usable
   * (the third usable company creates the Copycat draft). Nothing left to wait for and under the threshold:
   * early release with the first reason on the master.
   */
  private async collectQuotes(user: AuthUser, t: PlacementTicket) {
    const quotes = (await this.quotes.list(t.id)).filter((q) => q.rfqVersion === t.activeRfqVersion);
    const threads = (await this.threads.list(t.id)).filter((th) => th.rfqVersion === t.activeRfqVersion);
    // decidable = undecided, the latest version on its thread, and no clarification open on that thread
    const latestOnThread = (q: (typeof quotes)[number]) =>
      !quotes.some((o) => o.threadId === q.threadId && o.version > q.version);
    const clarificationOpen = (threadId: string) => {
      const th = threads.find((x) => x.id === threadId);
      return !th || th.held || CLARIFICATION_OPEN.includes(th.status);
    };
    const undecided = quotes.filter((q) => q.decision === null);
    const pending = undecided.find((q) => latestOnThread(q) && !clarificationOpen(q.threadId));
    if (pending) {
      await this.quotes.decide(user, t.id, pending.id, 'usable');
      return {
        step: `Quote from ${pending.insurer.name} marked usable`,
        detail: `Quote V${pending.version}`,
      };
    }
    const waiting = threads.find((th) => !th.latestQuote && AWAITING_INSURER.includes(th.status));
    if (waiting) {
      await this.sim.insurer(t.id, waiting.id, 'quote');
      return {
        step: `Insurer quote received from ${waiting.insurer.name}`,
        detail: `${waiting.threadRef} · copy in Mailpit`,
      };
    }
    if (undecided.length)
      throw DomainError.guard(
        `${undecided.length} quote(s) wait on an open clarification: resolve it on the Insurance Contact tab, then continue`,
      );
    const usable = quotes.filter((q) => q.decision === 'usable');
    if (!usable.length)
      throw DomainError.guard(
        'No insurer is waiting to quote and no quote is usable: close as no appetite or add an insurer',
      );
    const [reason] = await this.masters.lookups('early_release_reason');
    if (!reason) throw DomainError.guard('No early release reason on the master');
    await this.qcr.earlyRelease(user, t.id, reason.value);
    return {
      step: `Early release with ${usable.length} usable quote(s)`,
      detail: reason.value,
    };
  }

  /** Copycat queued / generating: run it now. Ready: tick "Quote rows checked" and release (BimaSetu or RM mail). */
  private async draft(user: AuthUser, t: PlacementTicket) {
    const draft = (await this.qcr.list(t.id)).find((q) => q.status === QcrStatus.DRAFT);
    if (!draft) throw DomainError.guard('No draft QCR on this ticket');
    if (draft.source === 'copycat' && draft.copycatStatus !== CopycatStatus.READY) {
      if (draft.copycatStatus === CopycatStatus.FAILED) {
        await this.qcr.regenerate(user, t.id, draft.id);
        return { step: 'Copycat retry requested', detail: draft.copycatError ?? '' };
      }
      if (!draft.copycatRequestId) throw DomainError.guard('The draft QCR has no Copycat request');
      await this.sim.runCopycat(draft.copycatRequestId);
      const after = (await this.qcr.list(t.id)).find((q) => q.id === draft.id) as QcrView;
      if (after.copycatStatus === CopycatStatus.FAILED)
        throw DomainError.guard(
          `Copycat could not generate the QCR: ${after.copycatError ?? 'unknown error'}`,
        );
      return { step: `QCR V${draft.version} generated by Copycat`, detail: draft.copycatRequestId };
    }
    if (!draft.rowsChecked) await this.qcr.setRowsChecked(user, t.id, draft.id, true);
    await this.qcr.release(user, t.id, draft.id);
    return t.channel === Channel.BIMASETU
      ? { step: `QCR V${draft.version} sent to BimaSetu`, detail: `Round ${draft.round}` }
      : { step: `QCR V${draft.version} sent to the RM by mail`, detail: `${t.rmName} · see Mailpit` };
  }

  /** The client picks the first row of the latest released QCR (BimaSetu confirmation / PM logs the decision). */
  private async clientDecision(user: AuthUser, t: PlacementTicket) {
    const released = (await this.qcr.list(t.id)).find((q) => q.status === QcrStatus.RELEASED);
    if (!released) throw DomainError.guard('No released QCR on this ticket');
    const [row] = await this.qcr.rowsOf(t.id, released.id);
    if (!row) throw DomainError.guard(`QCR V${released.version} has no quote rows to select`);
    if (t.channel === Channel.BIMASETU) {
      await this.sim.bimasetuMessage(t.id, BimaSetuInboundType.CLIENT_CONFIRMATION, {
        qcrRound: released.round,
        quoteRowId: row.id,
      });
      return { step: `Client confirmed ${row.insurerName} in BimaSetu`, detail: `QCR V${released.version}` };
    }
    await this.decisions.logClientDecision(user, t.id, 'quote_selected', { qcrRowId: row.id });
    return {
      step: `Client decision logged: ${row.insurerName} selected`,
      detail: `QCR V${released.version}`,
    };
  }
}

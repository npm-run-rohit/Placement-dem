import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BimaSetuOutboundType,
  Channel,
  CopycatStatus,
  PRODUCT_TYPES_SEED,
  THRESHOLD_DEFAULTS,
  QcrSource,
  QcrStatus,
  QuoteDecision,
  Stage,
  TicketCommand,
  formatCopycatRequestId,
  type QcrView,
  type QcrRowView,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors } from '../audit/actor';
import { TicketWorkflow, type WorkflowContext } from '../tickets/ticket-workflow.service';
import { Quote } from '../quotes/entities/quote.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { QcrVersion } from './entities/qcr-version.entity';
import { QcrRow } from './entities/qcr-row.entity';
import { CopycatRequest } from './entities/copycat-request.entity';
import { Document } from '../documents/document.entity';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { User } from '../users/user.entity';
import {
  ROW_FIELDS,
  normaliseRowValue,
  rowsFromComparison,
  type CopycatComparison,
  type RowAutofill,
  type RowField,
  type RowValues,
} from './row-values';

/** M9 Quote pool, Copycat QCR, manual upload, release (Send to BimaSetu), versioning. */
@Injectable()
export class QcrService {
  constructor(
    @InjectRepository(QcrVersion) private readonly qcrs: Repository<QcrVersion>,
    @InjectRepository(QcrRow) private readonly rows: Repository<QcrRow>,
    private readonly workflow: TicketWorkflow,
  ) {}

  /** QcrView[] newest first (UI-SPEC 3.3.8): Copycat state of the current request, file name, who released it. */
  async list(ticketId: string): Promise<QcrView[]> {
    const m = this.qcrs.manager;
    const list = await this.qcrs.find({ where: { ticketId }, order: { version: 'DESC' } });
    if (!list.length) return [];
    const [requests, docs, users] = await Promise.all([
      m.getRepository(CopycatRequest).find({
        where: {
          requestId: In(list.map((q) => q.currentCopycatRequestId).filter((x): x is string => !!x)),
        },
      }),
      m
        .getRepository(Document)
        .find({ where: { id: In(list.map((q) => q.documentId).filter((x): x is string => !!x)) } }),
      m
        .getRepository(User)
        .find({ where: { id: In(list.map((q) => q.releasedById).filter((x): x is string => !!x)) } }),
    ]);
    return list.map((q) => {
      const req = requests.find((r) => r.requestId === q.currentCopycatRequestId);
      return {
        id: q.id,
        version: q.version,
        rfqVersion: q.rfqVersion,
        round: q.round,
        status: q.status,
        source: q.source,
        copycatStatus: req?.status ?? null,
        copycatError: req?.error ?? null,
        copycatRequestId: q.currentCopycatRequestId,
        earlyReleaseReason: q.earlyReleaseReason,
        earlyReleaseCount: q.earlyReleaseCount,
        rowsChecked: q.rowsChecked,
        quoteIds: q.quoteIds,
        releasedAt: q.releasedAt?.toISOString() ?? null,
        releasedBy: users.find((u) => u.id === q.releasedById)?.name ?? null,
        sentTo: q.sentTo,
        coverNote: q.coverNote,
        documentId: q.documentId,
        fileName: docs.find((d) => d.id === q.documentId)?.fileName ?? null,
        createdAt: q.createdAt.toISOString(),
      };
    });
  }

  /** Quote rows of one of this ticket's QCRs (scoped to the ticket: FR-208 is checked on the ticket id). */
  async rowsOf(ticketId: string, qcrId: string): Promise<QcrRowView[]> {
    if (!(await this.qcrs.existsBy({ id: qcrId, ticketId }))) throw DomainError.notFound('QCR', qcrId);
    const rows = await this.rows.find({ where: { qcrId }, order: { insurerName: 'ASC' } });
    return rows.map((r) => ({
      id: r.id,
      quoteId: r.quoteId,
      insurerId: r.insurerId,
      insurerName: r.insurerName,
      premium: r.premium,
      sumInsured: r.sumInsured,
      validityDate: r.validityDate,
      termsNote: r.termsNote,
      autofill: r.autofill ?? {},
      edited: (r.edited ?? []) as QcrRowView['edited'],
    }));
  }

  /**
   * Create the draft QCR inside an existing workflow transaction (threshold auto-draft, early
   * release, late-quote next version). 1 usable quote -> single_quote (no Copycat, FR-106);
   * 2+ -> Copycat queued (FR-097). Stops follow-ups (FR-096).
   */
  async createDraftInTx(
    ctx: WorkflowContext,
    opts: { earlyReleaseReason: string | null; command: TicketCommand },
  ) {
    const t = ctx.ticket;
    const m = ctx.manager;
    const usable = await m
      .getRepository(Quote)
      .find({ where: { ticketId: t.id, rfqVersion: t.activeRfqVersion, decision: QuoteDecision.USABLE } });
    if (!usable.length) throw DomainError.guard('QCR needs at least one usable quote');
    const existingDraft = await m
      .getRepository(QcrVersion)
      .count({ where: { ticketId: t.id, status: QcrStatus.DRAFT } });
    if (existingDraft) throw DomainError.guard('A draft QCR already exists');
    await this.openNextRoundIfReleased(ctx);

    const version = (await m.getRepository(QcrVersion).count({ where: { ticketId: t.id } })) + 1;
    const single = usable.length === 1;
    const qcr = await m.getRepository(QcrVersion).save(
      m.getRepository(QcrVersion).create({
        ticketId: t.id,
        version,
        rfqVersion: t.activeRfqVersion,
        round: t.qcrRound,
        status: QcrStatus.DRAFT,
        source: single ? QcrSource.SINGLE_QUOTE : QcrSource.COPYCAT,
        quoteIds: usable.map((q) => q.id),
        earlyReleaseReason: opts.earlyReleaseReason,
        earlyReleaseCount: opts.earlyReleaseReason ? new Set(usable.map((q) => q.insurerId)).size : null,
        documentId: single ? usable[0].documentId : null,
      }),
    );
    await this.seedRows(ctx, qcr, usable);
    await this.stopFollowUps(ctx);
    // INT-T03: the normal threshold, not an early release (FR-065)
    if (!opts.earlyReleaseReason)
      await ctx.outbox({
        destination: 'notification',
        eventType: 'quote.threshold_reached',
        payload: { ticketId: ctx.ticket.id, ownerId: ctx.ticket.ownerId, qcrVersion: qcr.version },
      });

    if (!single) {
      await this.queueCopycat(ctx, qcr, usable, 1);
      await ctx.audit(
        `Draft QCR V${version} queued for Copycat`,
        `${usable.length} PDF(s)${opts.earlyReleaseReason ? ` · early release · ${opts.earlyReleaseReason}` : ''}`,
      );
    } else {
      await ctx.audit(
        `QCR V${version} created from a single quote (no Copycat)`,
        `early release · ${opts.earlyReleaseReason ?? ''}`,
      );
    }
    ctx.moveTo(Stage.QCR_DRAFT, opts.command);
    return qcr;
  }

  /**
   * A QCR after a released one is the next round (FR-105, BR-066). A revision request already opened that round;
   * any other path back to the market (restart threads, add insurer, late quote) did not, so open it here.
   * One round per released QCR: never two released versions in the same round.
   */
  private async openNextRoundIfReleased(ctx: WorkflowContext) {
    const latest = await ctx.manager.getRepository(QcrVersion).findOne({
      where: { ticketId: ctx.ticket.id, rfqVersion: ctx.ticket.activeRfqVersion, status: QcrStatus.RELEASED },
      order: { version: 'DESC' },
    });
    if (latest && latest.round === ctx.ticket.qcrRound) ctx.ticket.qcrRound += 1;
  }

  private async seedRows(ctx: WorkflowContext, qcr: QcrVersion, quotes: Quote[]) {
    const insurers = await ctx.manager
      .getRepository(Insurer)
      .find({ where: { id: In(quotes.map((q) => q.insurerId)) } });
    const name = (id: string) => insurers.find((i) => i.id === id)?.name ?? id;
    await ctx.manager.getRepository(QcrRow).save(
      quotes.map((q) =>
        ctx.manager.getRepository(QcrRow).create({
          qcrId: qcr.id,
          quoteId: q.id,
          insurerId: q.insurerId,
          insurerName: name(q.insurerId),
          premium: q.premium,
          // the premium the PM recorded on the quote is the first autofill; Copycat's QCR replaces it (FR-286)
          autofill: q.premium != null ? { premium: { value: q.premium, source: 'quote' } } : {},
        }),
      ),
    );
  }

  private async stopFollowUps(ctx: WorkflowContext) {
    if (ctx.ticket.followUpsStopped) return;
    ctx.ticket.followUpsStopped = true;
    await ctx.manager
      .getRepository(InsurerThread)
      .update(
        { ticketId: ctx.ticket.id, rfqVersion: ctx.ticket.activeRfqVersion },
        { followUpsActive: false },
      );
    await ctx.audit('Automated follow-ups stopped', 'Insurer threads remain open (FR-066)');
  }

  private async queueCopycat(ctx: WorkflowContext, qcr: QcrVersion, quotes: Quote[], attempt: number) {
    const requestId = formatCopycatRequestId(ctx.ticket.ticketNo, qcr.version, attempt);
    const docs = await ctx.manager
      .getRepository(Document)
      .find({ where: { id: In(quotes.map((q) => q.documentId)) } });
    const insurers = await ctx.manager
      .getRepository(Insurer)
      .find({ where: { id: In(quotes.map((q) => q.insurerId)) } });
    await ctx.manager.getRepository(CopycatRequest).insert({
      qcrId: qcr.id,
      requestId,
      attempt,
      status: CopycatStatus.QUEUED,
      queuedAt: ctx.now,
      documents: quotes.map((q) => ({
        quoteId: q.id,
        insurerId: q.insurerId,
        insurer: insurers.find((i) => i.id === q.insurerId)?.name ?? q.insurerId,
        documentId: q.documentId,
        fileName: docs.find((d) => d.id === q.documentId)?.fileName ?? 'quote.pdf',
        version: q.version,
      })),
    });
    qcr.currentCopycatRequestId = requestId;
    await ctx.manager.getRepository(QcrVersion).save(qcr);
    // Network call happens OUTSIDE the transaction in the single Copycat runner (FR-239)
    await ctx.outbox({
      destination: 'copycat',
      eventType: 'copycat.generate',
      payload: { requestId, qcrId: qcr.id, ticketId: ctx.ticket.id },
    });
  }

  /** Early release with 1-2 usable quotes and a reason (FR-106/107). */
  async earlyRelease(user: AuthUser, ticketId: string, reason: string) {
    return this.workflow.run(ticketId, Actors.user(user), (ctx) =>
      this.createDraftInTx(ctx, { earlyReleaseReason: reason, command: TicketCommand.EARLY_RELEASE }),
    );
  }

  /** Manual QCR upload (FR-266/267): source=manual, straight to Pending Placement Release. */
  async uploadManual(user: AuthUser, ticketId: string, documentId: string, earlyReleaseReason?: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const t = ctx.ticket;
      const m = ctx.manager;
      if (![Stage.MARKET, Stage.QUOTE_REVIEW, Stage.QCR_RELEASED, Stage.REVISION_REQUESTED].includes(t.stage))
        throw DomainError.guard('A QCR can be uploaded once quotes are being collected');
      if (await m.getRepository(QcrVersion).count({ where: { ticketId, status: QcrStatus.DRAFT } }))
        throw DomainError.guard('A draft QCR already exists');
      const usable = await m
        .getRepository(Quote)
        .find({ where: { ticketId, rfqVersion: t.activeRfqVersion, decision: QuoteDecision.USABLE } });
      if (!usable.length) throw DomainError.guard('QCR needs at least one usable quote');
      const doc = await m.getRepository(Document).findOneBy({ id: documentId, ticketId });
      if (!doc) throw DomainError.guard('Upload the QCR file to this ticket first');
      // validation table M9: below the threshold a reason is required, unless it follows a released QCR (late quote)
      const distinct = new Set(usable.map((q) => q.insurerId)).size;
      const afterRelease = t.stage === Stage.QCR_RELEASED || t.stage === Stage.REVISION_REQUESTED;
      const below = distinct < THRESHOLD_DEFAULTS.usableQuoteThreshold;
      if (below && !afterRelease && !earlyReleaseReason?.trim())
        throw DomainError.guard(
          `Below ${THRESHOLD_DEFAULTS.usableQuoteThreshold} usable quotes a reason is required (FR-107)`,
        );
      await this.openNextRoundIfReleased(ctx); // late quote after release: next round (FR-105)

      const version = (await m.getRepository(QcrVersion).count({ where: { ticketId } })) + 1;
      const reason = below ? (earlyReleaseReason?.trim() ?? null) : null;
      const qcr = await m.getRepository(QcrVersion).save(
        m.getRepository(QcrVersion).create({
          ticketId,
          version,
          rfqVersion: t.activeRfqVersion,
          round: t.qcrRound,
          status: QcrStatus.DRAFT,
          source: QcrSource.MANUAL,
          quoteIds: usable.map((q) => q.id),
          earlyReleaseReason: reason,
          earlyReleaseCount: reason ? distinct : null,
          documentId,
        }),
      );
      await this.seedRows(ctx, qcr, usable);
      await this.stopFollowUps(ctx);
      await ctx.audit(
        `QCR V${version} uploaded manually`,
        `${doc.fileName}${reason ? ` · early release · ${reason}` : ''}`,
      );
      ctx.moveTo(Stage.QCR_DRAFT, TicketCommand.UPLOAD_QCR);
      return qcr;
    });
  }

  /** Retry with Copycat (failed) / Regenerate with Copycat (stale ready draft) - new attempt + request id (FR-242). */
  async regenerate(user: AuthUser, ticketId: string, qcrId: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const qcr = await ctx.manager
        .getRepository(QcrVersion)
        .findOneByOrFail({ id: qcrId, ticketId, status: QcrStatus.DRAFT });
      if (qcr.source !== QcrSource.COPYCAT) throw DomainError.guard('Only Copycat drafts can be regenerated');
      const usable = await ctx.manager.getRepository(Quote).find({
        where: { ticketId, rfqVersion: ctx.ticket.activeRfqVersion, decision: QuoteDecision.USABLE },
      });
      const attempt = (await ctx.manager.getRepository(CopycatRequest).count({ where: { qcrId } })) + 1;
      qcr.quoteIds = usable.map((q) => q.id);
      qcr.rowsChecked = false;
      await ctx.manager.getRepository(QcrRow).delete({ qcrId });
      await this.seedRows(ctx, qcr, usable);
      await this.queueCopycat(ctx, qcr, usable, attempt);
      await ctx.audit(
        `QCR V${qcr.version} regeneration requested`,
        `${usable.length} PDF(s) · attempt ${attempt}`,
      );
    });
  }

  /** Copycat runner callbacks. Stale request ids are ignored (FR-240). */
  async copycatResult(
    requestId: string,
    result:
      | { ok: true; documentId: string; comparison?: Record<string, unknown>; rows?: Array<Partial<QcrRow>> }
      | { ok: false; error: string },
  ) {
    const req = await this.qcrs.manager.getRepository(CopycatRequest).findOneBy({ requestId });
    if (!req) return;
    const qcr = await this.qcrs.findOneByOrFail({ id: req.qcrId });
    if (qcr.currentCopycatRequestId !== requestId || qcr.status !== QcrStatus.DRAFT) return; // superseded
    // a request completes once: a second run of the same id (worker job + dev run) must not reset the draft
    if (req.status === CopycatStatus.READY || req.status === CopycatStatus.FAILED) return;
    await this.workflow.run(qcr.ticketId, Actors.copycat(), async (ctx) => {
      const r = ctx.manager.getRepository(CopycatRequest);
      // re-read under the ticket lock: two concurrent runs of one request apply only the first answer
      const fresh = await r.findOneByOrFail({ id: req.id });
      if (fresh.status === CopycatStatus.READY || fresh.status === CopycatStatus.FAILED) return;
      if (result.ok) {
        await r.update(req.id, {
          status: CopycatStatus.READY,
          finishedAt: ctx.now,
          resultDocumentId: result.documentId,
          result: (result.comparison ?? null) as never,
        }); // jsonb
        await ctx.manager.getRepository(QcrVersion).update(qcr.id, {
          documentId: result.documentId,
          copycatResult: (result.comparison ?? null) as never,
          rowsChecked: false,
        }); // jsonb
        // Copycat output is the source for rows (FR-286): its per-quote rows first, then its comparison table.
        // Fields the PM already edited keep the PM's value; the autofill is recorded either way.
        const fromComparison = rowsFromComparison(result.comparison as CopycatComparison | undefined);
        const rowRepo = ctx.manager.getRepository(QcrRow);
        for (const row of await rowRepo.findBy({ qcrId: qcr.id })) {
          const sent = (result.rows ?? []).find((r) => r.quoteId === row.quoteId) ?? {};
          const table = fromComparison.get(row.quoteId) ?? {};
          const autofill: RowAutofill = { ...row.autofill };
          const patch: Partial<QcrRow> = {};
          for (const f of ROW_FIELDS) {
            // Copycat's values get the same check as a PM edit; one that does not parse falls back to the table.
            const value = [(sent as Partial<RowValues>)[f], table[f]]
              .map((v) => normaliseRowValue(f, v))
              .map((n) => (n.ok ? n.value : null))
              .find((v) => v !== null);
            if (value === undefined || value === null) continue;
            (autofill as Record<string, unknown>)[f] = { value, source: 'copycat' };
            if (!row.edited.includes(f)) (patch as Record<string, unknown>)[f] = value;
          }
          await rowRepo.update(row.id, { ...patch, autofill: autofill as never });
        }
        await ctx.audit(`QCR V${qcr.version} generated by Copycat`, requestId);
        await ctx.outbox({
          destination: 'notification',
          eventType: 'qcr.ready',
          payload: { ticketId: qcr.ticketId, ownerId: ctx.ticket.ownerId, qcrVersion: qcr.version },
        });
      } else {
        await r.update(req.id, { status: CopycatStatus.FAILED, finishedAt: ctx.now, error: result.error });
        await ctx.audit(`Copycat could not generate QCR V${qcr.version}`, result.error);
        await ctx.outbox({
          destination: 'notification',
          eventType: 'qcr.failed',
          payload: {
            ticketId: qcr.ticketId,
            ownerId: ctx.ticket.ownerId,
            templateId: 'INT-T04',
            error: result.error,
            qcrVersion: qcr.version,
          },
        });
      }
    });
  }

  /** What the runner sends to Copycat; null when the request is no longer current (superseded / released). */
  async copycatJob(requestId: string) {
    const req = await this.qcrs.manager.getRepository(CopycatRequest).findOneBy({ requestId });
    if (!req) return null;
    const qcr = await this.qcrs.findOneByOrFail({ id: req.qcrId });
    if (qcr.currentCopycatRequestId !== requestId || qcr.status !== QcrStatus.DRAFT) return null;
    if (req.status === CopycatStatus.READY || req.status === CopycatStatus.FAILED) return null; // already answered
    const ticket = await this.qcrs.manager
      .getRepository(PlacementTicket)
      .findOneByOrFail({ id: qcr.ticketId });
    const product = PRODUCT_TYPES_SEED.find((p) => p.code === ticket.productType);
    return { request: req, qcr, ticket, rfqTemplate: product?.rfqTemplate ?? ticket.productType };
  }

  async markCopycatStarted(requestId: string) {
    await this.qcrs.manager
      .getRepository(CopycatRequest)
      .update(
        { requestId, status: CopycatStatus.QUEUED },
        { status: CopycatStatus.GENERATING, startedAt: new Date() },
      );
  }

  /**
   * PM edit of a quote row (FR-286). The value is checked per field; a real change clears "Quote rows checked"
   * (UI-SPEC 3.3.8 #9) and marks the field edited, unless it puts back the autofilled value.
   */
  async setRow(
    user: AuthUser,
    ticketId: string,
    qcrId: string,
    quoteId: string,
    field: RowField,
    raw: unknown,
  ) {
    const check = normaliseRowValue(field, raw);
    if (!check.ok) throw DomainError.guard(check.reason);
    const value = check.value;
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const qcr = await ctx.manager.getRepository(QcrVersion).findOneByOrFail({ id: qcrId, ticketId });
      if (qcr.status !== QcrStatus.DRAFT) throw DomainError.guard('Released QCRs are immutable (FR-103)');
      const repo = ctx.manager.getRepository(QcrRow);
      const row = await repo.findOneBy({ qcrId, quoteId });
      if (!row) throw DomainError.notFound('Quote row', quoteId);
      const before = row[field];
      if (String(before ?? '') === String(value ?? '')) return;
      const auto = row.autofill?.[field];
      const backToAuto = auto !== undefined && String(auto.value ?? '') === String(value ?? '');
      const edited = new Set(row.edited ?? []);
      if (backToAuto) edited.delete(field);
      else edited.add(field);
      await repo.update(row.id, { [field]: value, edited: [...edited] });
      await ctx.manager.getRepository(QcrVersion).update(qcrId, { rowsChecked: false });
      await ctx.audit(
        `QCR V${qcr.version} quote row edited`,
        `${row.insurerName} · ${field}: ${before ?? '-'} -> ${value ?? '-'}${backToAuto ? ' (back to the QCR value)' : ''}`,
      );
    });
  }

  async setRowsChecked(user: AuthUser, ticketId: string, qcrId: string, checked: boolean) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const qcr = await ctx.manager
        .getRepository(QcrVersion)
        .findOneByOrFail({ id: qcrId, ticketId, status: QcrStatus.DRAFT });
      if (qcr.rowsChecked === checked) return;
      await ctx.manager.getRepository(QcrVersion).update(qcrId, { rowsChecked: checked });
      await ctx.audit(`QCR V${qcr.version} quote rows ${checked ? 'checked' : 'unchecked'}`);
    });
  }

  /**
   * Send to BimaSetu / release to RM (FR-101/102/184, FR-241, FR-285): requires a ready draft
   * (Copycat ready, manual file, or single quote) AND rows checked. Freezes the version.
   * Insurer documents / thread details are NEVER sent to BimaSetu (FR-290).
   */
  async release(user: AuthUser, ticketId: string, qcrId: string, coverNote?: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const qcr = await ctx.manager
        .getRepository(QcrVersion)
        .findOneByOrFail({ id: qcrId, ticketId, status: QcrStatus.DRAFT });
      if (qcr.source === QcrSource.COPYCAT) {
        const req = await ctx.manager
          .getRepository(CopycatRequest)
          .findOneBy({ requestId: qcr.currentCopycatRequestId ?? '' });
        if (req?.status !== CopycatStatus.READY)
          throw DomainError.guard('Copycat has not returned the QCR yet');
      }
      if (!qcr.documentId) throw DomainError.guard('QCR file missing');
      if (!qcr.rowsChecked) throw DomainError.guard('Tick "Quote rows checked" first');
      const bimasetu = ctx.ticket.channel === Channel.BIMASETU;
      Object.assign(qcr, {
        status: QcrStatus.RELEASED,
        releasedAt: ctx.now,
        releasedById: user.id,
        sentTo: bimasetu ? 'BimaSetu' : `${ctx.ticket.rmName} (RM)`,
        coverNote: coverNote ?? null,
      });
      await ctx.manager.getRepository(QcrVersion).save(qcr);
      // mark usable threads' quotes as "sent in QCR Vn" via quote_ids (already frozen on qcr)
      if (bimasetu) {
        await ctx.outbox({
          destination: 'bimasetu',
          eventType: BimaSetuOutboundType.QCR_ROUND,
          payload: { lineRef: ctx.ticket.bimasetuLineRef, ticketNo: ctx.ticket.ticketNo, qcrId: qcr.id },
        });
      } else {
        await ctx.outbox({
          destination: 'mail',
          eventType: 'mail.qcr_to_rm',
          payload: { ticketId, qcrId: qcr.id, coverNote, fromUserId: ctx.ticket.ownerId },
        });
      }
      ctx.moveTo(Stage.QCR_RELEASED, TicketCommand.RELEASE_QCR);
      await ctx.audit(
        bimasetu ? `QCR V${qcr.version} sent to BimaSetu` : `QCR V${qcr.version} released to RM`,
        `${qcr.source} QCR · round ${qcr.round} · version locked`,
      );
      return qcr;
    });
  }

  /**
   * Late quote after release -> next QCR version as the next round (FR-105, BR-066). Also the revision round: after
   * a revision the PM restarts threads (back to market / quote review) and sends the re-rated quotes as the next
   * version of the released QCR (FR-250); the round was already opened by the revision request.
   */
  async newVersion(user: AuthUser, ticketId: string) {
    return this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      const stage = ctx.ticket.stage;
      const revisionRound =
        (stage === Stage.MARKET || stage === Stage.QUOTE_REVIEW) &&
        (await ctx.manager.getRepository(QcrVersion).count({
          where: { ticketId, rfqVersion: ctx.ticket.activeRfqVersion, status: QcrStatus.RELEASED },
        })) > 0;
      if (stage !== Stage.QCR_RELEASED && stage !== Stage.REVISION_REQUESTED && !revisionRound)
        throw DomainError.guard('A new QCR version follows a released QCR');
      ctx.ticket.followUpsStopped = false; // so stopFollowUps() audits consistently for the new draft
      return this.createDraftInTx(ctx, { earlyReleaseReason: null, command: TicketCommand.NEW_QCR_VERSION });
    });
  }
}

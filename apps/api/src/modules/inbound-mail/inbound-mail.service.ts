import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import {
  DocumentKind,
  InboundClass,
  PRODUCT_TYPES_SEED,
  ReviewQueue,
  ReviewStatus,
  Stage,
  type InboundMailView,
  type ManualReviewCounts,
  type ReviewTicketOption,
} from '@bimaplacement/contracts';
import { assertTicketVisible, seesEscalated } from '../tickets/ticket-visibility';
import { DomainError } from '../../common/errors/domain-error';
import { Clock } from '../../common/time/clock';
import type { AuthUser } from '../../common/auth/auth.types';
import type { InboundMailRaw } from '../../infrastructure/mail/mailbox.port';
import { Actors } from '../audit/actor';
import { DocumentsService } from '../documents/documents.service';
import { Document } from '../documents/document.entity';
import { ThreadsService } from '../threads/threads.service';
import { QuotesService } from '../quotes/quotes.service';
import { TicketWorkflow } from '../tickets/ticket-workflow.service';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { ThreadEvent } from '../threads/entities/thread-event.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { User } from '../users/user.entity';
import { MailMessage } from '../communications/entities/mail-message.entity';
import { MailTrailService } from '../communications/mail-trail.service';
import { InboundMail } from './entities/inbound-mail.entity';
import { MAIL_CLASSIFIER, type MailClassifier } from './classifier.port';
import { matchProductTypes, parseSubjectRefs } from './product-matcher';

/** Confidence below which nothing is applied automatically (BR-046). TODO: Threshold master. */
const AUTO_APPLY_MIN = 0.85;
/** Classes a reviewer can confirm (UI-SPEC 3.4) - Acknowledged is accepted too (FR-074). */
const REVIEW_CLASSES = [
  InboundClass.QUOTE_RECEIVED,
  InboundClass.CLARIFICATION_REQUIRED,
  InboundClass.DECLINED,
  InboundClass.NOT_APPLICABLE,
  InboundClass.ACKNOWLEDGED,
];

type Mapping = {
  ticket: PlacementTicket | null;
  thread: InsurerThread | null;
  basis: string | null;
  confidence: number;
  senderOnly: boolean;
};

/**
 * M7 pipeline: dedupe -> store attachments -> map (reply chain / subject refs / sender) -> classify ->
 * auto-apply when mapped and confident, else route to My reviews (mapped, unclear) or Unmatched (shared).
 * Ambiguous mail never updates commercial data (BR-046); every applied event goes through the same
 * ThreadsService / QuotesService commands a mapped mail would use (FR-228).
 */
@Injectable()
export class InboundMailService {
  private readonly logger = new Logger(InboundMailService.name);

  constructor(
    @InjectRepository(InboundMail) private readonly mails: Repository<InboundMail>,
    @Inject(MAIL_CLASSIFIER) private readonly classifier: MailClassifier,
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly documents: DocumentsService,
    private readonly threads: ThreadsService,
    private readonly quotes: QuotesService,
    private readonly workflow: TicketWorkflow,
    private readonly mailTrail: MailTrailService,
  ) {}

  async ingest(raw: InboundMailRaw): Promise<InboundMail | null> {
    if (await this.mails.exist({ where: { providerMessageId: raw.providerMessageId } })) return null; // duplicate (10.2)
    const map = await this.map(raw);
    const cls = await this.classifier.classify({
      subject: raw.subject,
      body: raw.textBody,
      attachmentNames: raw.attachments.map((a) => a.fileName),
    });

    const docIds: string[] = [];
    const rejected: string[] = []; // failed the malware scan (PLAN 4.5): never stored, never applied
    for (const a of raw.attachments) {
      const kind =
        /\.pdf$/i.test(a.fileName) && cls.label === InboundClass.QUOTE_RECEIVED
          ? DocumentKind.QUOTE
          : DocumentKind.MAIL_ATTACHMENT;
      try {
        const doc = await this.documents.upload({
          ticketId: map.ticket?.id ?? null,
          kind,
          fileName: a.fileName,
          contentType: a.contentType,
          buffer: await a.fetch(),
          uploadedBy: `insurer:${raw.from}`,
        });
        docIds.push(doc.id);
      } catch (e) {
        if (!(e instanceof DomainError && e.code === 'MALWARE_DETECTED')) throw e;
        rejected.push(a.fileName);
      }
    }

    const unknownSender =
      !!map.thread && !map.thread.pocs.some((p) => p.email.toLowerCase() === raw.from.toLowerCase());
    const closed = map.ticket?.stage === Stage.CLOSED;
    let queue: ReviewQueue;
    let reason: string | null;
    if (!map.thread || map.senderOnly) {
      queue = ReviewQueue.UNMATCHED;
      reason = map.senderOnly
        ? 'Matched by sender only - confirm the ticket and thread'
        : map.ticket
          ? 'Ticket found but no insurer thread reference'
          : 'No reliable ticket/thread reference';
    } else if (unknownSender) {
      queue = ReviewQueue.UNMATCHED; // FR-071 / FR-227: attached to the thread's trail, but a person confirms
      reason = 'Unrecognised sender';
    } else if (closed) {
      queue = ReviewQueue.NONE; // closed tickets never reopen (FR-135): keep it on the trail only
      reason = 'Ticket closed - kept on the Mail Trail only';
    } else if (cls.confidence >= AUTO_APPLY_MIN && cls.label !== InboundClass.NOT_APPLICABLE) {
      queue = ReviewQueue.NONE;
      reason = null;
    } else {
      queue = ReviewQueue.MY_REVIEWS;
      reason = 'Mapped, interpretation unclear';
    }
    if (rejected.length) {
      const note = `Attachment rejected, malware detected: ${rejected.join(', ')}`;
      if (queue === ReviewQueue.NONE && !closed) queue = ReviewQueue.MY_REVIEWS; // a person decides, never auto-applied
      reason = reason ? `${reason} · ${note}` : note;
    }

    const saved = await this.mails.save(
      this.mails.create({
        providerMessageId: raw.providerMessageId,
        mailbox: raw.mailbox,
        fromAddress: raw.from,
        toAddresses: raw.to,
        subject: raw.subject,
        bodyText: raw.textBody,
        receivedAt: raw.receivedAt,
        attachmentDocumentIds: docIds,
        ticketId: map.ticket?.id ?? null,
        threadId: map.thread?.id ?? null,
        mappingConfidence: map.confidence,
        mappingBasis: map.basis,
        unknownSender,
        classification: cls.label,
        classificationConfidence: cls.confidence,
        reviewQueue: queue,
        reviewReason: reason,
        reviewStatus: queue === ReviewQueue.NONE ? ReviewStatus.CONFIRMED : ReviewStatus.PENDING,
      }),
    );

    // a reliably mapped mail is on the ticket's Mail Trail straight away (also when it still needs review)
    if (map.ticket && map.thread && !map.senderOnly) await this.toMailTrail(saved);
    if (queue === ReviewQueue.NONE && !closed) await this.apply(saved, cls.label, null);
    return saved;
  }

  /** Manual Review queues (FR-227). My reviews = mapped and owned by me; Unmatched = shared. Pending first, then today's done. */
  async queue(user: AuthUser, which: 'my_reviews' | 'unmatched'): Promise<InboundMailView[]> {
    const qb = this.mails
      .createQueryBuilder('m')
      .where('m.reviewQueue = :q', { q: which })
      .andWhere('(m.reviewStatus = :p OR m.reviewedAt >= :since)', {
        p: ReviewStatus.PENDING,
        since: new Date(this.clock.now().getTime() - 24 * 3600_000),
      })
      .orderBy('m.receivedAt', 'DESC');
    if (which === 'my_reviews')
      qb.innerJoin(PlacementTicket, 't', 't.id = m.ticket_id').andWhere('t.owner_id = :me', { me: user.id });
    const rows = await qb.getMany();
    rows.sort(
      (a, b) =>
        Number(a.reviewStatus !== ReviewStatus.PENDING) - Number(b.reviewStatus !== ReviewStatus.PENDING),
    );
    return this.views(rows);
  }

  async counts(user: AuthUser): Promise<ManualReviewCounts> {
    const myReviews = await this.mails
      .createQueryBuilder('m')
      .innerJoin(PlacementTicket, 't', 't.id = m.ticket_id')
      .where('m.reviewQueue = :q AND m.reviewStatus = :s AND t.owner_id = :me', {
        q: ReviewQueue.MY_REVIEWS,
        s: ReviewStatus.PENDING,
        me: user.id,
      })
      .getCount();
    const unmatched = await this.mails.count({
      where: { reviewQueue: ReviewQueue.UNMATCHED, reviewStatus: ReviewStatus.PENDING },
    });
    return { myReviews, unmatched };
  }

  /** Ticket picker for an unmatched mail: open tickets, those whose product type the mail mentions first (FR-231). */
  async ticketOptions(user: AuthUser, mailId: string): Promise<ReviewTicketOption[]> {
    const mail = await this.mails.findOneByOrFail({ id: mailId });
    const matched = new Set<string>(await this.matchedProducts(mail));
    const open = await this.ds.getRepository(PlacementTicket).find({
      // FR-208: escalated tickets are not offered to a PM
      where: { stage: Not(Stage.CLOSED), ...(seesEscalated(user) ? {} : { escalated: false }) },
      order: { ticketNo: 'DESC' },
    });
    return open
      .map((t) => ({
        id: t.id,
        ticketNo: t.ticketNo,
        businessName: t.businessName,
        productType: t.productType,
        matches: matched.has(t.productType),
      }))
      .sort((a, b) => Number(b.matches) - Number(a.matches));
  }

  /** FR-228: confirm classification -> applied exactly as a confidently mapped insurer mail would be. */
  async confirmClassification(user: AuthUser, mailId: string, label: InboundClass): Promise<InboundMailView> {
    if (!REVIEW_CLASSES.includes(label)) throw DomainError.guard(`Pick one of: ${REVIEW_CLASSES.join(', ')}`);
    const mail = await this.mails.findOneByOrFail({ id: mailId });
    if (mail.reviewStatus !== ReviewStatus.PENDING)
      throw DomainError.guard('This mail has already been reviewed');
    if (!mail.ticketId || !mail.threadId)
      throw DomainError.guard('Map the mail to a ticket and insurer thread first');
    await assertTicketVisible(this.ds, user, mail.ticketId); // FR-208
    if (label === InboundClass.QUOTE_RECEIVED && !mail.attachmentDocumentIds.length)
      throw DomainError.guard('There is no attachment to record as the quote');

    await this.apply(mail, label, user);
    Object.assign(mail, {
      reviewStatus: ReviewStatus.CONFIRMED,
      reviewedById: user.id,
      reviewedAt: this.clock.now(),
      appliedClass: label,
    });
    await this.mails.save(mail);
    return (await this.views([mail]))[0];
  }

  /** FR-229: map an unmatched mail to ticket + thread - logged on the thread and audit, thread status unchanged. */
  async confirmMapping(
    user: AuthUser,
    mailId: string,
    ticketId: string,
    threadId: string,
  ): Promise<InboundMailView> {
    const mail = await this.mails.findOneByOrFail({ id: mailId });
    if (mail.reviewStatus !== ReviewStatus.PENDING || mail.reviewQueue !== ReviewQueue.UNMATCHED)
      throw DomainError.guard('Only a pending unmatched mail can be mapped');
    await assertTicketVisible(this.ds, user, ticketId); // FR-208
    const thread = await this.ds.getRepository(InsurerThread).findOneBy({ id: threadId, ticketId });
    if (!thread) throw DomainError.guard('That insurer thread is not on the selected ticket');

    await this.workflow.run(ticketId, Actors.user(user), async (ctx) => {
      await ctx.manager.getRepository(ThreadEvent).insert({
        at: ctx.now,
        threadId,
        kind: 'note',
        actorType: ctx.actor.type,
        actorId: ctx.actor.id,
        text: `Inbound mail mapped to thread · ${mail.subject}`.slice(0, 500),
      });
      await ctx.audit('Inbound mail mapped to thread', `${thread.threadRef} · ${mail.subject}`.slice(0, 300));
    });
    if (mail.attachmentDocumentIds.length)
      await this.ds.getRepository(Document).update({ id: In(mail.attachmentDocumentIds) }, { ticketId });

    // mapped: the ticket owner now confirms what the mail means (My reviews), unless it is plainly not applicable
    Object.assign(mail, {
      ticketId,
      threadId,
      mappingBasis: 'manual',
      mappingConfidence: 1,
      reviewQueue: ReviewQueue.MY_REVIEWS,
      reviewReason: 'Mapped by hand - confirm the classification',
    });
    await this.mails.save(mail);
    await this.toMailTrail(mail);
    return (await this.views([mail]))[0];
  }

  // ---------------------------------------------------------------------------------------------

  /** Reply chain beats subject refs beats sender (FR-070). Sender-only is a suggestion, never a mapping. */
  private async map(raw: InboundMailRaw): Promise<Mapping> {
    const tickets = this.ds.getRepository(PlacementTicket);
    const threads = this.ds.getRepository(InsurerThread);
    const strip = (id: string) => id.replace(/^<|>$/g, '');
    const chain = [raw.inReplyTo, ...(raw.references ?? [])].filter((x): x is string => !!x).map(strip);
    if (chain.length) {
      const sent = await this.ds
        .getRepository(MailMessage)
        .findOne({ where: { providerMessageId: In(chain) } });
      if (sent?.threadId) {
        return {
          ticket: await tickets.findOneBy({ id: sent.ticketId }),
          thread: await threads.findOneBy({ id: sent.threadId }),
          basis: 'reply-chain',
          confidence: 0.98,
          senderOnly: false,
        };
      }
    }
    const refs = parseSubjectRefs(raw.subject);
    if (refs.ticketNo) {
      const ticket = await tickets.findOneBy({ ticketNo: refs.ticketNo });
      if (ticket) {
        const thread = refs.threadRef
          ? await threads.findOneBy({ ticketId: ticket.id, threadRef: refs.threadRef })
          : null;
        return { ticket, thread, basis: 'subject-ref', confidence: thread ? 0.95 : 0.6, senderOnly: false };
      }
    }
    // sender: a POC on exactly one live thread
    const live = await threads
      .createQueryBuilder('th')
      .innerJoin(PlacementTicket, 't', 't.id = th.ticket_id')
      .where('t.stage != :closed', { closed: Stage.CLOSED })
      .getMany();
    const bySender = live.filter((th) =>
      th.pocs.some((p) => p.email.toLowerCase() === raw.from.toLowerCase()),
    );
    if (bySender.length === 1)
      return {
        ticket: await tickets.findOneBy({ id: bySender[0].ticketId }),
        thread: bySender[0],
        basis: 'sender',
        confidence: 0.5,
        senderOnly: true,
      };
    return { ticket: null, thread: null, basis: null, confidence: 0, senderOnly: false };
  }

  /** Apply a class to the mapped thread through the same commands as an auto-applied mail (FR-228). */
  private async apply(mail: InboundMail, label: InboundClass, reviewer: AuthUser | null) {
    const ticketId = mail.ticketId!;
    const threadId = mail.threadId!;
    const thread = await this.ds.getRepository(InsurerThread).findOneByOrFail({ id: threadId });
    const insurer = await this.ds.getRepository(Insurer).findOneBy({ id: thread.insurerId });
    const actor = Actors.insurer(insurer?.name ?? mail.fromAddress, mail.fromAddress);
    const mailId = (
      await this.ds.getRepository(MailMessage).findOneBy({ providerMessageId: mail.providerMessageId })
    )?.id;
    const text = mail.bodyText.trim() || mail.subject;
    switch (label) {
      case InboundClass.QUOTE_RECEIVED: {
        const docs = await this.ds.getRepository(Document).findBy({ id: In(mail.attachmentDocumentIds) });
        const pdf = docs.find((d) => /\.pdf$/i.test(d.fileName)) ?? docs[0];
        if (!pdf) throw DomainError.guard('There is no attachment to record as the quote');
        if (pdf.kind !== DocumentKind.QUOTE)
          await this.ds.getRepository(Document).update({ id: pdf.id }, { kind: DocumentKind.QUOTE });
        await this.quotes.ingestQuote(actor, ticketId, threadId, { documentId: pdf.id, mailId });
        break;
      }
      case InboundClass.CLARIFICATION_REQUIRED:
        await this.threads.applyInsurerEvent(actor, ticketId, threadId, 'clarification', { text, mailId });
        break;
      case InboundClass.DECLINED:
        await this.threads.applyInsurerEvent(actor, ticketId, threadId, 'decline', { text, mailId });
        break;
      case InboundClass.ACKNOWLEDGED:
        await this.threads.applyInsurerEvent(actor, ticketId, threadId, 'ack', { text, mailId });
        break;
      case InboundClass.NOT_APPLICABLE:
        await this.threads.applyInsurerEvent(actor, ticketId, threadId, 'not_applicable', {
          text: `Inbound mail marked not applicable · ${mail.subject}`,
          mailId,
        });
        break;
    }
    if (reviewer) {
      await this.workflow.run(ticketId, Actors.user(reviewer), (ctx) =>
        ctx.audit(
          'Manual review confirmed',
          `${thread.threadRef} · ${label}${mail.classification && mail.classification !== label ? ` (bot suggested ${mail.classification})` : ''}`,
        ),
      );
    }
    if (!mail.appliedClass) {
      mail.appliedClass = label;
      mail.processedAt = this.clock.now();
      await this.mails.save(mail);
    }
  }

  private async toMailTrail(mail: InboundMail) {
    if (
      await this.ds.getRepository(MailMessage).exist({ where: { providerMessageId: mail.providerMessageId } })
    )
      return;
    await this.mailTrail.recordInbound({
      ticketId: mail.ticketId!,
      threadId: mail.threadId,
      from: mail.fromAddress,
      to: mail.toAddresses,
      subject: mail.subject,
      text: mail.bodyText,
      attachmentDocumentIds: mail.attachmentDocumentIds,
      providerMessageId: mail.providerMessageId,
      at: mail.receivedAt,
    });
  }

  private async matchedProducts(mail: InboundMail): Promise<string[]> {
    const docs = mail.attachmentDocumentIds.length
      ? await this.ds.getRepository(Document).findBy({ id: In(mail.attachmentDocumentIds) })
      : [];
    return matchProductTypes(
      [mail.subject, mail.bodyText, ...docs.map((d) => d.fileName)].join('\n'),
      PRODUCT_TYPES_SEED,
    ); // TODO(W2): ProductType master aliases
  }

  private async views(rows: InboundMail[]): Promise<InboundMailView[]> {
    const ids = <T>(f: (m: InboundMail) => T | null | undefined) => [
      ...new Set(rows.map(f).filter((x): x is T => !!x)),
    ];
    const tickets = ids((m) => m.ticketId).length
      ? await this.ds.getRepository(PlacementTicket).findBy({ id: In(ids((m) => m.ticketId)) })
      : [];
    const threads = ids((m) => m.threadId).length
      ? await this.ds.getRepository(InsurerThread).findBy({ id: In(ids((m) => m.threadId)) })
      : [];
    const insurers = threads.length
      ? await this.ds.getRepository(Insurer).findBy({ id: In([...new Set(threads.map((t) => t.insurerId))]) })
      : [];
    const docIds = [...new Set(rows.flatMap((m) => m.attachmentDocumentIds))];
    const docs = docIds.length ? await this.ds.getRepository(Document).findBy({ id: In(docIds) }) : [];
    const users = ids((m) => m.reviewedById).length
      ? await this.ds.getRepository(User).findBy({ id: In(ids((m) => m.reviewedById)) })
      : [];
    return Promise.all(
      rows.map(async (m) => {
        const t = tickets.find((x) => x.id === m.ticketId);
        const th = threads.find((x) => x.id === m.threadId);
        return {
          id: m.id,
          queue: m.reviewQueue,
          reason: m.reviewReason,
          status: m.reviewStatus,
          from: m.fromAddress,
          subject: m.subject,
          bodyText: m.bodyText,
          receivedAt: m.receivedAt.toISOString(),
          attachments: m.attachmentDocumentIds.map((id) => ({
            id,
            fileName: docs.find((d) => d.id === id)?.fileName ?? 'attachment',
          })),
          ticket: t ? { id: t.id, ticketNo: t.ticketNo, businessName: t.businessName } : null,
          thread: th
            ? {
                id: th.id,
                threadRef: th.threadRef,
                insurerName: insurers.find((i) => i.id === th.insurerId)?.name ?? '',
              }
            : null,
          unknownSender: m.unknownSender,
          classification: m.classification,
          confidence: m.classificationConfidence,
          appliedClass: m.appliedClass,
          mappingBasis: m.mappingBasis,
          reviewedBy: users.find((u) => u.id === m.reviewedById)?.name ?? null,
          reviewedAt: m.reviewedAt?.toISOString() ?? null,
          matchedProducts: m.reviewQueue === ReviewQueue.UNMATCHED ? await this.matchedProducts(m) : [],
        } as InboundMailView;
      }),
    );
  }
}

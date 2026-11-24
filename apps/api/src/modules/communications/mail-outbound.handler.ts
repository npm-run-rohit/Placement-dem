import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { MailDirection, PRODUCT_TYPES_SEED } from '@bimaplacement/contracts';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { OutboxService } from '../../infrastructure/outbox/outbox.service';
import {
  MailboxNotConnectedError,
  MailRejectedError,
} from '../../infrastructure/mail/email-layer-mailbox.adapter';
import { MAILBOX, type MailboxConnector } from '../../infrastructure/mail/mailbox.port';
import { SlaConfigService } from '../sla/sla-config.service';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { RfqVersion } from '../rfq/entities/rfq-version.entity';
import { RfqQuery } from '../rfq/entities/rfq-query.entity';
import { Document } from '../documents/document.entity';
import { User } from '../users/user.entity';
import { QcrVersion } from '../qcr/entities/qcr-version.entity';
import { MandateRequest } from '../mandates/entities/mandate-request.entity';
import { CommunicationTemplate } from '../masters/entities/communication-template.entity';
import { MailMessage } from './entities/mail-message.entity';
import { conversationRefFor } from './conversation-ref';
import { insurerSubjectRef, renderTemplate } from './template-renderer';

type Job = {
  outboxId: string;
  eventType: string;
  occurredAt?: string;
  ticketId: string;
  threadId?: string;
  fromUserId?: string;
  [k: string]: unknown;
};
type Draft = {
  to: string[];
  /** insurer thread mail: the POCs' CC addresses (Appendix F); everything else: none */
  cc?: string[];
  threadId: string | null;
  templateId: string | null;
  subject: string;
  body: string;
  attachments: Document[];
  rfqLinkInBody: boolean;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
const fmtDate = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(d)
    : '';

/**
 * Renders + sends outbox mail events from the assigned PM's mailbox and writes mail_messages (Mail Trail).
 * Never sends from another identity (M5): no PM mailbox -> the job fails and is retried / surfaced (FR-171).
 * Idempotent on the outbox id (redelivery is a no-op). Insurer mail uses the Communication Template master
 * (INS-T01..T06, RM-T01, PRD M6 s12); replies, clarifications, RM requests, QCR and mandate mails carry the
 * PM's own text with the ticket reference in the subject (FR-050).
 */
@Injectable()
@QueueHandler(QUEUES.MAIL_OUTBOUND, { concurrency: 4 })
export class MailOutboundHandler implements JobHandler {
  private readonly logger = new Logger(MailOutboundHandler.name);

  constructor(
    @Inject(MAILBOX) private readonly mailbox: MailboxConnector,
    private readonly ds: DataSource,
    private readonly sla: SlaConfigService,
    private readonly outbox: OutboxService,
  ) {}

  async handle(jobName: string, data: unknown): Promise<void> {
    const job = data as Job;
    const mails = this.ds.getRepository(MailMessage);
    if (await mails.exist({ where: { outboxId: job.outboxId } })) return; // already sent for this event

    const ticket = await this.ds.getRepository(PlacementTicket).findOneByOrFail({ id: job.ticketId });
    const pm = await this.ds.getRepository(User).findOneBy({ id: job.fromUserId ?? ticket.ownerId });
    if (!pm)
      throw new Error(
        `No Placement Manager mailbox for ${ticket.ticketNo} - not sending from another identity (M5)`,
      );
    const draft = await this.compose(job.eventType ?? jobName, job, ticket, pm);
    if (!draft) {
      this.logger.warn(`No mail renderer for ${jobName} (${ticket.ticketNo})`);
      return;
    }
    const fromMailbox = pm.mailboxAddress ?? pm.email;
    const threadRef = draft.threadId
      ? (await this.ds.getRepository(InsurerThread).findOneByOrFail({ id: draft.threadId })).threadRef
      : null;
    const conversationRef = conversationRefFor(ticket.ticketNo, threadRef);
    // Chain onto the latest sent mail of this conversation (any mailbox; the layer keys on the first email).
    const previous = await mails
      .createQueryBuilder('m')
      .where('m.conversationRef = :conversationRef AND m.providerMessageId IS NOT NULL', { conversationRef })
      .orderBy('m.at', 'DESC')
      .getOne();
    const record = {
      ticketId: ticket.id,
      threadId: draft.threadId,
      direction: MailDirection.OUTBOUND,
      templateId: draft.templateId,
      fromAddress: fromMailbox,
      toAddresses: draft.to,
      ccAddresses: draft.cc ?? [],
      subject: draft.subject,
      bodyHtml: html(draft.body),
      attachmentDocumentIds: draft.attachments.map((d) => d.id),
      rfqLinkInBody: draft.rfqLinkInBody,
      outboxId: job.outboxId,
      conversationRef,
      ...(job.occurredAt ? { at: new Date(job.occurredAt) } : {}),
    };
    let sent: { providerMessageId: string; providerThreadId?: string };
    try {
      sent = await this.mailbox.send({
        fromMailbox,
        to: draft.to,
        ...(draft.cc?.length ? { cc: draft.cc } : {}),
        subject: draft.subject,
        html: html(draft.body),
        text: draft.body,
        attachments: draft.attachments.map((d) => ({
          fileName: d.fileName,
          contentType: d.contentType,
          storageKey: d.storageKey,
        })),
        headers: {
          'X-Placement-Ticket': ticket.ticketNo,
          ...(draft.threadId ? { 'X-Placement-Thread': draft.threadId } : {}),
        },
        conversation: {
          ref: conversationRef,
          ...(previous?.providerMessageId ? { replyToMessageId: previous.providerMessageId } : {}),
        },
        idempotencyKey: job.outboxId,
      });
    } catch (e) {
      const notConnected = e instanceof MailboxNotConnectedError;
      if (!notConnected && !(e instanceof MailRejectedError)) throw e; // anything else is retried
      // Final: never send as someone else (M5), never retry a refused mail. Keep the failed row (the owner can
      // Resend it from the Mail Trail) and tell the owner. Ops count failed rows (MailNotSent1h).
      await this.ds.transaction(async (manager) => {
        await manager
          .getRepository(MailMessage)
          .insert({ ...record, status: 'failed', error: e.message, providerMessageId: null });
        await this.outbox.add(manager, {
          destination: 'notification',
          eventType: notConnected ? 'mail.mailbox_not_connected' : 'mail.send_rejected',
          aggregateType: 'ticket',
          aggregateId: ticket.id,
          payload: { ticketId: ticket.id, ownerId: ticket.ownerId },
        });
      });
      this.logger.warn(`${ticket.ticketNo}: mail from ${fromMailbox} not sent: ${e.message}`);
      return;
    }
    await mails.insert({
      ...record,
      providerMessageId: sent.providerMessageId,
      providerThreadId: sent.providerThreadId ?? null,
      status: 'sent',
    });
  }

  private async compose(type: string, job: Job, t: PlacementTicket, pm: User): Promise<Draft | null> {
    const product = PRODUCT_TYPES_SEED.find((p) => p.code === t.productType)?.label ?? t.productType;
    const rfq = await this.ds
      .getRepository(RfqVersion)
      .findOneBy({ ticketId: t.id, version: t.activeRfqVersion });
    const excel = rfq?.excelDocumentId
      ? await this.ds.getRepository(Document).findOneBy({ id: rfq.excelDocumentId })
      : null;
    const base: Record<string, string> = {
      TicketID: t.ticketNo,
      Client: t.businessName,
      ProductType: product,
      PMName: pm.name,
      RMFirst: t.rmName.split(' ')[0],
      SPOCFirst: (t.clientSpoc ?? 'the client').split(/[ ,]/)[0],
      RFQVersion: String(t.activeRfqVersion),
      RFQAttachLine:
        [excel && `RFQ attached: ${excel.fileName}`, rfq?.linkUrl && `RFQ link: ${rfq.linkUrl}`]
          .filter(Boolean)
          .join('; ') || 'RFQ details in this mail',
    };
    const sign = `\n\nRegards,\n${pm.name}`;
    const rmTo = t.rmEmail ? [t.rmEmail] : [];
    const tpl = async (id: string) =>
      this.ds.getRepository(CommunicationTemplate).findOneByOrFail({ id, active: true });

    // ---- insurer thread mail (all POCs in To, FR-213)
    if (
      job.threadId &&
      [
        'mail.rfq_float',
        'mail.insurer_follow_up',
        'mail.rfq_resend',
        'mail.insurer_reply',
        'mail.quote_clarification',
      ].includes(type)
    ) {
      const th = await this.ds.getRepository(InsurerThread).findOneByOrFail({ id: job.threadId });
      const vars = {
        ...base,
        ThreadID: th.threadRef,
        // POCs loaded from the masters workbook may have no name (email only); greet the named ones
        POC:
          th.pocs
            .map((p) => p.name.trim().split(' ')[0])
            .filter(Boolean)
            .join(', ') || 'Team',
        ExpectedResponseDate: fmtDate(
          th.floatedAt ? this.sla.calendar.addMinutes(th.floatedAt, th.targetMins) : null,
        ),
        RFQSentDate: fmtDate(th.floatedAt),
        RestartReason: String(job.reason ?? ''),
      };
      const to = th.pocs.map((p) => p.email);
      const ref = insurerSubjectRef(t.ticketNo, th.threadRef);
      if (type === 'mail.insurer_reply' || type === 'mail.quote_clarification') {
        return {
          to,
          cc: th.ccEmails,
          threadId: th.id,
          templateId: null,
          subject: `Re: ${ref} RFQ - ${t.businessName} - ${product}`,
          body: `Dear ${vars.POC},\n\n${String(job.text ?? '')}${sign}`,
          attachments: [],
          rfqLinkInBody: false,
        };
      }
      const id =
        type === 'mail.rfq_float'
          ? 'INS-T01'
          : type === 'mail.rfq_resend'
            ? 'INS-T06'
            : String(job.templateId ?? 'INS-T02');
      const template = await tpl(id);
      const attachRfq = ['INS-T01', 'INS-T04', 'INS-T06'].includes(id);
      return {
        to,
        cc: th.ccEmails,
        threadId: th.id,
        templateId: id,
        subject: renderTemplate(template.subjectTemplate, vars),
        body: renderTemplate(template.bodyTemplate, vars),
        attachments: attachRfq && excel ? [excel] : [],
        rfqLinkInBody: attachRfq && !!rfq?.linkUrl,
      };
    }

    // ---- RM mail (manual tickets)
    switch (type) {
      case 'mail.rm_queries': {
        const ids = (job.queryIds as string[] | undefined) ?? [];
        const queries = ids.length
          ? await this.ds.getRepository(RfqQuery).find({ where: { id: In(ids) } })
          : [];
        const template = await tpl('RM-T01');
        const vars = { ...base, GapList: queries.map((q) => `\n- ${q.label}`).join('') };
        const note = job.message ? `\n\n${String(job.message)}` : '';
        return {
          to: rmTo,
          threadId: null,
          templateId: 'RM-T01',
          subject: renderTemplate(template.subjectTemplate, vars),
          body: renderTemplate(template.bodyTemplate, vars) + note + sign,
          attachments: [],
          rfqLinkInBody: false,
        };
      }
      case 'mail.rm_thread_info': {
        const th = await this.ds.getRepository(InsurerThread).findOneByOrFail({ id: String(job.threadId) });
        const insurer = await this.ds.getRepository(Insurer).findOneBy({ id: th.insurerId });
        return {
          to: rmTo,
          threadId: th.id,
          templateId: null,
          subject: `[${t.ticketNo} | ${th.threadRef}] Information requested by ${insurer?.name ?? 'the insurer'} - ${t.businessName}`,
          body: `Hi ${base.RMFirst},\n\n${String(job.request ?? '')}${sign}`,
          attachments: [],
          rfqLinkInBody: false,
        };
      }
      case 'mail.qcr_to_rm': {
        const qcr = await this.ds.getRepository(QcrVersion).findOneByOrFail({ id: String(job.qcrId) });
        const file = qcr.documentId
          ? await this.ds.getRepository(Document).findOneBy({ id: qcr.documentId })
          : null;
        const note = job.coverNote
          ? String(job.coverNote)
          : `QCR V${qcr.version} for ${t.businessName} - ${product}.`;
        return {
          to: rmTo,
          threadId: null,
          templateId: null,
          subject: `[${t.ticketNo}] QCR V${qcr.version} - ${t.businessName} - ${product}`,
          body: `Hi ${base.RMFirst},\n\n${note}${sign}`,
          attachments: file ? [file] : [],
          rfqLinkInBody: false,
        };
      }
      case 'mail.no_appetite_to_rm':
        return {
          to: rmTo,
          threadId: null,
          templateId: null,
          subject: `[${t.ticketNo}] No appetite - ${t.businessName} - ${product}`,
          body: `Hi ${base.RMFirst},\n\n${String(job.reason ?? '')}${sign}`,
          attachments: [],
          rfqLinkInBody: false,
        };
      case 'mail.mandate_request':
      case 'mail.mandate_reminder':
      case 'mail.mandate_withdrawn': {
        const req = await this.ds
          .getRepository(MandateRequest)
          .findOneByOrFail({ id: String(job.mandateRequestId) });
        const subject = {
          'mail.mandate_request': 'Exclusive Placement Mandate request',
          'mail.mandate_reminder': 'Reminder: Exclusive Placement Mandate request',
          'mail.mandate_withdrawn': 'Exclusive Placement Mandate request withdrawn',
        }[type];
        const fallback =
          type === 'mail.mandate_reminder'
            ? `A reminder on my Exclusive Placement Mandate request ${req.ref} for ${t.businessName}. Could you check with the client?`
            : `I am withdrawing the Exclusive Placement Mandate request ${req.ref} for ${t.businessName}. No action is needed.`;
        const text = type === 'mail.mandate_request' ? req.message : job.note ? String(job.note) : fallback;
        return {
          to: rmTo,
          threadId: null,
          templateId: null,
          subject: `[${t.ticketNo}] ${subject} (${req.ref}) - ${t.businessName}`,
          body: `Hi ${base.RMFirst},\n\n${text}${sign}`,
          attachments: [],
          rfqLinkInBody: false,
        };
      }
      default:
        return null;
    }
  }
}

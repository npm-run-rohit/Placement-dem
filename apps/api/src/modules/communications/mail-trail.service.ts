import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { BimaSetuMessageView, MailView } from '@bimaplacement/contracts';
import { MailDirection } from '@bimaplacement/contracts';
import { MailMessage } from './entities/mail-message.entity';
import { insurerSubjectRef } from './template-renderer';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { User } from '../users/user.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { Insurer } from '../insurers/entities/insurer.entity';
import { Document } from '../documents/document.entity';
import { BimaSetuMessage } from '../../integrations/bimasetu/bimasetu-message.entity';

/** Read side of the Mail Trail tab: mail per ticket (FR-053) and the BimaSetu message log (FR-291). */
@Injectable()
export class MailTrailService {
  constructor(private readonly ds: DataSource) {}

  async mails(ticketId: string): Promise<MailView[]> {
    const rows = await this.ds
      .getRepository(MailMessage)
      .find({ where: { ticketId }, order: { at: 'DESC' } });
    const threadIds = [...new Set(rows.map((r) => r.threadId).filter((x): x is string => !!x))];
    const threads = threadIds.length
      ? await this.ds.getRepository(InsurerThread).find({ where: { id: In(threadIds) } })
      : [];
    const insurerIds = [...new Set(threads.map((t) => t.insurerId))];
    const insurers = insurerIds.length
      ? await this.ds.getRepository(Insurer).find({ where: { id: In(insurerIds) } })
      : [];
    const docIds = [...new Set(rows.flatMap((r) => r.attachmentDocumentIds))];
    const docs = docIds.length
      ? await this.ds.getRepository(Document).find({ where: { id: In(docIds) } })
      : [];
    return rows.map((m) => {
      const th = threads.find((t) => t.id === m.threadId);
      return {
        id: m.id,
        direction: m.direction,
        threadId: m.threadId,
        threadRef: th?.threadRef ?? null,
        insurerName: insurers.find((i) => i.id === th?.insurerId)?.name ?? null,
        templateId: m.templateId,
        from: m.fromAddress,
        to: m.toAddresses,
        cc: m.ccAddresses,
        subject: m.subject,
        bodyHtml: m.bodyHtml,
        attachments: m.attachmentDocumentIds.map((id) => ({
          id,
          fileName: docs.find((d) => d.id === id)?.fileName ?? 'attachment',
        })),
        rfqLinkInBody: m.rfqLinkInBody,
        status: m.status,
        at: m.at.toISOString(),
      };
    });
  }

  /**
   * Records an insurer reply on a thread as an inbound Mail Trail entry (first POC -> assigned PM mailbox).
   * Used by the dev insurer simulator and fixtures until the inbound mailbox poller lands (PLAN 2.5).
   */
  async recordInsurerReply(
    ticketId: string,
    threadId: string,
    text: string,
    opts: { attachmentDocumentIds?: string[]; at?: Date } = {},
  ) {
    const ticket = await this.ds.getRepository(PlacementTicket).findOneByOrFail({ id: ticketId });
    const th = await this.ds.getRepository(InsurerThread).findOneByOrFail({ id: threadId, ticketId });
    const pm = ticket.ownerId ? await this.ds.getRepository(User).findOneBy({ id: ticket.ownerId }) : null;
    return this.recordInbound({
      ticketId,
      threadId,
      from: th.pocs[0]?.email ?? 'insurer@unknown',
      to: [pm?.mailboxAddress ?? pm?.email ?? 'placement@unknown'],
      cc: th.pocs.slice(1).map((p) => p.email),
      subject: `Re: ${insurerSubjectRef(ticket.ticketNo, th.threadRef)} RFQ - ${ticket.businessName}`,
      text,
      attachmentDocumentIds: opts.attachmentDocumentIds,
      at: opts.at,
    });
  }

  /** A received mail mapped to a ticket (and thread) shown on the Mail Trail (FR-053). Body is escaped here. */
  async recordInbound(m: {
    ticketId: string;
    threadId: string | null;
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    text: string;
    attachmentDocumentIds?: string[];
    providerMessageId?: string;
    at?: Date;
  }) {
    const esc = m.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const res = await this.ds.getRepository(MailMessage).insert({
      ticketId: m.ticketId,
      threadId: m.threadId,
      direction: MailDirection.INBOUND,
      templateId: null,
      fromAddress: m.from,
      toAddresses: m.to,
      ccAddresses: m.cc ?? [],
      subject: m.subject,
      bodyHtml: esc
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join(''),
      attachmentDocumentIds: m.attachmentDocumentIds ?? [],
      providerMessageId: m.providerMessageId ?? null,
      status: 'received',
      ...(m.at ? { at: m.at } : {}),
    });
    return res.identifiers[0].id as string;
  }

  async bimasetu(ticketId: string): Promise<BimaSetuMessageView[]> {
    const rows = await this.ds
      .getRepository(BimaSetuMessage)
      .find({ where: { ticketId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      messageId: r.messageId,
      type: r.type,
      status: r.status,
      attempts: r.attempts,
      lastError: r.lastError,
      payload: r.payload,
      at: r.createdAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
    }));
  }
}

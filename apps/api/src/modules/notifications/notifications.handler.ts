import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { NotificationChannel } from '@bimaplacement/contracts';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import { SahayakNotificationsClient } from '../../integrations/sahayak/sahayak-notifications.client';
import { renderTemplate } from '../communications/template-renderer';
import { Insurer } from '../insurers/entities/insurer.entity';
import { CommunicationTemplate } from '../masters/entities/communication-template.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { User } from '../users/user.entity';
import { Notification } from './notification.entity';
import { linkFor, NOTIFICATION_RULES, resolveRecipients } from './notification-rules';

type Job = {
  outboxId: string;
  aggregateId: string;
  ticketId?: string;
  ownerId?: string;
  previousOwnerId?: string;
  from?: string;
  to?: string;
  reason?: string;
  threadId?: string;
  quoteId?: string;
  qcrVersion?: number;
  error?: string;
  n?: number;
  lastAction?: string;
  slaStage?: string;
};

/**
 * Resolves recipients + template for each `notification` outbox event (PRD notification tables,
 * INT-T01..T06), writes the in-app rows and hands each one to BimaSahayak for the user's other channels
 * (FR-140/141, BR-093). Idempotent: one row per (outbox event, recipient).
 */
@Injectable()
@QueueHandler(QUEUES.NOTIFICATIONS, { concurrency: 4 })
export class NotificationsHandler implements JobHandler {
  private readonly logger = new Logger(NotificationsHandler.name);
  constructor(
    private readonly ds: DataSource,
    private readonly sahayak: SahayakNotificationsClient,
  ) {}

  async handle(eventType: string, data: Record<string, unknown>): Promise<void> {
    const job = data as unknown as Job;
    const rule = NOTIFICATION_RULES[eventType];
    if (!rule) return void this.logger.debug(`no in-app rule for ${eventType}`);
    const ticket = await this.ds
      .getRepository(PlacementTicket)
      .findOneBy({ id: job.ticketId ?? job.aggregateId });
    if (!ticket)
      return void this.logger.warn(`${eventType}: ticket ${job.ticketId ?? job.aggregateId} not found`);

    const ids = {
      ownerId: job.ownerId ?? ticket.ownerId,
      previousOwnerId: job.previousOwnerId ?? job.from ?? null,
      newOwnerId: job.to ?? job.ownerId ?? ticket.ownerId,
    };
    const recipients = resolveRecipients(rule, ids);
    if (!recipients.length) return;
    const people = await this.ds.getRepository(User).find({
      where: {
        id: In([...recipients, ids.previousOwnerId, ids.newOwnerId].filter((x): x is string => !!x)),
      },
    });
    const name = (id: string | null | undefined) => people.find((u) => u.id === id)?.name ?? '';

    const vars = {
      TicketID: ticket.ticketNo,
      Client: ticket.businessName,
      ProductType: ticket.productType,
      Status: ticket.internalStatus,
      Completeness: 'Pending RFQ review',
      SLA: ticket.slaId ?? '',
      N: job.n ?? '',
      Insurer: await this.insurerName(job),
      SLAStage: job.slaStage ?? '',
      LastAction: job.lastAction ?? '',
      NextAction: 'Call the insurer and log the call on the thread',
      QCRVersion: job.qcrVersion ?? '',
      Error: job.error ?? '',
      HeadName: name(ids.newOwnerId),
      FromName: name(ids.previousOwnerId),
      ToName: name(ids.newOwnerId),
      Reason: job.reason ?? '',
    };
    const template = rule.templateId
      ? await this.ds.getRepository(CommunicationTemplate).findOneBy({ id: rule.templateId })
      : null;
    const title = renderTemplate(template?.subjectTemplate ?? rule.title ?? eventType, vars);
    const body = renderTemplate(template?.bodyTemplate ?? rule.body ?? '', vars);
    const link = linkFor(eventType, ticket.ticketNo);

    for (const recipientUserId of recipients) {
      const inserted = await this.ds
        .getRepository(Notification)
        .createQueryBuilder()
        .insert()
        .values({
          recipientUserId,
          ticketId: ticket.id,
          outboxId: job.outboxId,
          eventType,
          link,
          channel: NotificationChannel.IN_APP,
          templateId: rule.templateId ?? `placement.${eventType}`,
          title,
          body,
          status: 'sent',
        })
        .orIgnore()
        .returning(['id'])
        .execute();
      if (!inserted.identifiers[0]?.id) continue; // already delivered for this event
      const email = people.find((u) => u.id === recipientUserId)?.email;
      if (email)
        await this.sahayak.send({
          recipientEmail: email,
          channels: ['email'],
          templateKey: `placement.${rule.templateId ?? eventType}`,
          title,
          body,
          deepLink: link,
        });
    }
  }

  private async insurerName(job: Job): Promise<string> {
    const threadId =
      job.threadId ??
      (job.quoteId
        ? (await this.ds.getRepository(Quote).findOneBy({ id: job.quoteId }))?.threadId
        : undefined);
    if (!threadId) return '';
    const th = await this.ds.getRepository(InsurerThread).findOneBy({ id: threadId });
    return th ? ((await this.ds.getRepository(Insurer).findOneBy({ id: th.insurerId }))?.name ?? '') : '';
  }
}

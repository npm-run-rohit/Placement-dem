import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { MAILBOX, type MailboxConnector } from '../../infrastructure/mail/mailbox.port';
import { UsersService } from '../users/users.service';
import { InboundMailService } from './inbound-mail.service';

/** Polls every PM mailbox (FR-169). With Gmail push, the Pub/Sub webhook enqueues 'poll' for one mailbox. */
@Injectable()
@QueueHandler(QUEUES.MAIL_INBOUND)
export class MailPollerHandler implements JobHandler {
  private readonly logger = new Logger(MailPollerHandler.name);

  constructor(
    @Inject(MAILBOX) private readonly mailbox: MailboxConnector,
    private readonly users: UsersService,
    private readonly inbound: InboundMailService,
  ) {}

  async handle(): Promise<void> {
    const pms = [...(await this.users.placementManagers()), ...(await this.users.heads())];
    for (const pm of pms) {
      const address = pm.mailboxAddress ?? pm.email;
      try {
        const { messages } = await this.mailbox.fetchNew(address, pm.mailboxCursor);
        for (const m of messages) await this.inbound.ingest(m);
        // TODO(W5): persist nextCursor on the user; surface connector failures (FR-171, FR-188)
      } catch (e) {
        this.logger.warn(`mailbox ${address} poll failed: ${(e as Error).message}`);
      }
    }
  }
}

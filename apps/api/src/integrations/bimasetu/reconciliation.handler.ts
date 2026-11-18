import { Injectable, Logger } from '@nestjs/common';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';

/**
 * Nightly drift check (W3): compare open tickets' desk stage + rounds with BimaSetu line state;
 * re-send missing outbound messages; report inbound messages we never processed. TODO(W3).
 */
@Injectable()
@QueueHandler(QUEUES.RECONCILIATION)
export class BimaSetuReconciliationHandler implements JobHandler {
  private readonly logger = new Logger(BimaSetuReconciliationHandler.name);
  async handle(): Promise<void> {
    this.logger.log('TODO reconciliation');
  }
}

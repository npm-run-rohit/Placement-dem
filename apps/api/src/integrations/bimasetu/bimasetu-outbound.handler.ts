import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { DomainError } from '../../common/errors/domain-error';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { BimaSetuClient } from './bimasetu.client';

/**
 * Delivers outbox events to BimaSetu with retry/backoff (driver) and DLQ (failed jobs):
 * ticket_created, float_rejected, stage_changed, query_raised, qcr_round, closed_no_appetite.
 * qcr_round payload is built HERE from the frozen QCR (file URL + rows) - never insurer docs (FR-290).
 * Idempotency key = outboxId. Logs every send to bimasetu_messages(direction='out').
 */
@Injectable()
@QueueHandler(QUEUES.BIMASETU_OUTBOUND, { concurrency: 2 })
export class BimaSetuOutboundHandler implements JobHandler {
  private readonly logger = new Logger(BimaSetuOutboundHandler.name);
  constructor(
    private readonly client: BimaSetuClient,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async handle(jobName: string, data: Record<string, unknown>): Promise<void> {
    if (this.config.get('bimasetu', { infer: true }).mode === 'mock') {
      this.logger.log(`[mock] -> BimaSetu ${jobName} ${JSON.stringify(data)}`);
      return;
    }
    // TODO(W3): build envelope per type; await this.client.send(envelope); persist out-log row.
    // Until then a live job fails, so the message waits in the retry / failed queue instead of being lost.
    throw DomainError.notImplemented(`BimaSetu outbound ${jobName}`);
  }
}

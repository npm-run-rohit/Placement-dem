import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QueueHandler } from '../messaging/queue-handler.decorator';
import {
  EVENT_PUBLISHER,
  JOB_QUEUE,
  type EventPublisher,
  type JobHandler,
  type JobQueue,
} from '../messaging/messaging.ports';
import { QUEUES } from '../messaging/queues';
import { OutboxEvent } from './outbox-event.entity';
import { recordHeartbeat } from '../metrics/heartbeat';

const BATCH = 100;

/**
 * Polls unpublished outbox rows (FOR UPDATE SKIP LOCKED so several workers can run)
 * and hands each to its destination queue / the event bus. Consumers dedupe on outbox id.
 */
@Injectable()
@QueueHandler(QUEUES.OUTBOX_RELAY)
export class OutboxRelayHandler implements JobHandler {
  private readonly logger = new Logger(OutboxRelayHandler.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  async handle(): Promise<void> {
    let failed = 0;
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('o')
        .where('o.published_at IS NULL')
        .orderBy('o.created_at', 'ASC')
        .limit(BATCH)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      for (const row of rows) {
        try {
          await this.dispatch(row);
          row.publishedAt = new Date();
        } catch (err) {
          failed += 1;
          row.attempts += 1;
          row.lastError = (err as Error).message;
          this.logger.warn(`outbox ${row.id} (${row.eventType}) failed: ${row.lastError}`);
        }
      }
      // one UPDATE at a time: save(rows) would run them in parallel on the transaction's single connection
      for (const row of rows) {
        await manager
          .getRepository(OutboxEvent)
          .update(row.id, { publishedAt: row.publishedAt, attempts: row.attempts, lastError: row.lastError });
      }
    });
    await recordHeartbeat(this.dataSource, 'outbox-relay', failed);
  }

  private async dispatch(row: OutboxEvent) {
    const data = {
      outboxId: row.id,
      eventType: row.eventType,
      aggregateId: row.aggregateId,
      occurredAt: row.createdAt.toISOString(),
      ...row.payload,
    };
    switch (row.destination) {
      case 'bimasetu':
        return this.queue.enqueue(QUEUES.BIMASETU_OUTBOUND, row.eventType, data, { jobId: row.id });
      case 'mail':
        return this.queue.enqueue(QUEUES.MAIL_OUTBOUND, row.eventType, data, { jobId: row.id });
      case 'notification':
        return this.queue.enqueue(QUEUES.NOTIFICATIONS, row.eventType, data, { jobId: row.id });
      case 'copycat':
        return this.queue.enqueue(QUEUES.COPYCAT, row.eventType, data, { jobId: row.id });
      case 'bus':
        return this.publisher.publish([
          {
            id: row.id,
            source: 'bimaplacement',
            type: row.eventType,
            occurredAt: row.createdAt.toISOString(),
            correlationId: row.correlationId ?? undefined,
            data: row.payload,
          },
        ]);
    }
  }
}

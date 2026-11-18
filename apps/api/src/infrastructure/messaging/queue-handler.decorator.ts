import { SetMetadata } from '@nestjs/common';
import type { QueueName } from './queues';

export const QUEUE_HANDLER_KEY = 'placement:queue-handler';

/**
 * Marks a provider as the consumer of a queue. WorkerBootstrap discovers these in worker
 * mode and binds them to the active driver (BullMQ Worker or SQS poller).
 * Handlers MUST be idempotent - every driver is at-least-once.
 */
export const QueueHandler = (queue: QueueName, opts: { concurrency?: number } = {}) =>
  SetMetadata(QUEUE_HANDLER_KEY, { queue, concurrency: opts.concurrency ?? 1 });

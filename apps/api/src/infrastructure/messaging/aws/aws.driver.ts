import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../../../common/errors/domain-error';
import type {
  DomainEventEnvelope,
  EnqueueOptions,
  EventPublisher,
  JobHandler,
  JobQueue,
  Scheduler,
} from '../messaging.ports';
import type { QueueName } from '../queues';

/**
 * Production driver per the Architecture & Build Plan: SQS per worker queue (+DLQ),
 * EventBridge Scheduler for timers, EventBridge (BimaSahayak bus) for domain events.
 *
 * TODO(W1): implement with @aws-sdk/client-sqs, @aws-sdk/client-scheduler,
 * @aws-sdk/client-eventbridge. Keep semantics identical to BullMqDriver:
 *  - enqueue(jobId) -> SQS FIFO MessageDeduplicationId or a dedupe table
 *  - scheduleAt -> CreateSchedule (at(...)) targeting the queue, name = key
 *  - every -> rate() schedule
 *  - startWorker -> long-poll loop with visibility timeout + delete on success
 */
@Injectable()
export class AwsDriver implements JobQueue, Scheduler, EventPublisher {
  private readonly logger = new Logger(AwsDriver.name);

  async enqueue<T>(_queue: QueueName, _name: string, _data: T, _opts?: EnqueueOptions): Promise<void> {
    throw DomainError.notImplemented('AwsDriver.enqueue (SQS)');
  }
  async scheduleAt<T>(_key: string, _at: Date, _queue: QueueName, _name: string, _data: T): Promise<void> {
    throw DomainError.notImplemented('AwsDriver.scheduleAt (EventBridge Scheduler)');
  }
  async cancel(_key: string, _queue: QueueName): Promise<void> {
    throw DomainError.notImplemented('AwsDriver.cancel');
  }
  async every(_key: string, _everyMs: number, _queue: QueueName, _name: string): Promise<void> {
    throw DomainError.notImplemented('AwsDriver.every');
  }
  async publish(_events: DomainEventEnvelope[]): Promise<void> {
    throw DomainError.notImplemented('AwsDriver.publish (EventBridge PutEvents)');
  }
  startWorker(queue: QueueName, _handler: JobHandler, _concurrency: number) {
    this.logger.warn(`SQS poller for ${queue} not implemented`);
  }
}

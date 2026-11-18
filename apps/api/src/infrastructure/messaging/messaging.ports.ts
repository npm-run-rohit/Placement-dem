import type { QueueName } from './queues';

export interface EnqueueOptions {
  /** Deterministic job id => the driver drops duplicates (idempotent enqueue). */
  jobId?: string;
  delayMs?: number;
  attempts?: number;
}

/** Point-to-point work queue (BullMQ locally, SQS in AWS). */
export interface JobQueue {
  enqueue<T>(queue: QueueName, name: string, data: T, opts?: EnqueueOptions): Promise<void>;
}

/** Durable timers (BullMQ delayed/repeatable jobs locally, EventBridge Scheduler in AWS). */
export interface Scheduler {
  scheduleAt<T>(key: string, at: Date, queue: QueueName, name: string, data: T): Promise<void>;
  cancel(key: string, queue: QueueName): Promise<void>;
  /** Fixed-interval repeating job (e.g. SLA sweep every minute, outbox relay every 2s). */
  every(key: string, everyMs: number, queue: QueueName, name: string): Promise<void>;
}

/**
 * Domain events published beyond this service - to the BimaSahayak event bus
 * (EventBridge in AWS) so sibling products (BimaSetu, policy admin, finance, analytics)
 * can react: placement.ticket_created, placement.quote_selected, placement.closed, ...
 */
export interface DomainEventEnvelope<T = unknown> {
  id: string; // = outbox row id (consumers dedupe on it)
  source: 'bimaplacement';
  type: string; // e.g. 'placement.stage_changed'
  occurredAt: string;
  correlationId?: string;
  data: T;
}

export interface EventPublisher {
  publish(events: DomainEventEnvelope[]): Promise<void>;
}

/** Implemented by worker classes decorated with @QueueHandler(queue). */
export interface JobHandler {
  handle(jobName: string, data: unknown): Promise<void>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');
export const SCHEDULER = Symbol('SCHEDULER');
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

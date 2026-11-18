import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { AppConfig } from '../../../config/configuration';
import type { EnqueueOptions, JobHandler, JobQueue, Scheduler } from '../messaging.ports';
import type { QueueName } from '../queues';

/** Local/dev (and optionally prod) driver backed by Redis + BullMQ. */
@Injectable()
export class BullMqDriver implements JobQueue, Scheduler, OnModuleDestroy {
  private readonly logger = new Logger(BullMqDriver.name);
  private readonly connection: IORedis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(config: ConfigService<AppConfig, true>) {
    this.connection = new IORedis(config.get('messaging', { infer: true }).redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }

  private queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue<T>(queue: QueueName, name: string, data: T, opts: EnqueueOptions = {}) {
    await this.queue(queue).add(name, data, {
      jobId: opts.jobId,
      delay: opts.delayMs,
      attempts: opts.attempts ?? 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false, // failed jobs are our DLQ - surfaced on the ops dashboard
    });
  }

  async scheduleAt<T>(key: string, at: Date, queue: QueueName, name: string, data: T) {
    await this.enqueue(queue, name, data, { jobId: key, delayMs: Math.max(0, at.getTime() - Date.now()) });
  }

  async cancel(key: string, queue: QueueName) {
    await this.queue(queue).remove(key);
  }

  async every(key: string, everyMs: number, queue: QueueName, name: string) {
    await this.queue(queue).upsertJobScheduler(key, { every: everyMs }, { name, data: {} });
  }

  /** Jobs that used up their attempts: kept as the dead-letter queue (removeOnFail: false), PLAN 4.6. */
  async failedCount(queue: QueueName): Promise<number> {
    return this.queue(queue).getFailedCount();
  }

  startWorker(queue: QueueName, handler: JobHandler, concurrency: number) {
    const worker = new Worker(queue, async (job) => handler.handle(job.name, job.data), {
      connection: this.connection,
      concurrency,
    });
    worker.on('failed', (job, err) => this.logger.error(`[${queue}] ${job?.name} failed: ${err.message}`));
    this.workers.push(worker);
    this.logger.log(`worker started for ${queue} (concurrency ${concurrency})`);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection.disconnect();
  }
}

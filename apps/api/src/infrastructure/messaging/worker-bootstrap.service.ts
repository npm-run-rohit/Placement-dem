import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { QUEUE_HANDLER_KEY } from './queue-handler.decorator';
import type { JobHandler } from './messaging.ports';
import { SCHEDULER, type Scheduler } from './messaging.ports';
import { QUEUES, type QueueName } from './queues';
import { BullMqDriver } from './bullmq/bullmq.driver';
import { AwsDriver } from './aws/aws.driver';
import { MESSAGING_DRIVER_TOKEN } from './messaging.module';

/** Runs only in the worker process: binds @QueueHandler providers and registers repeating jobs. */
@Injectable()
export class WorkerBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkerBootstrap.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    @Inject(MESSAGING_DRIVER_TOKEN) private readonly driver: BullMqDriver | AwsDriver,
    @Inject(SCHEDULER) private readonly scheduler: Scheduler,
  ) {}

  async onApplicationBootstrap() {
    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const meta = this.reflector.get<{ queue: QueueName; concurrency: number }>(QUEUE_HANDLER_KEY, metatype);
      if (meta) this.driver.startWorker(meta.queue, instance as JobHandler, meta.concurrency);
    }
    // Repeating jobs (idempotent upserts)
    await this.scheduler.every('outbox-relay', 2_000, QUEUES.OUTBOX_RELAY, 'relay');
    await this.scheduler.every('sla-sweep', 60_000, QUEUES.SLA_SWEEP, 'sweep');
    await this.scheduler.every('mail-poll', 60_000, QUEUES.MAIL_INBOUND, 'poll');
    await this.scheduler.every('bimasetu-reconcile', 24 * 3600_000, QUEUES.RECONCILIATION, 'nightly');
    await this.scheduler.every('ops-metrics', 60_000, QUEUES.OPS_METRICS, 'collect');
    this.logger.log('worker bootstrap complete');
  }
}

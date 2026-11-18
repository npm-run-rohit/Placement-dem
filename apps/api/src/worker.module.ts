import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CORE_IMPORTS } from './app.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { WorkerBootstrap } from './infrastructure/messaging/worker-bootstrap.service';
import { AutomationModule } from './modules/automation/automation.module';
import { OpsMetricsModule } from './infrastructure/metrics/ops-metrics.module';

/**
 * Worker process: same domain modules, no HTTP. Binds every @QueueHandler (outbox relay, BimaSetu
 * in/out, Copycat runner, SLA sweeper, mail poller/sender, notifications) and the repeating jobs.
 * Scale independently on ECS (Architecture plan: split Integration gateway / extraction first).
 */
@Module({
  imports: [
    ...CORE_IMPORTS,
    DiscoveryModule,
    MessagingModule.forRoot({ worker: true }),
    AutomationModule,
    OpsMetricsModule,
  ],
  providers: [WorkerBootstrap],
})
export class WorkerModule {}

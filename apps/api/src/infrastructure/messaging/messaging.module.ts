import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import type { AppConfig } from '../../config/configuration';
import { BullMqDriver } from './bullmq/bullmq.driver';
import { AwsDriver } from './aws/aws.driver';
import { LogEventPublisher } from './log-event.publisher';
import { EVENT_PUBLISHER, JOB_QUEUE, SCHEDULER } from './messaging.ports';

export const MESSAGING_DRIVER_TOKEN = Symbol('MESSAGING_DRIVER');

/**
 * Port/adapter messaging. MESSAGING_DRIVER=bullmq (default, local + can run in prod on ElastiCache)
 * or aws (SQS + EventBridge + EventBridge Scheduler). Domain code depends only on the ports.
 */
@Global()
@Module({})
export class MessagingModule {
  static forRoot(opts: { worker: boolean }): DynamicModule {
    const driverProvider = {
      provide: MESSAGING_DRIVER_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('messaging', { infer: true }).driver === 'aws'
          ? new AwsDriver()
          : new BullMqDriver(config),
    };
    const providers = [
      driverProvider,
      { provide: JOB_QUEUE, useExisting: MESSAGING_DRIVER_TOKEN },
      { provide: SCHEDULER, useExisting: MESSAGING_DRIVER_TOKEN },
      {
        provide: EVENT_PUBLISHER,
        inject: [ConfigService, MESSAGING_DRIVER_TOKEN],
        useFactory: (config: ConfigService<AppConfig, true>, driver: unknown) =>
          config.get('messaging', { infer: true }).driver === 'aws' ? driver : new LogEventPublisher(),
      },
    ];
    // WorkerBootstrap is registered by WorkerModule (worker process only) to avoid a circular import here.
    return {
      module: MessagingModule,
      imports: opts.worker ? [DiscoveryModule] : [],
      providers,
      exports: [JOB_QUEUE, SCHEDULER, EVENT_PUBLISHER, MESSAGING_DRIVER_TOKEN],
    };
  }
}

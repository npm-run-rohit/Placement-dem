import { Module } from '@nestjs/common';
import { MetricsModule } from './metrics.module';
import { OpsMetricsHandler } from './ops-metrics.handler';

/** Worker-only: the every-minute ops metrics job (PLAN 4.6). */
@Module({ imports: [MetricsModule], providers: [OpsMetricsHandler], exports: [OpsMetricsHandler] })
export class OpsMetricsModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { emfObjects } from './emf';
import { METRICS, type MetricDatum, type Metrics } from './metrics.port';

/** METRICS_DRIVER=emf on ECS; `off` (default) drops them, so local runs and tests print nothing. */
class EmfMetrics implements Metrics {
  constructor(private readonly namespace: string) {}
  put(data: MetricDatum[]) {
    for (const obj of emfObjects(this.namespace, data, new Date()))
      process.stdout.write(`${JSON.stringify(obj)}\n`);
  }
}

class OffMetrics implements Metrics {
  put() {}
}

@Global()
@Module({
  providers: [
    {
      provide: METRICS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Metrics => {
        const cfg = config.get('metrics', { infer: true });
        return cfg.driver === 'emf' ? new EmfMetrics(cfg.namespace) : new OffMetrics();
      },
    },
  ],
  exports: [METRICS],
})
export class MetricsModule {}

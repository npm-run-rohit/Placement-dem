import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CopycatStatus, ReviewQueue, ReviewStatus } from '@bimaplacement/contracts';
import { QueueHandler } from '../messaging/queue-handler.decorator';
import { QUEUES, type QueueName } from '../messaging/queues';
import type { JobHandler } from '../messaging/messaging.ports';
import { MESSAGING_DRIVER_TOKEN } from '../messaging/messaging.module';
import { METRICS, type Metrics } from './metrics.port';
import { HEARTBEAT_JOBS, opsMetricData, type OpsSnapshot } from './ops-metrics';

/** Outbox rows retried this many times are reported as failing (the relay retries them every 2 s). */
const FAILING_ATTEMPTS = 5;

type QueueStats = { failedCount?: (queue: QueueName) => Promise<number> };

/**
 * Every minute (WorkerBootstrap): reads queue and table state and publishes it as ops metrics (PLAN 4.6).
 * Read-only; a missed run only leaves a gap that the alarms treat as breaching.
 */
@Injectable()
@QueueHandler(QUEUES.OPS_METRICS)
export class OpsMetricsHandler implements JobHandler {
  constructor(
    private readonly ds: DataSource,
    @Inject(METRICS) private readonly metrics: Metrics,
    @Inject(MESSAGING_DRIVER_TOKEN) private readonly driver: QueueStats,
  ) {}

  async handle(): Promise<void> {
    this.metrics.put(opsMetricData(await this.snapshot()));
  }

  async snapshot(): Promise<OpsSnapshot> {
    const one = async (sql: string, params: unknown[] = []) => (await this.ds.query(sql, params))[0];
    const outbox = await one(
      `SELECT count(*)::int AS pending,
              coalesce(extract(epoch FROM now() - min(created_at)), 0)::int AS oldest,
              count(*) FILTER (WHERE attempts >= $1)::int AS failing
         FROM outbox_events WHERE published_at IS NULL`,
      [FAILING_ATTEMPTS],
    );
    const beats: Array<{ name: string; age: number; errors: number }> = await this.ds.query(
      `SELECT name, extract(epoch FROM now() - at)::int AS age, errors FROM ops_heartbeats WHERE name = ANY($1)`,
      [[...HEARTBEAT_JOBS]],
    );
    const review = await one(
      `SELECT count(*) FILTER (WHERE review_queue = $1)::int AS unmatched,
              count(*) FILTER (WHERE review_queue = $2)::int AS mine
         FROM inbound_mails WHERE review_status = $3`,
      [ReviewQueue.UNMATCHED, ReviewQueue.MY_REVIEWS, ReviewStatus.PENDING],
    );
    const copycat = await one(
      `SELECT count(*)::int AS n FROM copycat_requests
        WHERE status = $1 AND finished_at > now() - interval '15 minutes'`,
      [CopycatStatus.FAILED],
    );
    const bimasetu = await one(
      `SELECT count(*) FILTER (WHERE status = 'failed')::int AS retrying,
              count(*) FILTER (WHERE status = 'rejected' AND created_at > now() - interval '1 hour')::int AS rejected
         FROM bimasetu_messages WHERE direction = 'in'`,
    );
    const failedJobs: Record<string, number | null> = {};
    for (const queue of Object.values(QUEUES))
      failedJobs[queue] = this.driver.failedCount ? await this.driver.failedCount(queue) : null;

    return {
      outbox: { pending: outbox.pending, oldestAgeSeconds: outbox.oldest, failing: outbox.failing },
      heartbeats: HEARTBEAT_JOBS.map((job) => {
        const b = beats.find((x) => x.name === job);
        return { job, ageSeconds: b ? b.age : null, errors: b?.errors ?? 0 };
      }),
      failedJobs,
      review: { unmatched: review.unmatched, myReviews: review.mine },
      copycatFailedLast15Min: copycat.n,
      bimasetu: { inboundRetrying: bimasetu.retrying, inboundRejectedLastHour: bimasetu.rejected },
    };
  }
}

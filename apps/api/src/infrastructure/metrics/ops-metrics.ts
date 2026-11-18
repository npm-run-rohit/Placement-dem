import type { MetricDatum } from './metrics.port';

/** What the ops metrics job reads each minute (PLAN 4.6). Alarm names and runbooks: docs/runbooks/. */
export interface OpsSnapshot {
  outbox: { pending: number; oldestAgeSeconds: number; failing: number };
  /** Repeating jobs that record a heartbeat; ageSeconds is null when the job never ran. */
  heartbeats: Array<{ job: string; ageSeconds: number | null; errors: number }>;
  /** Dead-lettered jobs per queue; null when the driver cannot tell (SQS reports its own DLQ depth). */
  failedJobs: Record<string, number | null>;
  review: { unmatched: number; myReviews: number };
  copycatFailedLast15Min: number;
  bimasetu: { inboundRetrying: number; inboundRejectedLastHour: number };
}

/** Jobs expected to heartbeat; a missing row reads as "never ran" so the stall alarm fires on a new stack. */
export const HEARTBEAT_JOBS = ['sla-sweep', 'outbox-relay'] as const;

/** A job that never ran is reported a day old, so "stalled" alarms fire instead of seeing no data. */
const NEVER_RAN_SECONDS = 86_400;

export function opsMetricData(s: OpsSnapshot): MetricDatum[] {
  const count = (name: string, value: number, dimensions?: Record<string, string>): MetricDatum => ({
    name,
    value,
    unit: 'Count',
    dimensions,
  });
  const failed = Object.entries(s.failedJobs).filter((e): e is [string, number] => e[1] !== null);
  return [
    count('OutboxPending', s.outbox.pending),
    { name: 'OutboxLagSeconds', value: s.outbox.oldestAgeSeconds, unit: 'Seconds' },
    count('OutboxFailing', s.outbox.failing),
    ...s.heartbeats.flatMap((h) => [
      {
        name: 'HeartbeatAgeSeconds',
        value: h.ageSeconds ?? NEVER_RAN_SECONDS,
        unit: 'Seconds' as const,
        dimensions: { Job: h.job },
      },
      count('JobErrors', h.errors, { Job: h.job }),
    ]),
    ...failed.map(([queue, n]) => count('FailedJobs', n, { Queue: queue })),
    count(
      'FailedJobsTotal',
      failed.reduce((sum, [, n]) => sum + n, 0),
    ),
    count('UnmatchedMailPending', s.review.unmatched),
    count('MyReviewsPending', s.review.myReviews),
    count('CopycatFailures15m', s.copycatFailedLast15Min),
    count('BimaSetuInboundRetrying', s.bimasetu.inboundRetrying),
    count('BimaSetuInboundRejected1h', s.bimasetu.inboundRejectedLastHour),
  ];
}

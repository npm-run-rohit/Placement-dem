import { opsMetricData, type OpsSnapshot } from './ops-metrics';

const snapshot: OpsSnapshot = {
  outbox: { pending: 4, oldestAgeSeconds: 30, failing: 1 },
  heartbeats: [
    { job: 'sla-sweep', ageSeconds: 45, errors: 2 },
    { job: 'outbox-relay', ageSeconds: null, errors: 0 },
  ],
  failedJobs: { 'mail-outbound': 3, 'copycat-runner': 0, 'bimasetu-inbound': null },
  review: { unmatched: 7, myReviews: 2 },
  copycatFailedLast15Min: 1,
  bimasetu: { inboundRetrying: 0, inboundRejectedLastHour: 5 },
};

describe('opsMetricData', () => {
  const data = opsMetricData(snapshot);
  const value = (name: string, dims?: Record<string, string>) =>
    data.find((d) => d.name === name && JSON.stringify(d.dimensions) === JSON.stringify(dims))?.value;

  it('reports the outbox, review queues, Copycat and BimaSetu as plain gauges', () => {
    expect(value('OutboxPending')).toBe(4);
    expect(value('OutboxLagSeconds')).toBe(30);
    expect(value('OutboxFailing')).toBe(1);
    expect(value('UnmatchedMailPending')).toBe(7);
    expect(value('MyReviewsPending')).toBe(2);
    expect(value('CopycatFailures15m')).toBe(1);
    expect(value('BimaSetuInboundRejected1h')).toBe(5);
  });

  it('reports each heartbeat by job, a job that never ran as a day old', () => {
    expect(value('HeartbeatAgeSeconds', { Job: 'sla-sweep' })).toBe(45);
    expect(value('JobErrors', { Job: 'sla-sweep' })).toBe(2);
    expect(value('HeartbeatAgeSeconds', { Job: 'outbox-relay' })).toBe(86_400);
  });

  it('reports dead-lettered jobs per queue and in total, skipping queues the driver cannot count', () => {
    expect(value('FailedJobs', { Queue: 'mail-outbound' })).toBe(3);
    expect(value('FailedJobs', { Queue: 'copycat-runner' })).toBe(0);
    expect(data.some((d) => d.dimensions?.Queue === 'bimasetu-inbound')).toBe(false);
    expect(value('FailedJobsTotal')).toBe(3);
  });
});

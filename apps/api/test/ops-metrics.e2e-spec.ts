import { DataSource } from 'typeorm';
import { OpsMetricsModule } from '../src/infrastructure/metrics/ops-metrics.module';
import { OpsMetricsHandler } from '../src/infrastructure/metrics/ops-metrics.handler';
import { METRICS, type MetricDatum, type Metrics } from '../src/infrastructure/metrics/metrics.port';
import { OutboxRelayHandler } from '../src/infrastructure/outbox/outbox-relay.handler';
import { AutomationModule } from '../src/modules/automation/automation.module';
import { SlaSweeperHandler } from '../src/modules/automation/sla-sweeper.handler';
import { TestApp, createTestApp } from './helpers/app';

/** PLAN 4.6: the every-minute ops metrics job reads real tables and queues; alarms and runbooks build on these. */
describe('Ops metrics', () => {
  let t: TestApp;
  let ds: DataSource;
  let published: MetricDatum[];

  beforeAll(async () => {
    t = await createTestApp([AutomationModule, OpsMetricsModule]);
    ds = t.app.get(DataSource);
    jest.spyOn(t.app.get<Metrics>(METRICS), 'put').mockImplementation((data) => {
      published = data;
    });
  });

  afterAll(async () => {
    await t?.app.close();
  });

  const collect = async () => {
    await t.app.get(OpsMetricsHandler).handle();
    return (name: string, dims?: Record<string, string>) =>
      published.find((d) => d.name === name && JSON.stringify(d.dimensions) === JSON.stringify(dims))?.value;
  };

  it('reports a job that never ran as stalled, then fresh once it heartbeats', async () => {
    await ds.query(`DELETE FROM ops_heartbeats`);
    let value = await collect();
    expect(value('HeartbeatAgeSeconds', { Job: 'sla-sweep' })).toBe(86_400);

    await t.app.get(SlaSweeperHandler).handle();
    await t.app.get(OutboxRelayHandler).handle();
    value = await collect();
    expect(value('HeartbeatAgeSeconds', { Job: 'sla-sweep' })).toBeLessThan(60);
    expect(value('JobErrors', { Job: 'sla-sweep' })).toBe(0);
    expect(value('HeartbeatAgeSeconds', { Job: 'outbox-relay' })).toBeLessThan(60);
  });

  it('measures the outbox lag from the oldest unrelayed row', async () => {
    // E2E FIXTURE - an outbox row that has waited 10 minutes (not a real event)
    await ds.query(
      `INSERT INTO outbox_events (destination, event_type, aggregate_type, aggregate_id, payload, created_at, attempts)
       VALUES ('notification', 'e2e.ops_lag', 'ticket', gen_random_uuid(), '{}', now() - interval '10 minutes', 6)`,
    );
    const value = await collect();
    expect(value('OutboxLagSeconds')).toBeGreaterThanOrEqual(600);
    expect(value('OutboxFailing')).toBeGreaterThanOrEqual(1);
    await ds.query(`DELETE FROM outbox_events WHERE event_type = 'e2e.ops_lag'`);
  });

  it('reports dead-lettered jobs for every queue and the review backlog', async () => {
    const value = await collect();
    expect(value('FailedJobs', { Queue: 'mail-outbound' })).toEqual(expect.any(Number));
    expect(value('FailedJobsTotal')).toEqual(expect.any(Number));
    expect(value('UnmatchedMailPending')).toEqual(expect.any(Number));
    expect(value('CopycatFailures15m')).toEqual(expect.any(Number));
  });
});

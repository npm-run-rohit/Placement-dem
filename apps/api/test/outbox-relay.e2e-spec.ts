import { DataSource } from 'typeorm';
import { OutboxRelayHandler } from '../src/infrastructure/outbox/outbox-relay.handler';
import { TestApp, createTestApp } from './helpers/app';
import { maxQueryOverlap } from './helpers/pg-overlap';

/**
 * The relay marks a whole batch published in one transaction. It must not run those UPDATEs concurrently on
 * the transaction's single connection (pg deprecates it and pg@9 rejects it).
 */
describe('Outbox relay', () => {
  let t: TestApp;
  let ds: DataSource;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('publishes a batch without overlapping queries on one connection', async () => {
    for (let i = 0; i < 3; i++) {
      await ds.query(
        `INSERT INTO outbox_events (destination, event_type, aggregate_type, aggregate_id, payload) VALUES ('bus', 'e2e.relay_check', 'ticket', uuid_generate_v4(), '{}')`,
      );
    }
    const maxOverlap = await maxQueryOverlap(async () => {
      for (let tick = 0; tick < 50; tick++) {
        const [{ n }] = await ds.query(
          `SELECT count(*)::int AS n FROM outbox_events WHERE published_at IS NULL`,
        );
        if (!n) break;
        await t.app.get(OutboxRelayHandler).handle();
      }
    });
    expect(maxOverlap).toBe(1);
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'e2e.relay_check' AND published_at IS NULL`,
    );
    expect(n).toBe(0);
  });
});

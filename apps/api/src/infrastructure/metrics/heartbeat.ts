import type { DataSource } from 'typeorm';

/**
 * Last successful run of a repeating job and how many items it could not process (PLAN 4.6). Ops metrics turn
 * the age into "SLA engine / outbox relay stalled" alarms, whichever worker task ran the job.
 */
export async function recordHeartbeat(ds: DataSource, name: string, errors = 0) {
  await ds.query(
    `INSERT INTO ops_heartbeats (name, at, errors) VALUES ($1, now(), $2)
       ON CONFLICT (name) DO UPDATE SET at = excluded.at, errors = excluded.errors`,
    [name, errors],
  );
}

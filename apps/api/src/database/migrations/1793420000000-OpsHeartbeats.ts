import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ops heartbeats (PLAN 4.6): the last successful run of each repeating job (SLA sweep, outbox relay) and its
 * error count, read by the ops metrics job for the "stalled" alarms. One row per job, overwritten each run.
 */
export class OpsHeartbeats1793420000000 implements MigrationInterface {
  name = 'OpsHeartbeats1793420000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "ops_heartbeats" ("name" text PRIMARY KEY, "at" timestamptz NOT NULL, "errors" int NOT NULL DEFAULT 0)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "ops_heartbeats"`);
  }
}
